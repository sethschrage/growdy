#!/usr/bin/env node
// Checks that a tenancy policy resolves the caller once, not once per row.
//
// The shape that is wrong looks completely reasonable:
//
//   using (private.user_can_access_producer(producer_id))
//
// It passes review, it is correct, and it costs a function call per row
// because the argument is the row's own column. On weather_observations
// -- 143,588 rows -- that predicate measured 1,500 ms on its own, which
// is how a weather question came to spend eight model turns working
// around a 5-second statement timeout.
//
// The shape that is right resolves the caller once and then compares:
//
//   using (producer_id = (select private.current_producer_id()))
//
// 15 ms, and an index condition rather than a filter.
//
// It reads `public` and `storage`. It used to read `public` alone, which
// meant the three observation-photo policies -- the last three instances
// of the shape this file exists to prevent -- were invisible to it for
// three days. storage.objects is also the one table here that grows with
// every photo a producer takes, so it is the worst place to miss.
//
// Nothing else in this repo can catch a regression here. `db lint` type-
// checks PL/pgSQL bodies; Supabase's own performance advisor has an
// initplan lint but it did not fire on these, because the expensive part
// is a SECURITY DEFINER helper rather than a bare auth.uid(). And the
// cost is invisible until a table gets big: the same policy on a
// four-row table is free.

import { execFileSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

const DB_URL = process.env.SUPABASE_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'

/** Helpers that take a row's column and must not appear in a policy. */
export const PER_ROW_HELPERS = [
  'private.user_can_access_producer',
  'private.user_can_access_parcel',
  'private.user_can_access_plot',
  'private.user_can_edit_parcel',
]

/**
 * @param policies rows of [table, policy name, expression]
 */
export function auditPolicies(policies) {
  const failures = []

  for (const [table, name, expression] of policies) {
    if (!expression) continue

    const helper = PER_ROW_HELPERS.find((fn) => expression.includes(`${fn}(`))
    if (helper) {
      failures.push(
        `${table} / "${name}": calls ${helper}() with a column, so it runs once per row.\n` +
          `    Compare against the caller instead, resolved once:\n` +
          `      using (producer_id = (select private.current_producer_id()))\n` +
          `    Measured on 143,588 rows: 1,500ms this way, 15ms the other.`,
      )
      continue
    }

    // Supabase's own initplan advice, for the same reason: a bare
    // auth.uid() is re-evaluated per row, a wrapped one is not.
    if (/auth\.uid\(\)/.test(expression) && !/select\s+auth\.uid\(\)/i.test(expression)) {
      failures.push(
        `${table} / "${name}": calls auth.uid() directly, which re-evaluates per row.\n` +
          `    Wrap it: (select auth.uid()).`,
      )
    }
  }

  return failures
}

function main() {
  const out = execFileSync(
    'psql',
    [
      DB_URL,
      '-At',
      '-F',
      '\t',
      '-c',
      `select c.relname, p.polname,
              coalesce(pg_get_expr(p.polqual, p.polrelid), '') || ' ' || coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '')
       from pg_policy p
       join pg_class c on c.oid = p.polrelid
       join pg_namespace n on n.oid = c.relnamespace
       where n.nspname in ('public', 'storage')
       order by c.relname, p.polname`,
    ],
    { encoding: 'utf8' },
  )
  const policies = out.trim() ? out.trim().split('\n').map((line) => line.split('\t')) : []
  const failures = auditPolicies(policies)

  if (failures.length > 0) {
    console.error('\nRow-level security shape check failed:\n')
    for (const failure of failures) console.error(`  - ${failure}\n`)
    console.error(
      'A policy that calls a function on every row is correct and slow, and the slowness\n' +
        'only shows up once a table is large -- by which point a query times out instead of\n' +
        'returning. See docs/decisions/0036-rls-predicates-are-evaluated-once.md.\n',
    )
    process.exit(1)
  }

  console.log(`Row-level security shape check passed. ${policies.length} policies resolve the caller once.`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
