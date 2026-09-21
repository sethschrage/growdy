#!/usr/bin/env node
// Checks that every Edge Function still authorizes its caller, and does it
// before it does anything expensive.
//
// `verify_jwt` is deliberately false on all six functions so each can
// answer its own CORS preflight (supabase/functions/_shared/cors.ts, and
// 0020). That means the Supabase gateway checks nothing whatsoever, and
// the first few lines of each handler are the entire access control.
//
// They were not always there. Until #238, `chat` answered OPTIONS and went
// straight to building a prompt and calling Anthropic, so a POST carrying
// no Authorization header and no apikey reached the model on this
// project's key -- confirmed by a live curl that came back with a real
// Anthropic request id. 0020 had claimed for six days that chat
// "authorizes itself", which was true of a pattern and false of the code.
//
// A test cannot catch the regression that matters here, because the
// regression is an ORDERING: the guard still present, still correct, and
// moved below the first thing that spends money. That is what this reads.
//
// It reads the handler only -- everything from `Deno.serve(` on. `chat`
// has four `await fetch(` calls in helper functions defined above its
// handler, and a check that did not know the difference would fail on
// them forever and get switched off.

import { readFileSync, readdirSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

const FUNCTIONS = 'supabase/functions'

/**
 * The three a browser calls. Each must resolve its caller to a producer
 * before it does anything else.
 */
export const BROWSER_FACING = ['chat', 'ingest-weather', 'add-weather-source']

/**
 * The three pg_cron calls. These have no producer -- the caller is
 * Postgres -- and authorize with a trigger token instead (0020, and
 * 20260921080000, which made that token short-lived).
 */
export const CRON_DRIVEN = [
  'sync-scheduled-weather',
  'scan-conversations-for-observations',
  'embed-scheduled-memory',
]

/** Where the request handler starts. Everything above it is helpers. */
function handlerOf(source) {
  const at = source.indexOf('Deno.serve(')
  return at === -1 ? null : source.slice(at)
}

/**
 * @param sources rows of [functionName, source]
 */
export function auditGuards(sources) {
  const failures = []

  for (const [name, source] of sources) {
    const handler = handlerOf(source)
    if (!handler) {
      failures.push(`${name}: no Deno.serve() handler found, so nothing here could be checked.`)
      continue
    }

    const optionsAt = handler.search(/req\.method\s*===\s*["']OPTIONS["']/)

    if (BROWSER_FACING.includes(name)) {
      const guardAt = handler.indexOf('resolveProducerId(')
      if (guardAt === -1) {
        failures.push(
          `${name}: handler never calls resolveProducerId().\n` +
            `    verify_jwt is false on this function, so nothing else is checking who is calling.`,
        )
        continue
      }
      if (!handler.includes('unauthorizedResponse()')) {
        failures.push(`${name}: resolves a producer but never returns unauthorizedResponse().`)
      }
      if (optionsAt === -1) {
        failures.push(
          `${name}: handler does not answer OPTIONS.\n` +
            `    It needs to, before the guard -- a preflight cannot carry credentials,\n` +
            `    so guarding it turns every browser call into a network failure.`,
        )
      } else if (optionsAt > guardAt) {
        failures.push(
          `${name}: the OPTIONS reply comes after the guard.\n` +
            `    A CORS preflight carries no Authorization header, so it would be refused\n` +
            `    and the real request never sent.`,
        )
      }

      // The first thing in the handler that costs money or reads the
      // body. The guard has to be above it.
      const spends = [/await\s+fetch\(/, /await\s+req\.json\(\)/]
        .map((re) => handler.search(re))
        .filter((at) => at !== -1)
      const firstSpend = spends.length ? Math.min(...spends) : -1
      if (firstSpend !== -1 && firstSpend < guardAt) {
        failures.push(
          `${name}: the handler reads the body or calls out before resolveProducerId().\n` +
            `    That is the shape #238 fixed: the check was not missing, it was late.`,
        )
      }
      continue
    }

    if (CRON_DRIVEN.includes(name)) {
      if (!/X-Cron-Secret/i.test(handler)) {
        failures.push(`${name}: never reads the X-Cron-Secret header.`)
      }
      if (!source.includes('p_trigger_secret')) {
        failures.push(
          `${name}: never passes a trigger token to a verifier.\n` +
            `    The token is checked in the database by private.cron_token_valid().`,
        )
      }
      if (handler.includes('resolveProducerId(')) {
        failures.push(
          `${name}: calls resolveProducerId(), but its caller is Postgres and has no producer.\n` +
            `    It would refuse every scheduled run.`,
        )
      }
      continue
    }

    failures.push(
      `${name}: is neither in BROWSER_FACING nor CRON_DRIVEN.\n` +
        `    A new function has to say which it is, because the two authorize differently\n` +
        `    and a function that does neither authorizes not at all.`,
    )
  }

  return failures
}

/**
 * Separately: that every function these lists name is still there.
 *
 * Its own function because it is a different question. auditGuards asks
 * whether what it was handed is correct; this asks whether it was handed
 * everything -- and a check that conflated the two could not be given a
 * single function to look at without complaining about the other five.
 *
 * @param names the function directories that actually exist
 */
export function auditCompleteness(names) {
  const present = new Set(names)
  return [...BROWSER_FACING, ...CRON_DRIVEN]
    .filter((name) => !present.has(name))
    .map((name) => `${name}: listed here but missing from ${FUNCTIONS}/.`)
}

function main() {
  const names = readdirSync(FUNCTIONS, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('_'))
    .map((entry) => entry.name)

  const sources = names.map((name) => [name, readFileSync(`${FUNCTIONS}/${name}/index.ts`, 'utf8')])
  const failures = [...auditGuards(sources), ...auditCompleteness(names)]

  if (failures.length > 0) {
    console.error('\nEdge Function guard check failed:\n')
    for (const failure of failures) console.error(`  - ${failure}\n`)
    console.error(
      'verify_jwt is false on every function here so each can answer its own CORS preflight,\n' +
        'which means these few lines are the whole of the access control. See\n' +
        'docs/decisions/0020-scheduled-weather-sync.md and its 2026-09-21 updates.\n',
    )
    process.exit(1)
  }

  console.log(`Edge Function guard check passed. ${sources.length} functions authorize their caller.`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
