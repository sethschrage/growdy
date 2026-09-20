#!/usr/bin/env node
// Refuses to let a migration be written before its questions are answered.
//
// CI already fails a migration that creates a table or adds a column
// without answering the six questions in docs/schema-change-questions.md.
// That is a real gate, and it is also ten minutes late and one context
// away: by the time it fires, the migration has been written, the
// answers have been composed by whoever was holding the keyboard, and
// the cheapest way out is to make them sound plausible.
//
// This runs as a PreToolUse hook (.claude/settings.json) and blocks the
// write itself. The rule is identical -- it calls the same
// auditMigration() the CI check does -- but it fires while the person
// who actually knows what the column means is still in the conversation.
//
// It cannot make anyone ask. Nothing can: a rule enforced on files can
// only see files. What it can do is make an unanswered migration
// impossible to create quietly, so the failure happens in front of the
// person who can answer rather than in a log nobody reads.
//
// Input is the hook payload on stdin; exit 2 blocks the call and returns
// stderr to the agent. Any other failure exits 0 -- a broken guard must
// not become a broken repo.

import { readFileSync } from 'node:fs'
import { auditMigration, DOC, TAGS } from './check-migration-answers.mjs'

const MIGRATION = /supabase\/migrations\/[^/]+\.sql$/

function readStdin() {
  try {
    return JSON.parse(readFileSync(0, 'utf8'))
  } catch {
    return null
  }
}

/** What the file will contain if this call goes through. */
function resultingText(toolName, input) {
  if (toolName === 'Write') return input.content ?? ''
  if (toolName === 'Edit') {
    const current = readFileSync(input.file_path, 'utf8')
    return input.replace_all
      ? current.split(input.old_string).join(input.new_string)
      : current.replace(input.old_string, input.new_string)
  }
  return null
}

const payload = readStdin()
const input = payload?.tool_input ?? {}
const path = input.file_path ?? ''

if (!payload || !MIGRATION.test(path)) process.exit(0)

let text
try {
  text = resultingText(payload.tool_name, input)
} catch {
  process.exit(0) // editing a file that isn't there yet; CI still covers it
}
if (text === null) process.exit(0)

const failures = auditMigration(path.replace(`${process.cwd()}/`, ''), text)
if (failures.length === 0) process.exit(0)

console.error(
  `Blocked: this migration changes the schema and does not answer the six questions.\n\n` +
    failures.map((failure) => `  - ${failure}`).join('\n\n') +
    `\n\nThe answers are not yours to compose. ${TAGS.join(', ')} are the things` +
    `\nonly the person asking for the change knows -- what the column means, what null` +
    `\nmeans, which producer owns the row, what happens to rows that already exist.` +
    `\n\nPut the questions in ${DOC} to them, in the conversation, and write down what` +
    `\nthey say. If they have already answered, the answers belong in the migration's` +
    `\nheader in their words, not summarised away.\n`,
)
process.exit(2)
