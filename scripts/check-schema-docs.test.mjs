// The ratchet and the exclusion parser, tested without a database.
//
// The parser is a regex over TypeScript and the ratchet is arithmetic
// that only ever runs in CI, where nobody reads the output of a passing
// run. Both can stop working in complete silence.
//
// Run with: node --test scripts/check-schema-docs.test.mjs

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  CHAT_FN,
  auditColumns,
  auditRelations,
  baselineText,
  countByRelation,
  readExclusions,
} from './check-schema-docs.mjs'

test('a described relation with no table comment fails', () => {
  const failures = auditRelations([['parcels', 't'], ['trials', 'f']], new Set())
  assert.equal(failures.length, 1)
  assert.match(failures[0], /^trials: described to the model but has no COMMENT ON/)
  // The message has to carry both ways out, or it reads as "write a
  // comment" when the right answer is often "exclude it".
  assert.match(failures[0], /COMMENT ON TABLE public\.trials/)
  assert.match(failures[0], /NOT_DESCRIBED/)
})

test('an excluded relation may go undescribed -- that is the point of excluding it', () => {
  assert.deepEqual(auditRelations([['audit_log', 'f']], new Set(['audit_log'])), [])
})

test('an exclusion that names nothing fails', () => {
  // After a rename this entry stops excluding anything and still looks
  // like a decision somebody made.
  const failures = auditRelations([['plots', 't']], new Set(['plotz']))
  assert.equal(failures.length, 1)
  assert.match(failures[0], /plotz: listed in NOT_DESCRIBED but no such relation exists/)
})

test('a column added without a comment fails, and is named', () => {
  const failures = auditColumns({ plots: 6 }, { plots: 5 }, () => ['id', 'parcel_id', 'vigor_score'])
  assert.equal(failures.length, 1)
  assert.match(failures[0], /plots: 6 columns without a COMMENT ON, baseline allows 5/)
  assert.match(failures[0], /vigor_score/)
})

test('a relation missing from the baseline entirely allows nothing', () => {
  // A new table's columns are measured against zero, not against silence.
  const failures = auditColumns({ trials: 2 }, {}, () => ['id', 'note'])
  assert.equal(failures.length, 1)
  assert.match(failures[0], /baseline allows 0/)
})

test('matching the baseline exactly passes', () => {
  assert.deepEqual(auditColumns({ plots: 5, parcels: 4 }, { plots: 5, parcels: 4 }), [])
})

test('documenting columns without lowering the baseline fails, with the file to paste', () => {
  // The half of the ratchet that makes it a ratchet. Slack left in the
  // ceiling is room for the backlog to climb back to it.
  const failures = auditColumns({ plots: 2 }, { plots: 5 })
  assert.equal(failures.length, 1)
  assert.match(failures[0], /the backlog shrank and the baseline did not: plots 5 -> 2/)
  assert.match(failures[0], /"plots": 2/)
})

test('a relation documented all the way to zero drops out of the baseline', () => {
  const failures = auditColumns({}, { parcels: 4 })
  assert.equal(failures.length, 1)
  assert.match(failures[0], /parcels 4 -> 0/)
  assert.doesNotMatch(failures[0], /"parcels"/)
})

test('growth and shrinkage in one run are reported separately', () => {
  const failures = auditColumns({ plots: 7, parcels: 1 }, { plots: 5, parcels: 4 })
  assert.equal(failures.length, 2)
  assert.match(failures[0], /plots: 7 columns/)
  assert.match(failures[1], /parcels 4 -> 1/)
})

test('the baseline file is sorted, so a regenerated one diffs cleanly', () => {
  assert.equal(
    baselineText({ plots: 5, audit_log: 11, parcels: 4 }),
    '{\n  "uncommentedColumns": {\n    "audit_log": 11,\n    "parcels": 4,\n    "plots": 5\n  }\n}\n',
  )
})

test('counting groups rows by relation', () => {
  assert.deepEqual(
    countByRelation([['plots', 'id'], ['plots', 'name'], ['parcels', 'id']]),
    { plots: 2, parcels: 1 },
  )
})

test('the exclusion list still parses out of the real function', () => {
  // This is the one that catches the regex drifting away from the
  // source it reads. If NOT_DESCRIBED is reformatted, this fails here
  // rather than silently describing eight tables nobody meant to
  // describe.
  const names = readExclusions(readFileSync(CHAT_FN, 'utf8'))
  assert.ok(names.length >= 5, `parsed only ${names.length} exclusions`)
  for (const expected of ['audit_log', 'profiles', 'pending_writes']) {
    assert.ok(names.includes(expected), `expected ${expected} among ${names.join(', ')}`)
  }
})

test('a missing or empty NOT_DESCRIBED throws rather than passing', () => {
  assert.throws(() => readExclusions('const SOMETHING_ELSE = {}'), /could not find NOT_DESCRIBED/)
  assert.throws(
    () => readExclusions('const NOT_DESCRIBED: Record<string, string> = {\n};'),
    /parsed as empty/,
  )
})
