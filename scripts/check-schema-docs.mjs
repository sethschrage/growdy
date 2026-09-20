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
// Three failures, in order of how much damage they do:
//
//   1. A described relation with no table comment. The model is told
//      the table exists and nothing about what it holds -- and since
//      the list is exclude-by-default, a new table lands here the
//      moment its migration applies.
//   2. A NOT_DESCRIBED entry naming a relation that no longer exists.
//      It looks like a decision and excludes nothing; after a rename it
//      silently stops working.
//   3. More uncommented columns than the recorded baseline. The
//      backlog can shrink and must never grow.
//
// The baseline exists because even after the migration that lands
// alongside this check documents the parcel/plot/row spine, 47 of the
// 125 columns the model sees have no comment. Blocking every PR until
// someone writes 47 comments would just get the check turned off. A
// ratchet lets the number fall without letting it rise.

import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'

const CHAT_FN = 'supabase/functions/chat/index.ts'
const BASELINE = 'scripts/schema-docs-baseline.json'
const DB_URL = process.env.SUPABASE_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'

/** The exclusion list, read from the function itself so there is one source of truth. */
function readExclusions() {
  const source = readFileSync(CHAT_FN, 'utf8')
  const block = source.match(/const NOT_DESCRIBED: Record<string, string> = \{([\s\S]*?)\n\};/)
  if (!block) throw new Error(`could not find NOT_DESCRIBED in ${CHAT_FN}`)
  const names = [...block[1].matchAll(/^\s{2}([a-z_]+):/gm)].map((m) => m[1])
  if (names.length === 0) throw new Error('NOT_DESCRIBED parsed as empty -- the regex probably drifted')
  return names
}

function query(sql) {
  const out = execFileSync('psql', [DB_URL, '-At', '-F', '\t', '-c', sql], { encoding: 'utf8' })
  return out.trim() ? out.trim().split('\n').map((line) => line.split('\t')) : []
}

const excluded = new Set(readExclusions())

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

const failures = []

// 1. A relation the model is told about, with nothing said about it.
//    Exclude-by-default means this catches every new table.
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

// 2. An exclusion that no longer excludes anything.
const live = new Set(relations.map(([name]) => name))
for (const name of excluded) {
  if (!live.has(name)) {
    failures.push(
      `${name}: listed in NOT_DESCRIBED but no such relation exists.\n` +
        `    A stale entry here silently stops excluding anything -- if it was renamed, rename it here too.`,
    )
  }
}

// 3. The ratchet.
const counts = {}
for (const [relname] of uncommentedColumns) {
  counts[relname] = (counts[relname] ?? 0) + 1
}

if (process.argv.includes('--update-baseline')) {
  writeFileSync(BASELINE, `${JSON.stringify({ uncommentedColumns: counts }, null, 2)}\n`)
  console.log(`baseline written: ${Object.values(counts).reduce((a, b) => a + b, 0)} uncommented columns`)
  process.exit(0)
}

const baseline = JSON.parse(readFileSync(BASELINE, 'utf8')).uncommentedColumns

for (const [relname, count] of Object.entries(counts)) {
  const allowed = baseline[relname] ?? 0
  if (count > allowed) {
    const columns = uncommentedColumns.filter(([r]) => r === relname).map(([, c]) => c)
    failures.push(
      `${relname}: ${count} columns without a COMMENT ON, baseline allows ${allowed}.\n` +
        `    Uncommented: ${columns.join(', ')}\n` +
        `    A migration that adds a column adds its comment in the same migration.`,
    )
  }
}

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
