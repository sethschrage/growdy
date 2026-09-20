// The schema-backed doc checks, tested without a schema: the parsers get
// the real documents, the catalog side gets fixtures. That split is
// deliberate -- the parsers are what breaks when someone reformats a
// diagram, and they are the half no database can verify.
//
// Run with: node --test scripts/check-docs-db.test.mjs

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  auditCron,
  auditDashboard,
  auditDiagram,
  dashboardColumnRefs,
  diagramEntities,
  documentedJobs,
} from './check-docs-db.mjs'

// ------------------------------------------------------------ diagram

test('the live ER diagram parses, and history diagrams are ignored', () => {
  // docs/data-model.md keeps every superseded diagram under ## History,
  // so a parser that reads the whole file sees tables that were dropped
  // months ago and calls the current one wrong.
  const entities = diagramEntities(readFileSync('docs/data-model.md', 'utf8'))
  assert.ok(entities.has('producers'), 'expected the live diagram to draw producers')
  assert.ok(entities.has('plot_rows'))
  assert.ok(!entities.has('parcel_shares'), 'parcel_shares was dropped and only exists in ## History')
  assert.ok(entities.size >= 15, `only parsed ${entities.size} entities`)
})

test('a file whose live section has lost its diagram is an error, not a history read', () => {
  // If the live diagram is ever removed, reading the next mermaid block
  // down would silently check the schema against a superseded one and
  // report a long list of tables that "do not exist".
  assert.throws(
    () => diagramEntities('# Data model\n\n## History\n\n```mermaid\nerDiagram\n    OLD_TABLE {\n    }\n```\n'),
    /no mermaid block found/,
  )
})

test('a table the diagram does not draw fails', () => {
  const failures = auditDiagram(['plots', 'app_status'], new Set(['plots']))
  assert.equal(failures.length, 1)
  assert.match(failures[0], /public\.app_status exists and the diagram does not show it/)
})

test('a box for a table that no longer exists fails', () => {
  const failures = auditDiagram(['plots'], new Set(['plots', 'parcel_shares']))
  assert.equal(failures.length, 1)
  assert.match(failures[0], /draws PARCEL_SHARES, which is not a table in public/)
})

test('a diagram that matches the catalog passes', () => {
  assert.deepEqual(auditDiagram(['plots', 'parcels'], new Set(['plots', 'parcels'])), [])
})

// --------------------------------------------------------------- cron

const MONITORING = 'three jobs (`sync-weather-sources-hourly`, `embed-producer-memory-6h`) ' +
  'and the *two* scheduled jobs run fine'
const ARCHITECTURE = 'Cron["pg_cron + pg_net<br/>1 hourly + 1 six-hourly schedules"]'

test('job names are recognised by shape, so prose can be reworded', () => {
  const named = documentedJobs('`sync-weather-sources-hourly` and `embed-producer-memory-6h` and `succeeded`')
  assert.deepEqual([...named].sort(), ['embed-producer-memory-6h', 'sync-weather-sources-hourly'])
})

test('a job that runs and is documented nowhere fails', () => {
  const jobs = [
    ['sync-weather-sources-hourly', '0 * * * *'],
    ['embed-producer-memory-6h', '0 */6 * * *'],
    ['new-thing-daily', '0 3 * * *'],
  ]
  const failures = auditCron(jobs, MONITORING, ARCHITECTURE)
  assert.ok(failures.some((f) => /new-thing-daily runs and is documented nowhere/.test(f)))
})

test('a documented job that does not exist fails', () => {
  const jobs = [['sync-weather-sources-hourly', '0 * * * *']]
  const failures = auditCron(jobs, MONITORING, ARCHITECTURE)
  assert.ok(failures.some((f) => /names a scheduled job embed-producer-memory-6h that does not exist/.test(f)))
})

test('the counts in both documents have to match the schedules', () => {
  const jobs = [
    ['sync-weather-sources-hourly', '0 * * * *'],
    ['embed-producer-memory-6h', '0 */6 * * *'],
  ]
  assert.deepEqual(auditCron(jobs, MONITORING, ARCHITECTURE), [])

  const three = [...jobs, ['scan-conversations-for-observations-6h', '0 */6 * * *']]
  const doc = `${MONITORING} \`scan-conversations-for-observations-6h\``
  const failures = auditCron(three, doc, ARCHITECTURE)
  assert.ok(failures.some((f) => /says "two scheduled jobs" and there are 3/.test(f)), failures.join(' | '))
  assert.ok(failures.some((f) => /says "1 hourly \+ 1 six-hourly" and the database has\n {4}1 hourly \+ 2 six-hourly/.test(f)))
})

test('a schedule in neither bucket is not silently uncounted', () => {
  // "1 hourly + 1 six-hourly" adds up to two; a third job on some other
  // cadence would otherwise be invisible in the architecture diagram.
  const jobs = [
    ['sync-weather-sources-hourly', '0 * * * *'],
    ['embed-producer-memory-6h', '0 */6 * * *'],
    ['odd-one-hourly', '*/5 * * * *'],
  ]
  const doc = `${MONITORING} \`odd-one-hourly\``.replace('*two*', '*three*')
  const failures = auditCron(jobs, doc, ARCHITECTURE)
  assert.ok(failures.some((f) => /out of 3 scheduled jobs in total/.test(f)))
})

// ---------------------------------------------------------- dashboard

test('the dashboard\'s column references parse out of the real file', () => {
  const refs = dashboardColumnRefs(readFileSync('ops/growdy-watch/index.html', 'utf8'))
  const pairs = refs.map((r) => `${r.table}.${r.column}`)
  assert.ok(pairs.includes('data_sources.last_error'), `parsed: ${pairs.join(' ')}`)
  assert.ok(pairs.length >= 3)
})

test('a card reading a column that was dropped fails', () => {
  const failures = auditDashboard(
    [{ table: 'observations', column: 'status' }],
    { observations: ['id', 'note'] },
  )
  assert.equal(failures.length, 1)
  assert.match(failures[0], /observations has no status column/)
})

test('a reference whose table is not a relation is not a column reference', () => {
  // "docs/monitoring.md" and "console.error" both look like table.column
  // to a regex. Requiring the table half to exist is what keeps them out
  // without a hand-maintained allowlist.
  assert.deepEqual(
    auditDashboard(
      [{ table: 'monitoring', column: 'md' }, { table: 'console', column: 'error' }],
      { observations: ['id'] },
    ),
    [],
  )
})

test('a card reading a column that exists passes', () => {
  assert.deepEqual(
    auditDashboard([{ table: 'observations', column: 'note' }], { observations: ['id', 'note'] }),
    [],
  )
})
