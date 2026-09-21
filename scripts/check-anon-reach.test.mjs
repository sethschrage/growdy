// Run with: node --test scripts/check-anon-reach.test.mjs

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ANON_MAY_REACH, NEVER_GRANTED, auditReach } from './check-anon-reach.mjs'

test('a function anon can execute fails unless it is named', () => {
  const failures = auditReach([['public', 'execute_readonly_query(text)']], [], [])
  assert.equal(failures.length, 1)
  assert.match(failures[0], /EXECUTE-able by anon/)
  // The message has to carry the fix, because the person reading it is
  // looking at a red board and not at this file.
  assert.match(failures[0], /revoke execute on function public\.execute_readonly_query\(text\) from public/)
})

test('a named function passes, and the name is the one the query builds', () => {
  // rls_auto_enable is Supabase's own and is in the allowlist. If the
  // key format here and the key format in main() ever drift, this test
  // is what notices.
  assert.deepEqual(auditReach([['public', 'rls_auto_enable()']], [], []), [])
})

test('every allowlist entry carries a real reason, not a placeholder', () => {
  for (const [key, reason] of Object.entries(ANON_MAY_REACH)) {
    assert.ok(reason.length > 40, `${key} needs a reason somebody can disagree with`)
  }
})

test('a table privilege anon holds fails unless it is named', () => {
  const failures = auditReach([], [['public', 'producers', 'SELECT']], [])
  assert.equal(failures.length, 1)
  assert.match(failures[0], /revoke select on public\.producers from anon/)
})

test('app_status SELECT passes, because a signed-out visitor polls it', () => {
  assert.deepEqual(auditReach([], [['public', 'app_status', 'SELECT']], []), [])
})

test('the dangerous-privilege backlog fails when it grows past the baseline', () => {
  const dangerous = [
    ['authenticated', 'public', 'observations', 'TRUNCATE'],
    ['authenticated', 'public', 'parcels', 'TRUNCATE'],
  ]
  const failures = auditReach([], [], dangerous, { dangerousByRole: { authenticated: 1 } })
  assert.equal(failures.length, 1)
  assert.match(failures[0], /baseline allows 1/)
  assert.match(failures[0], /RLS does not apply to TRUNCATE/)
})

test('the backlog at the baseline passes', () => {
  const dangerous = [['authenticated', 'public', 'observations', 'TRUNCATE']]
  assert.deepEqual(auditReach([], [], dangerous, { dangerousByRole: { authenticated: 1 } }), [])
})

test('a backlog that shrank without the baseline moving fails too', () => {
  // The same ratchet check-schema-docs.mjs makes: slack left in a
  // baseline is room for the problem to grow back unnoticed.
  const failures = auditReach([], [], [], { dangerousByRole: { authenticated: 3 } })
  assert.equal(failures.length, 1)
  assert.match(failures[0], /the backlog shrank and the baseline did not/)
})

test('SECURITY DEFINER is nowhere in the logic', async () => {
  // The advisor's lint keys on it and that is exactly why it missed the
  // seven functions in #243. If this check ever starts keying on it, it
  // has inherited the blind spot it was written to cover.
  const source = await import('node:fs').then((fs) =>
    fs.readFileSync(new URL('./check-anon-reach.mjs', import.meta.url), 'utf8'),
  )
  // Only the decision logic: main()'s failure message mentions SECURITY
  // DEFINER on purpose, to explain why the advisor misses this.
  const start = source.indexOf('export function auditReach')
  const logic = source.slice(start, source.indexOf('function query(', start))
  assert.ok(start > 0 && logic.length > 500, 'slice did not find the function')
  assert.ok(!/prosecdef|security\s+definer/i.test(logic))
})

test('TRUNCATE is in the never-granted set', () => {
  assert.ok(NEVER_GRANTED.includes('TRUNCATE'))
})
