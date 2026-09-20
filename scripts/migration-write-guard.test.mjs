// The guard runs on every Write and Edit in this repo, so its two
// failure modes are opposite and both bad: blocking work it has no
// business blocking, and quietly waving through the one thing it exists
// to stop.
//
// Run with: node --test scripts/migration-write-guard.test.mjs

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const GUARD = 'scripts/migration-write-guard.mjs'

const ANSWERED = [
  '-- Purpose: Producers rate vigour walking a row and want it back later.',
  "-- Columns: vigor_score -- 1 to 5, the producer's judgement, null if unrated.",
  '-- Relations: None new; hangs off plot_rows, which carries producer_id.',
  "-- Access: Inherited from plot_rows' existing producer_id policy.",
  '-- Chat: Described -- "which rows are weak" is what it exists to answer.',
  '-- Backfill: None. Existing rows stay null, which reads as never rated.',
  '',
].join('\n')

const ADD_COLUMN = 'alter table public.plot_rows add column vigor_score integer;\n'
const COMMENT = "comment on column public.plot_rows.vigor_score is '1-5 vigour.';\n"

/** Runs the guard the way the hook does, and reports how it answered. */
function guard(payload) {
  try {
    execFileSync('node', [GUARD], { input: JSON.stringify(payload), encoding: 'utf8' })
    return { blocked: false, message: '' }
  } catch (error) {
    return { blocked: error.status === 2, status: error.status, message: error.stderr ?? '' }
  }
}

const dir = mkdtempSync(join(tmpdir(), 'guard-'))
mkdirSync(join(dir, 'supabase', 'migrations'), { recursive: true })
const migration = join(dir, 'supabase', 'migrations', '20260921000000_add_vigor.sql')

test('writing an unexplained migration is blocked', () => {
  const result = guard({ tool_name: 'Write', tool_input: { file_path: migration, content: ADD_COLUMN } })
  assert.equal(result.blocked, true)
  assert.match(result.message, /does not answer Purpose, Columns, Relations, Access, Chat, Backfill/)
})

test('the block tells the agent to ask rather than to write the answers itself', () => {
  // The whole point. A message that only said "add six comments" would be
  // satisfied by inventing six comments.
  const result = guard({ tool_name: 'Write', tool_input: { file_path: migration, content: ADD_COLUMN } })
  assert.match(result.message, /answers are not yours to compose/)
  assert.match(result.message, /in the conversation/)
})

test('writing an answered migration goes through', () => {
  const result = guard({
    tool_name: 'Write',
    tool_input: { file_path: migration, content: ANSWERED + ADD_COLUMN + COMMENT },
  })
  assert.equal(result.blocked, false, result.message)
})

test('an edit that sneaks a column into an answered migration is blocked', () => {
  // Write is the obvious path; Edit is the one that would otherwise walk
  // straight past a guard that only watched Write.
  writeFileSync(migration, ANSWERED + ADD_COLUMN + COMMENT)
  const result = guard({
    tool_name: 'Edit',
    tool_input: {
      file_path: migration,
      old_string: COMMENT,
      new_string: 'alter table public.plot_rows add column undocumented_extra integer;\n',
    },
  })
  assert.equal(result.blocked, true)
  assert.match(result.message, /no COMMENT ON COLUMN/)
})

test('a migration that changes no structure is left alone', () => {
  const result = guard({
    tool_name: 'Write',
    tool_input: { file_path: migration, content: 'update public.plots set name = trim(name);\n' },
  })
  assert.equal(result.blocked, false)
})

test('every other file in the repo is none of its business', () => {
  const result = guard({
    tool_name: 'Write',
    tool_input: { file_path: 'app/src/data/vineyard.ts', content: 'create table nonsense' },
  })
  assert.equal(result.blocked, false)
})

test('a payload it cannot read lets the write through', () => {
  // A guard that fails closed on its own bug would make the repo
  // unwritable; CI is still behind it either way.
  let status = 0
  try {
    execFileSync('node', [GUARD], { input: 'not json at all', encoding: 'utf8' })
  } catch (error) {
    status = error.status
  }
  assert.equal(status, 0)
})

test('editing a migration that does not exist yet lets the write through', () => {
  const result = guard({
    tool_name: 'Edit',
    tool_input: {
      file_path: join(dir, 'supabase', 'migrations', '20260922000000_nothing_here.sql'),
      old_string: 'a',
      new_string: 'b',
    },
  })
  assert.equal(result.blocked, false)
})
