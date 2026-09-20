#!/usr/bin/env node
// The half of the documentation checks whose source of truth is the
// database rather than the repo.
//
// These ride the throwaway Postgres that db-lint already builds from
// every migration, next to scripts/check-schema-docs.mjs, and run under
// the same migrations-changed gate -- which is the right gate, because a
// diagram of the schema, a list of scheduled jobs and a dashboard's
// column references can only go stale on a PR that changes a migration.
//
// Column-level diagram checking was considered and rejected: deciding
// which audit columns are convention and which are substance is taste,
// and an ignore list for created_at/updated_at would have hidden a real
// omission (conversations.updated_at, which docs/monitoring.md leans on).
// Entities are unambiguous; columns are not.

import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

const DATA_MODEL = 'docs/data-model.md'
const MONITORING = 'docs/monitoring.md'
const ARCHITECTURE = 'docs/architecture.md'
const DASHBOARD = 'ops/growdy-watch/index.html'
const DB_URL = process.env.SUPABASE_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'

const NUMERALS = [
  'zero', 'one', 'two', 'three', 'four', 'five', 'six',
  'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve',
]

// ------------------------------------------------------------ diagram

/** Entity names from the live ER diagram, lowercased. */
export function diagramEntities(text) {
  const live = text.split(/^## History/m)[0]
  const block = live.match(/```mermaid\n([\s\S]*?)```/)
  if (!block) throw new Error(`no mermaid block found in ${DATA_MODEL}`)
  return new Set([...block[1].matchAll(/^\s{4}([A-Z_]+)\s*\{/gm)].map((m) => m[1].toLowerCase()))
}

/**
 * docs/data-model.md opens by claiming "the full set of tables and how
 * they relate", which is a falsifiable claim about pg_class.
 */
export function auditDiagram(tables, drawn) {
  const failures = []

  for (const table of tables) {
    if (!drawn.has(table)) {
      failures.push(
        `${DATA_MODEL}: public.${table} exists and the diagram does not show it.\n` +
          `    The page opens by claiming "the full set of tables and how they relate".`,
      )
    }
  }
  for (const entity of drawn) {
    if (!tables.includes(entity)) {
      failures.push(
        `${DATA_MODEL}: the diagram draws ${entity.toUpperCase()}, which is not a table in public.\n` +
          `    Dropped or renamed tables leave their box behind.`,
      )
    }
  }

  return failures
}

// --------------------------------------------------------------- cron

/**
 * Job names the docs mention. Shaped rather than positional: a scheduled
 * job here is named `something-hourly` or `something-6h`, and matching
 * on that shape means prose can be reworded around it freely.
 */
export function documentedJobs(text) {
  return new Set(
    [...text.matchAll(/`([a-z][a-z0-9-]*-(?:hourly|daily|\d+h))`/g)].map((m) => m[1]),
  )
}

export function auditCron(jobs, monitoring, architecture) {
  const failures = []
  const named = documentedJobs(monitoring)
  const live = new Set(jobs.map(([jobname]) => jobname))

  for (const jobname of live) {
    if (!named.has(jobname)) {
      failures.push(
        `${MONITORING}: the scheduled job ${jobname} runs and is documented nowhere.\n` +
          `    Section 6 lists what to check when something silently stops running.`,
      )
    }
  }
  for (const jobname of named) {
    if (!live.has(jobname)) {
      failures.push(
        `${MONITORING}: names a scheduled job ${jobname} that does not exist.\n` +
          `    Someone will go looking for its run history and find nothing.`,
      )
    }
  }

  const counted = monitoring.match(/\*(\w+)\* scheduled jobs/)
  if (counted && counted[1].toLowerCase() !== NUMERALS[live.size]) {
    failures.push(
      `${MONITORING}: says "${counted[1]} scheduled jobs" and there are ${live.size}.`,
    )
  }

  // The architecture diagram counts them by cadence rather than by name.
  const cadence = architecture.match(/(\d+) hourly \+ (\d+) six-hourly/)
  if (cadence) {
    const hourly = jobs.filter(([, schedule]) => schedule.trim() === '0 * * * *').length
    const sixHourly = jobs.filter(([, schedule]) => schedule.trim() === '0 */6 * * *').length
    const [, saidHourly, saidSix] = cadence
    if (Number(saidHourly) !== hourly || Number(saidSix) !== sixHourly || hourly + sixHourly !== jobs.length) {
      failures.push(
        `${ARCHITECTURE}: says "${saidHourly} hourly + ${saidSix} six-hourly" and the database has\n` +
          `    ${hourly} hourly + ${sixHourly} six-hourly, out of ${jobs.length} scheduled jobs in total.`,
      )
    }
  }

  return failures
}

// ---------------------------------------------------------- dashboard

/** `table.column` pairs named in the dashboard's category hints. */
export function dashboardColumnRefs(html) {
  const block = html.match(/var CATEGORIES = \[([\s\S]*?)\n\s*\];/)
  if (!block) throw new Error(`no CATEGORIES array found in ${DASHBOARD}`)
  return [...block[1].matchAll(/\b([a-z_]+)\.([a-z_]+)\b/g)].map((m) => ({ table: m[1], column: m[2] }))
}

/**
 * The dashboard says which column each signal comes from. A dropped
 * column leaves a card that queries nothing, and the card keeps
 * rendering.
 *
 * Only references whose table half is a real relation are checked, which
 * is what keeps "docs/monitoring.md" and "console.error" out of it
 * without an allowlist anybody has to maintain.
 */
export function auditDashboard(refs, columnsByTable) {
  const failures = []

  for (const { table, column } of refs) {
    const columns = columnsByTable[table]
    if (!columns) continue
    if (!columns.includes(column)) {
      failures.push(
        `${DASHBOARD}: a card reads "${table}.${column}", and ${table} has no ${column} column.\n` +
          `    Columns on ${table}: ${columns.join(', ')}.\n` +
          `    The card still renders; it just measures nothing.`,
      )
    }
  }

  return failures
}

// --------------------------------------------------------------- main

function query(sql) {
  const out = execFileSync('psql', [DB_URL, '-At', '-F', '\t', '-c', sql], { encoding: 'utf8' })
  return out.trim() ? out.trim().split('\n').map((line) => line.split('\t')) : []
}

function main() {
  const tables = query(`
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
    order by c.relname
  `).map(([name]) => name)

  const columns = query(`
    select c.relname, string_agg(a.attname, ',' order by a.attnum)
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
    where n.nspname = 'public' and c.relkind in ('r', 'v', 'm')
    group by c.relname
  `)
  const columnsByTable = Object.fromEntries(columns.map(([table, list]) => [table, list.split(',')]))

  const jobs = query('select jobname, schedule from cron.job order by jobname')

  const monitoring = readFileSync(MONITORING, 'utf8')
  const architecture = readFileSync(ARCHITECTURE, 'utf8')

  const failures = [
    ...auditDiagram(tables, diagramEntities(readFileSync(DATA_MODEL, 'utf8'))),
    ...auditCron(jobs, monitoring, architecture),
    ...auditDashboard(dashboardColumnRefs(readFileSync(DASHBOARD, 'utf8')), columnsByTable),
  ]

  if (failures.length > 0) {
    console.error('\nDocumentation check failed against the schema:\n')
    for (const failure of failures) console.error(`  - ${failure}\n`)
    console.error(
      'Each of these is a sentence or a diagram that the database disagrees with.\n' +
        'See CONTRIBUTING.md, "CI".\n',
    )
    process.exit(1)
  }

  console.log(
    `Schema-backed documentation check passed. ${tables.length} tables drawn, ` +
      `${jobs.length} scheduled jobs documented.`,
  )
}

// `node -e` and some loaders leave argv[1] unset; a module imported
// for its exports must not run main() as a side effect either way.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
