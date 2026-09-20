// The check that enforces the six questions is itself a pile of regexes
// over SQL, which is exactly the kind of thing that keeps passing after
// it has stopped working. If ADD COLUMN stops matching, every migration
// sails through and nothing anywhere says so.
//
// Run with: node --test scripts/check-migration-answers.test.mjs

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CHECK = 'scripts/check-migration-answers.mjs'
const dir = mkdtempSync(join(tmpdir(), 'migration-answers-'))

const HEADER = [
  '-- Purpose: Producers ask which rows were replanted after the frost.',
  '-- Columns: replanted_on -- local date, null means never replanted.',
  '-- Relations: None new; hangs off plot_rows, which carries producer_id.',
  '-- Access: Inherited from plot_rows\' existing producer_id policy.',
  '-- Chat: Described -- this is the question it exists to answer.',
  '-- Backfill: None. Existing rows read correctly as never replanted.',
  '',
].join('\n')

/** Runs the check over one migration, and reports how it went. */
function check(name, sql) {
  const file = join(dir, `${name}.sql`)
  writeFileSync(file, sql)
  try {
    execFileSync('node', [CHECK, file], { encoding: 'utf8' })
    return { failed: false, output: '' }
  } catch (error) {
    return { failed: true, output: `${error.stdout ?? ''}${error.stderr ?? ''}` }
  }
}

test('a migration that answers everything passes', () => {
  const result = check(
    'good',
    `${HEADER}alter table public.plot_rows add column replanted_on date;\n` +
      `comment on column public.plot_rows.replanted_on is 'Date replanted.';\n`,
  )
  assert.equal(result.failed, false)
})

test('an unexplained column fails, and says which questions went unanswered', () => {
  const result = check('bare', 'alter table public.plot_rows add column vigor_score integer;\n')
  assert.equal(result.failed, true)
  for (const tag of ['Purpose', 'Columns', 'Relations', 'Access', 'Chat', 'Backfill']) {
    assert.match(result.output, new RegExp(tag))
  }
})

test('the optional COLUMN keyword does not let a column through', () => {
  // Postgres accepts `add replanted_on date`; a check that only matched
  // "add column" would wave that one past.
  const result = check('no-keyword', 'alter table public.plot_rows add replanted_on date;\n')
  assert.equal(result.failed, true)
})

test('placeholders count as unanswered', () => {
  const result = check(
    'placeholder',
    '-- Purpose: TODO\n' +
      '-- Columns: n/a\n' +
      '-- Relations: Stands alone deliberately, nothing references it yet.\n' +
      '-- Access: x\n' +
      '-- Chat: Described, a producer will ask about this directly.\n' +
      '-- Backfill: None needed, the table is new and empty.\n' +
      'create table public.trials (id uuid primary key);\n' +
      "comment on table public.trials is 'Trial blocks.';\n",
  )
  assert.equal(result.failed, true)
  assert.match(result.output, /Purpose, Columns, Access answered with a placeholder/)
})

test('answers written below the first statement are not a header', () => {
  // A tag anywhere in the file would be trivially satisfiable by
  // pasting the block at the bottom, unread.
  const result = check(
    'late',
    'create table public.late (id uuid primary key);\n' +
      `${HEADER}comment on table public.late is 'Late.';\n`,
  )
  assert.equal(result.failed, true)
})

test('an answered migration still fails without the COMMENT ON', () => {
  // The explanation has to land in the schema, not only in the file --
  // the chat builds its description from the catalog, not from git.
  const result = check(
    'no-comment',
    `${HEADER}create table public.trials (id uuid primary key);\n`,
  )
  assert.equal(result.failed, true)
  assert.match(result.output, /no COMMENT ON/)
})

test('a constraint is not a column', () => {
  const result = check(
    'constraint',
    'alter table public.plots add constraint plots_name_not_blank check (length(name) > 0);\n',
  )
  assert.equal(result.failed, false)
})

test('a policy-only migration is left alone', () => {
  // Most migrations here change policies, functions or data. Demanding
  // the six questions of those would make the check noise.
  const result = check(
    'policy',
    'create policy plots_select on public.plots for select using (true);\n',
  )
  assert.equal(result.failed, false)
})

test('prose in the header cannot be mistaken for DDL', () => {
  // "we considered a create table here" is a sentence, not a statement.
  const result = check(
    'prose',
    '-- We considered a create table here and decided to add column later.\n' +
      'update public.plots set name = trim(name);\n',
  )
  assert.equal(result.failed, false)
})
