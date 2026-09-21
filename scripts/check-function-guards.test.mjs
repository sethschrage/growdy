// Run with: node --test scripts/check-function-guards.test.mjs

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { auditCompleteness, auditGuards, BROWSER_FACING, CRON_DRIVEN } from './check-function-guards.mjs'

/** A browser-facing handler in the shape the repo actually uses. */
function browserFn({ guard = true, optionsFirst = true, guardBeforeWork = true } = {}) {
  const options = 'if (req.method === "OPTIONS") { return new Response(null, { headers: corsHeaders }); }'
  const check = guard
    ? 'const producerId = await resolveProducerId(supabase); if (!producerId) return unauthorizedResponse();'
    : ''
  const work = 'const body = await req.json();'
  const lines = optionsFirst ? [options] : []
  if (guardBeforeWork) lines.push(check, work)
  else lines.push(work, check)
  if (!optionsFirst) lines.push(options)
  return `import { resolveProducerId } from "../_shared/supabaseClient.ts";\nDeno.serve(async (req) => {\n${lines.join('\n')}\n});`
}

test('the real functions pass', () => {
  // Not a fixture: if somebody moves a guard, this is what goes red.
  const names = readdirSync('supabase/functions', { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith('_'))
    .map((e) => e.name)
  const sources = names.map((n) => [n, readFileSync(`supabase/functions/${n}/index.ts`, 'utf8')])
  assert.deepEqual(auditGuards(sources), [])
})

test('a browser-facing handler with no guard fails', () => {
  const failures = auditGuards([['chat', browserFn({ guard: false })]])
  assert.equal(failures.length, 1)
  assert.match(failures[0], /never calls resolveProducerId/)
})

test('a guard that arrives after the work fails -- the #238 shape', () => {
  // The regression no unit test catches: the check is present, correct,
  // and below the first thing that costs money.
  const failures = auditGuards([['chat', browserFn({ guardBeforeWork: false })]])
  assert.ok(failures.some((f) => /reads the body or calls out before/.test(f)))
})

test('answering OPTIONS after the guard fails', () => {
  // A preflight carries no credentials, so guarding it turns every
  // browser call into a network failure.
  const failures = auditGuards([['chat', browserFn({ optionsFirst: false })]])
  assert.ok(failures.some((f) => /OPTIONS reply comes after the guard/.test(f)))
})

test('helpers above the handler are not mistaken for the request path', () => {
  // chat really does call fetch() four times in helpers defined above
  // Deno.serve. A check that did not know the difference would fail
  // forever and get switched off.
  const withHelper =
    'async function lookup() { const r = await fetch("https://example.test"); return r; }\n' +
    browserFn()
  assert.deepEqual(auditGuards([['chat', withHelper]]), [])
})

test('a cron function that resolves a producer fails', () => {
  const cron =
    'Deno.serve(async (req) => { const s = req.headers.get("X-Cron-Secret"); ' +
    'const p = await resolveProducerId(x); rpc({ p_trigger_secret: s }); });'
  const failures = auditGuards([['sync-scheduled-weather', cron]])
  assert.ok(failures.some((f) => /caller is Postgres and has no producer/.test(f)))
})

test('a cron function that sends no token fails', () => {
  const cron = 'Deno.serve(async (req) => { const s = req.headers.get("X-Cron-Secret"); });'
  const failures = auditGuards([['embed-scheduled-memory', cron]])
  assert.ok(failures.some((f) => /never passes a trigger token/.test(f)))
})

test('a function in neither list fails, rather than passing silently', () => {
  // The default for something new has to be "say which kind you are",
  // not "nothing checked you".
  const failures = auditGuards([['brand-new-thing', browserFn()]])
  assert.equal(failures.length, 1)
  assert.match(failures[0], /neither in BROWSER_FACING nor CRON_DRIVEN/)
})

test('a listed function that disappears fails', () => {
  const failures = auditCompleteness([])
  assert.equal(failures.length, BROWSER_FACING.length + CRON_DRIVEN.length)
  assert.ok(failures.every((f) => /missing from/.test(f)))
})

test('completeness passes when every listed function is present', () => {
  assert.deepEqual(auditCompleteness([...BROWSER_FACING, ...CRON_DRIVEN]), [])
})

test('a file with no Deno.serve fails rather than passing vacuously', () => {
  const failures = auditGuards([['chat', 'export const nothing = 1;']])
  assert.equal(failures.length, 1)
  assert.match(failures[0], /no Deno\.serve\(\) handler/)
})
