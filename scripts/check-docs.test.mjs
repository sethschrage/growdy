// A documentation checker is the easiest thing in a repo to fool
// yourself about: it prints "passed" either way, and the only evidence
// it still works is that it once found something.
//
// Run with: node --test scripts/check-docs.test.mjs

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  auditAdrCollision,
  auditAdrs,
  auditChangelog,
  auditDataLayer,
  auditEdgeFunctions,
  auditLinks,
  auditMigrationNames,
  extractLinks,
  headingSlugs,
  slugify,
} from './check-docs.mjs'

// -------------------------------------------------------------- links

test('links are read with their label and their line', () => {
  const links = extractLinks('intro\nsee [`0033`](decisions/0033-x.md) and [two](../b.md)\n')
  assert.deepEqual(links, [
    { label: '`0033`', target: 'decisions/0033-x.md', line: 2 },
    { label: 'two', target: '../b.md', line: 2 },
  ])
})

test('a relative link that resolves to nothing fails', () => {
  // The real bug: a file at the repo root writing `decisions/NNNN.md`
  // when the ADRs live under docs/. It renders as a 404 on GitHub and as
  // a working link in most local editors, which is why it survives.
  const failures = auditLinks([['CONTRIBUTING.md', 'see [`0033`](decisions/0033-x.md)']])
  assert.equal(failures.length, 1)
  assert.match(failures[0], /CONTRIBUTING\.md:1/)
  assert.match(failures[0], /points at nothing/)
})

test('the same link from inside docs/ resolves and passes', () => {
  assert.deepEqual(auditLinks([['docs/x.md', 'see [t](decisions/template.md)']]), [])
})

test('external links are left alone', () => {
  const links = 'a [x](https://example.com/nope) [y](mailto:someone@example.com) [z](#section)'
  assert.deepEqual(auditLinks([['README.md', links]]), [])
})

test('an anchor that matches no heading fails', () => {
  // The real one: architecture.md pointed at "#8-the-live-dashboard...",
  // and monitoring.md's section 8 is about GitHub repo settings -- the
  // dashboard moved to 9 when a section was inserted above it.
  const failures = auditLinks([['docs/a.md', 'see [t](decisions/template.md#contexts)']])
  assert.equal(failures.length, 1)
  assert.match(failures[0], /no heading in that file makes "#contexts"/)
})

test('an anchor that matches a heading passes', () => {
  // Read off the target file on disk, not from the passed contents --
  // the anchor and the heading live in different files by definition.
  assert.deepEqual(auditLinks([['docs/a.md', 'see [t](decisions/template.md#context)']]), [])
})

test('GitHub line pointers are not anchors', () => {
  // #L94-98 is a link into a file's lines, not into its headings.
  assert.deepEqual(auditLinks([['docs/a.md', 'see [t](decisions/template.md#L94-98)']]), [])
})

test('a link labelled with an ADR number must point at that ADR', () => {
  const failures = auditLinks([
    ['docs/a.md', 'see [`0018`](decisions/0016-chat-queries-directly.md)'],
  ])
  assert.equal(failures.length, 1)
  assert.match(failures[0], /labelled 0018 but links to 0016-chat-queries-directly\.md/)
})

test('slugs drop backticks and punctuation the way GitHub does', () => {
  assert.equal(slugify('8. GitHub repo settings -- silent'), '8-github-repo-settings----silent')
  assert.equal(slugify('`COMMENT ON` and why'), 'comment-on-and-why')
  assert.deepEqual([...headingSlugs('# A\ntext\n### B c\n')], ['a', 'b-c'])
})

// --------------------------------------------------------------- ADRs

test('an ADR whose heading disagrees with its filename fails', () => {
  const failures = auditAdrs([
    ['0034-a-thing.md', '# 0033. A thing\n\n**Status:** accepted\n\n## Context\n\n## Decision\n\n## Consequences\n'],
  ])
  assert.equal(failures.length, 1)
  assert.match(failures[0], /filename says 0034, the heading says 0033/)
})

test('two ADRs with one number fail', () => {
  const body = '\n\n**Status:** accepted\n\n## Context\n\n## Decision\n\n## Consequences\n'
  const failures = auditAdrs([
    ['0034-first.md', `# 0034. First${body}`],
    ['0034-second.md', `# 0034. Second${body}`],
  ])
  assert.equal(failures.length, 1)
  assert.match(failures[0], /number 0034 is already taken by 0034-first\.md/)
})

test('a missing template section fails, and extra sections are fine', () => {
  const failures = auditAdrs([
    ['0035-x.md', '# 0035. X\n\n**Status:** accepted\n\n## Context\n\n## Alternatives\n\n## Decision\n'],
  ])
  assert.equal(failures.length, 1)
  assert.match(failures[0], /no "## Consequences" section/)
})

test('an ADR taking a number main already used fails', () => {
  // Two branches cut in parallel both reach for the next free number.
  const failures = auditAdrCollision(['0034'], ['0032', '0033', '0034'])
  assert.equal(failures.length, 1)
  assert.match(failures[0], /main already has an ADR 0034/)
  assert.match(failures[0], /Renumber to 0035/)
})

test('a genuinely new number passes', () => {
  assert.deepEqual(auditAdrCollision(['0035'], ['0033', '0034']), [])
})

// ----------------------------------------------------- Edge Functions

const ARCH = (nodes, count) =>
  `graph\n${nodes.map((n) => `    X["Edge Function: ${n}"]`).join('\n')}\n\n- **${count} Edge Functions now**\n` +
  '\n## History\n\n    Y["Edge Function: long-gone"]\n'

test('a function with no node in the diagram fails', () => {
  const failures = auditEdgeFunctions(['chat', 'ingest-weather'], ARCH(['chat'], 'Two'))
  assert.equal(failures.length, 1)
  assert.match(failures[0], /supabase\/functions\/ingest-weather exists and the diagram does not draw it/)
})

test('a node for a function that no longer exists fails', () => {
  const failures = auditEdgeFunctions(['chat'], ARCH(['chat', 'removed-one'], 'One'))
  assert.equal(failures.length, 1)
  assert.match(failures[0], /draws "Edge Function: removed-one", which no longer exists/)
})

test('history diagrams are allowed to draw an older world', () => {
  // The whole point of ## History is that it describes what used to be
  // true; checking it would make writing history impossible.
  assert.deepEqual(auditEdgeFunctions(['chat'], ARCH(['chat'], 'One')), [])
})

test('the prose count has to match the number of functions', () => {
  const failures = auditEdgeFunctions(['chat', 'ingest-weather'], ARCH(['chat', 'ingest-weather'], 'Six'))
  assert.equal(failures.length, 1)
  assert.match(failures[0], /says "Six Edge Functions" and there are 2/)
})

// --------------------------------------------------------- migrations

test('a migration outside the naming convention fails', () => {
  const failures = auditMigrationNames(['20260920010525_ok.sql', 'add_thing.sql'])
  assert.equal(failures.length, 1)
  assert.match(failures[0], /add_thing\.sql: not YYYYMMDDHHMMSS_lowercase_description\.sql/)
})

test('a timestamp that is not a real instant fails', () => {
  const failures = auditMigrationNames(['20261345010525_impossible_month.sql'])
  assert.equal(failures.length, 1)
  assert.match(failures[0], /not a real UTC timestamp/)
})

test('two migrations at the same instant fail', () => {
  const failures = auditMigrationNames(['20260920010525_a.sql', '20260920010525_b.sql'])
  assert.equal(failures.length, 1)
  assert.match(failures[0], /shares its timestamp with/)
})

// ---------------------------------------------------------- changelog

test('a released tag with no changelog section fails', () => {
  const failures = auditChangelog(['v0.13.0', 'v0.14.0'], '## [0.13.0] - 2026-09-18\n')
  assert.equal(failures.length, 1)
  assert.match(failures[0], /released v0\.14\.0 has no "## \[0\.14\.0\]" section/)
})

test('a changelog section ahead of its tag passes', () => {
  // The release PR writes the section first; the tag comes after merge.
  assert.deepEqual(auditChangelog(['v0.13.0'], '## [0.14.0]\n\n## [0.13.0]\n'), [])
})

// --------------------------------------------------------- data layer

test('a component querying Supabase directly fails', () => {
  const failures = auditDataLayer([['app/src/features/chat/Chat.tsx', 'const { data } = await supabase.from("plots").select()']])
  assert.equal(failures.length, 1)
  assert.match(failures[0], /queries Supabase directly/)
})

test('a chain broken across lines is still found', () => {
  // The exact shape that slipped past a grep once: two files kept
  // calling Supabase directly after the data layer landed, because the
  // call was written over three lines.
  const failures = auditDataLayer([
    ['app/src/features/producer/PlantingDetail.tsx', 'await supabase\n  .from("planting_readable")\n  .select()'],
  ])
  assert.equal(failures.length, 1)
})

test('the data layer itself is where those calls belong', () => {
  assert.deepEqual(auditDataLayer([['app/src/data/vineyard.ts', 'supabase.from("plots")']]), [])
})

test('storage stays in the one file that owns the tenancy path', () => {
  assert.deepEqual(auditDataLayer([['app/src/lib/photo.ts', 'supabase.storage.from("observation-photos")']]), [])
  const failures = auditDataLayer([['app/src/features/observations/ObservationPhoto.tsx', 'supabase.storage.from("x")']])
  assert.equal(failures.length, 1)
  assert.match(failures[0], /calls Supabase storage directly/)
})

test('auth calls are not the data layer\'s business', () => {
  // Sign-in lives in the app shell by design; only tables, RPCs and
  // storage are behind the boundary.
  assert.deepEqual(auditDataLayer([['app/src/app/LoginForm.tsx', 'await supabase.auth.signInWithOAuth({})']]), [])
})
