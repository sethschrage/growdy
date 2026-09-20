// Run with: node --test scripts/check-rls-shape.test.mjs

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { auditPolicies } from './check-rls-shape.mjs'

test('a policy calling a helper with a column fails', () => {
  const failures = auditPolicies([
    ['weather_observations', 'member can view', 'private.user_can_access_producer(producer_id)'],
  ])
  assert.equal(failures.length, 1)
  assert.match(failures[0], /runs once per row/)
  assert.match(failures[0], /1,500ms this way, 15ms the other/)
})

test('the hoisted form passes', () => {
  assert.deepEqual(
    auditPolicies([
      ['weather_observations', 'member can view', 'producer_id = ( SELECT private.current_producer_id())'],
    ]),
    [],
  )
})

test('every per-row helper is covered, not just the producer one', () => {
  // The parcel and plot helpers have the same defect one and two joins
  // out, and a check that only knew the first would pass the schema's
  // deepest policies.
  const failures = auditPolicies([
    ['planting', 'view', 'private.user_can_access_parcel(parcel_id)'],
    ['plot_rows', 'view', 'private.user_can_access_plot(plot_id)'],
    ['plot_rows', 'update', 'private.user_can_edit_parcel(pl.parcel_id)'],
  ])
  assert.equal(failures.length, 3)
})

test('a bare auth.uid() fails', () => {
  const failures = auditPolicies([['profiles', 'view own', 'id = auth.uid()']])
  assert.equal(failures.length, 1)
  assert.match(failures[0], /re-evaluates per row/)
})

test('a wrapped auth.uid() passes', () => {
  // This is how the profiles policies are already written -- the
  // technique was in the codebase before it was applied anywhere else.
  assert.deepEqual(auditPolicies([['profiles', 'view own', '(id = ( SELECT auth.uid() AS uid))']]), [])
})

test('a policy with no expression at all is not a failure', () => {
  // An INSERT policy has only a WITH CHECK; the USING side is null.
  assert.deepEqual(auditPolicies([['app_status', 'readable', '']]), [])
  assert.deepEqual(auditPolicies([['app_status', 'readable', null]]), [])
})

test('a constant policy passes', () => {
  assert.deepEqual(auditPolicies([['data_providers', 'any signed-in user can view', 'true ']]), [])
})
