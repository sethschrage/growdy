#!/usr/bin/env node
// Checks that the database still describes itself well enough for the
// chat to reason about it.
//
// The chat's system prompt is generated at request time from the
// database's own COMMENT ON values (supabase/functions/chat/index.ts).
// That removed the risk of a stale hand-written description and
// replaced it with a silent one: a column with no comment renders as a
// perfectly well-formed line with no meaning attached, and nothing
// anywhere errors. Roughly a third of the columns the model is handed
// are in exactly that state.
//
// `supabase db lint` does not catch this. It is plpgsql_check -- it
// type-checks PL/pgSQL function bodies and has never looked at a
// comment in its life. This is the check that does.
//
// It runs against the throwaway Postgres that db-lint already starts
// with every migration applied, so it is checking what a fresh database
// would actually look like, not what someone remembered to write down.
//
// Four failures, in order of how much damage they do:
//
//   1. A described relation with no table comment. The model is told
//      the table exists and nothing about what it holds -- and since
//      the list is exclude-by-default, a new table lands here the
//      moment its migration applies.
//   2. A NOT_DESCRIBED entry naming a relation that no longer exists.
//      It looks like a decision and excludes nothing; after a rename it
//      silently stops working.
//   3. More uncommented columns than the recorded baseline.
//   4. Fewer uncommented columns than the recorded baseline -- which is
//      not a fault in the schema but in the file. The backlog fell and
//      the ceiling stayed where it was, and a ceiling nobody lowers is
//      just room for the backlog to climb back to it, by which point
//      nobody remembers it was ever lower.
//
// 3 and 4 together are what make this a ratchet rather than a cap. The
// baseline exists because even after the migration that lands alongside
// this check documents the parcel/plot/row spine, 47 of the 125 columns
// the model sees have no comment. Blocking every PR until someone
// writes 47 comments would just get the check turned off. A ratchet
// lets the number fall, and then holds it there.

import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

export const CHAT_FN = 'supabase/functions/chat/index.ts'
export const BASELINE = 'scripts/schema-docs-baseline.json'
const DB_URL = process.env.SUPABASE_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'

/** The exclusion list, read from the function itself so there is one source of truth. */
export function readExclusions(source) {
  const block = source.match(/const NOT_DESCRIBED: Record<string, string> = \{([\s\S]*?)\n\};/)
  if (!block) throw new Error(`could not find NOT_DESCRIBED in ${CHAT_FN}`)
  const names = [...block[1].matchAll(/^\s{2}([a-z_]+):/gm)].map((m) => m[1])
  if (names.length === 0) throw new Error('NOT_DESCRIBED parsed as empty -- the regex probably drifted')
  return names
}

/**
 * Relations the model is told about with nothing said about them, and
 * exclusions that no longer exclude anything.
 *
 * @param relations rows of [name, 't' | 'f'] -- whether it has a COMMENT ON
 * @param excluded  Set of names listed in NOT_DESCRIBED
 */
export function auditRelations(relations, excluded) {
  const failures = []

  // Exclude-by-default is what makes this catch every new table.
  for (const [name, hasComment] of relations) {
    if (!excluded.has(name) && hasComment !== 't') {
      failures.push(
        `${name}: described to the model but has no COMMENT ON.\n` +
          `    The model is told this table exists and nothing about what it holds. Either write\n` +
          `    "COMMENT ON TABLE public.${name} IS '...'" in the migration, or add it to NOT_DESCRIBED\n` +
          `    in ${CHAT_FN} with the reason it should stay out of the prompt.`,
      )
    }
  }

  const live = new Set(relations.map(([name]) => name))
  for (const name of excluded) {
    if (!live.has(name)) {
      failures.push(
        `${name}: listed in NOT_DESCRIBED but no such relation exists.\n` +
          `    A stale entry here silently stops excluding anything -- if it was renamed, rename it here too.`,
      )
    }
  }

  return failures
}

/** Uncommented columns per relation, from rows of [relname, attname]. */
export function countByRelation(uncommentedColumns) {
  const counts = {}
  for (const [relname] of uncommentedColumns) {
    counts[relname] = (counts[relname] ?? 0) + 1
  }
  return counts
}

/** The baseline file's contents for a given set of counts. */
export function baselineText(counts) {
  // countByRelation only ever produces positive counts, so a relation
  // documented all the way down simply has no key here and drops out.
  const sorted = Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)))
  return `${JSON.stringify({ uncommentedColumns: sorted }, null, 2)}\n`
}

/**
 * The ratchet, in both directions.
 *
 * @param counts     uncommented columns per relation, as measured
 * @param baseline   what the recorded file allows
 * @param columnsFor (relname) => the uncommented column names, for the message
 */
export function auditColumns(counts, baseline, columnsFor = () => []) {
  const failures = []
  const relations = [...new Set([...Object.keys(counts), ...Object.keys(baseline)])].sort()

  const shrank = []
  for (const relname of relations) {
    const count = counts[relname] ?? 0
    const allowed = baseline[relname] ?? 0
    if (count > allowed) {
      failures.push(
        `${relname}: ${count} columns without a COMMENT ON, baseline allows ${allowed}.\n` +
          `    Uncommented: ${columnsFor(relname).join(', ')}\n` +
          `    A migration that adds a column adds its comment in the same migration.`,
      )
    } else if (count < allowed) {
      shrank.push(`${relname} ${allowed} -> ${count}`)
    }
  }

  // Not a defect in the schema -- the opposite. But the person who just
  // wrote those comments is the only one who will ever be in a position
  // to lower the ceiling, so they are asked to, here, while they are
  // still holding the keyboard.
  if (shrank.length > 0) {
    const file = baselineText(counts)
      .trimEnd()
      .split('\n')
      .map((line) => `      ${line}`)
      .join('\n')
    failures.push(
      `the backlog shrank and the baseline did not: ${shrank.join(', ')}.\n` +
        `    Lock it in, or the slack is just room to grow back. Replace ${BASELINE} with:\n\n` +
        `${file}\n\n` +
        `    (or run "node scripts/check-schema-docs.mjs --update-baseline" against a local stack).`,
    )
  }

  return failures
}

function query(sql) {
  const out = execFileSync('psql', [DB_URL, '-At', '-F', '\t', '-c', sql], { encoding: 'utf8' })
  return out.trim() ? out.trim().split('\n').map((line) => line.split('\t')) : []
}

function main() {
  const excluded = new Set(readExclusions(readFileSync(CHAT_FN, 'utf8')))

  const relations = query(`
    select c.relname, obj_description(c.oid) is not null as has_comment
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'v', 'm')
    order by c.relname
  `)

  const uncommentedColumns = query(`
    select c.relname, a.attname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
    where n.nspname = 'public'
      and c.relkind in ('r', 'v', 'm')
      and col_description(c.oid, a.attnum) is null
    order by c.relname, a.attnum
  `)

  const counts = countByRelation(uncommentedColumns)

  if (process.argv.includes('--update-baseline')) {
    writeFileSync(BASELINE, baselineText(counts))
    console.log(`baseline written: ${Object.values(counts).reduce((a, b) => a + b, 0)} uncommented columns`)
    return
  }

  const baseline = JSON.parse(readFileSync(BASELINE, 'utf8')).uncommentedColumns
  const failures = [
    ...auditRelations(relations, excluded),
    ...auditColumns(counts, baseline, (relname) =>
      uncommentedColumns.filter(([r]) => r === relname).map(([, c]) => c),
    ),
  ]

  if (failures.length > 0) {
    console.error('\nSchema documentation check failed:\n')
    for (const failure of failures) console.error(`  - ${failure}\n`)
    console.error(
      'The chat\'s description of the database is generated from these comments at request time,\n' +
        'so anything missing here is missing from what the model reasons with.\n' +
        'See docs/schema-change-questions.md.\n',
    )
    process.exit(1)
  }

  const total = Object.values(counts).reduce((a, b) => a + b, 0)
  const allowed = Object.values(baseline).reduce((a, b) => a + b, 0)
  console.log(
    `Schema documentation check passed. ${relations.length - excluded.size} of ${relations.length} ` +
      `relations described to the model; ${total} uncommented columns (baseline ${allowed}).`,
  )
}

// `node -e` and some loaders leave argv[1] unset; a module imported
// for its exports must not run main() as a side effect either way.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
