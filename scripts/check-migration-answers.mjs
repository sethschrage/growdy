#!/usr/bin/env node
// Requires a migration that creates a table or adds a column to answer
// the six questions in docs/schema-change-questions.md, in a comment
// block at the top of the file.
//
// The point is not the comment block. The point is that the answers are
// things nobody can supply except the person asking for the column --
// what null means, which producer owns the row, why this parent and not
// another -- and the only reliable moment to ask is before the migration
// exists. A rule that says "ask" is followed until it is inconvenient.
// This one fails the build.
//
// It checks that the questions were answered, not that they were
// answered well. No script can do the second thing. It can stop the
// case where nobody was asked at all, which is the case that actually
// happens.
//
// Runs on the files a PR changed, never on history: the questions
// postdate most of the migrations in this repo, and retroactively
// failing them would just mean turning the check off.

import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const DOC = 'docs/schema-change-questions.md'
const TAGS = ['Purpose', 'Columns', 'Relations', 'Access', 'Chat', 'Backfill']
const PLACEHOLDER = /^(todo|tbd|n\/?a|none|\?+|-+|x+)\.?$/i

/** Migration files this branch adds or changes, relative to the base ref. */
function changedMigrations() {
  const fromArgs = process.argv.slice(2).filter((a) => !a.startsWith('-'))
  if (fromArgs.length > 0) return fromArgs

  const base = process.env.BASE_REF ?? 'origin/main'
  const out = execFileSync('git', ['diff', '--name-only', '--diff-filter=d', `${base}...HEAD`], {
    encoding: 'utf8',
  })
  return out.split('\n').filter((f) => f.startsWith('supabase/migrations/') && f.endsWith('.sql'))
}

/** The SQL with `--` comments removed, so header prose can't look like DDL. */
function statements(text) {
  return text
    .split('\n')
    .map((line) => line.replace(/--.*$/, ''))
    .join('\n')
    .toLowerCase()
}

/**
 * What kind of thing this migration creates, if any. ADD CONSTRAINT and
 * friends are not columns; ALTER TABLE ... ADD <name> is, with or
 * without the optional COLUMN keyword.
 */
function ddlKinds(sql) {
  const kinds = new Set()
  if (/\bcreate\s+(or\s+replace\s+)?(materialized\s+)?view\b/.test(sql)) kinds.add('view')
  if (/\bcreate\s+table\b/.test(sql)) kinds.add('table')
  const adds = sql.matchAll(/\balter\s+table\b[^;]*?\badd\s+(?:column\s+)?(?:if\s+not\s+exists\s+)?([a-z_"]+)/g)
  for (const [, word] of adds) {
    if (!/^(constraint|primary|foreign|unique|check|exclude|generated)$/.test(word)) kinds.add('column')
  }
  return kinds
}

/** Each tag's answer, including lines it wraps onto. */
function answers(text) {
  const found = {}
  const lines = text.split('\n')
  let current = null
  for (const line of lines) {
    const comment = line.match(/^\s*--\s?(.*)$/)
    if (!comment) {
      // The header block ends at the first statement; a tag written
      // further down is not a header and should not count as one.
      if (line.trim() !== '') break
      continue
    }
    const tag = comment[1].match(/^([A-Za-z]+):\s*(.*)$/)
    if (tag && TAGS.includes(tag[1])) {
      current = tag[1]
      found[current] = tag[2].trim()
    } else if (current) {
      found[current] = `${found[current]} ${comment[1].trim()}`.trim()
    }
  }
  return found
}

const failures = []

for (const file of changedMigrations()) {
  let text
  try {
    text = readFileSync(file, 'utf8')
  } catch {
    continue // deleted between the diff and now
  }

  const sql = statements(text)
  const kinds = ddlKinds(sql)
  if (kinds.size === 0) continue

  const given = answers(text)
  const missing = TAGS.filter((tag) => !(tag in given))
  const empty = TAGS.filter((tag) => tag in given && (given[tag].length < 8 || PLACEHOLDER.test(given[tag])))

  if (missing.length > 0) {
    failures.push(
      `${file}: creates a ${[...kinds].join(' and a ')}, and does not answer ${missing.join(', ')}.\n` +
        `    Add "-- ${missing[0]}: ..." to the comment block at the top of the file. See ${DOC}.`,
    )
  }
  if (empty.length > 0) {
    failures.push(
      `${file}: ${empty.join(', ')} answered with a placeholder.\n` +
        `    These are the parts of a schema change the database cannot infer. See ${DOC}.`,
    )
  }

  // The answers describe; the COMMENT ON is what the chat and the next
  // reader actually see. A file that has one without the other has
  // written the explanation somewhere nothing reads it.
  if ((kinds.has('table') || kinds.has('view')) && !/\bcomment\s+on\s+(table|view|materialized\s+view)\b/.test(sql)) {
    failures.push(
      `${file}: creates a relation with no COMMENT ON for it.\n` +
        `    The Purpose answer belongs in the schema itself -- the chat builds its description from there.`,
    )
  }
  if (kinds.has('column') && !/\bcomment\s+on\s+column\b/.test(sql)) {
    failures.push(
      `${file}: adds a column with no COMMENT ON COLUMN.\n` +
        `    The Columns answer belongs in the schema itself, next to the column it describes.`,
    )
  }
}

if (failures.length > 0) {
  console.error('\nMigration questions unanswered:\n')
  for (const failure of failures) console.error(`  - ${failure}\n`)
  console.error(
    `The six questions are in ${DOC}. They exist because the answers come from\n` +
      'whoever asked for the change, and the only moment to ask is before the migration is written.\n',
  )
  process.exit(1)
}

console.log('Migration questions: answered.')
