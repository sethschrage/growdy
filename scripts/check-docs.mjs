#!/usr/bin/env node
// Checks the claims in the docs that have a source of truth in the repo.
//
// The rule this enforces is already written down -- AGENTS.md, "The one
// that keeps getting missed": update the base docs in the same PR as the
// change. It is followed by habit, at the end of a PR, with auto-merge
// on and nobody reviewing. The docs drift anyway, and they drift
// silently, because a stale line renders exactly like a fresh one.
//
// What is checkable is narrow, and the narrowness is the point. A claim
// qualifies only if some file, directory or git ref can contradict it
// without anybody exercising judgement. "Does architecture.md still
// describe what talks to what" is not checkable and is not checked; "the
// diagram draws six Edge Functions and the repo has six directories" is.
//
// Deliberately NOT checked, after each was tried and found wrong:
//
//   - Requiring a doc to change when code changes. That is a gate, not a
//     check: it is satisfied by touching the file, and it fires on the
//     many PRs where nothing is stale.
//   - Matching commands quoted in prose against the `run:` lines in CI.
//     CONTRIBUTING says the web job "lints (`oxlint`)" and the workflow
//     runs `npm run lint`, which is oxlint. Both are right; substring
//     matching says one is wrong.
//   - Backticked paths in ADRs. Twelve are dead and nearly all of them
//     are deliberate history -- 0032 cites the old location of the file
//     it moved. The check is worthless where it is safe and wrong where
//     it would find anything.
//   - Requiring a replaced diagram to survive in `## History`. Replayed
//     over this repo's real history it would have blocked 9 of 21 past
//     diagram edits, several of them one-line changes.
//
// Runs on every PR, gated on nothing: no database, no network, no
// dependencies.

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { basename, dirname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const ARCHITECTURE = 'docs/architecture.md'
const DECISIONS = 'docs/decisions'
const MIGRATIONS = 'supabase/migrations'
const FUNCTIONS = 'supabase/functions'

// ---------------------------------------------------------------- links

/** Markdown links, with the line they sit on. */
export function extractLinks(text) {
  const links = []
  text.split('\n').forEach((line, index) => {
    for (const match of line.matchAll(/\[([^\]\n]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
      links.push({ label: match[1], target: match[2], line: index + 1 })
    }
  })
  return links
}

/**
 * GitHub's heading slug, near enough: lowercase, backticks dropped,
 * punctuation stripped, spaces hyphenated. Near enough because the only
 * thing it has to agree with is itself and the anchors people paste out
 * of GitHub's own UI.
 */
export function slugify(heading) {
  return heading
    .toLowerCase()
    .replace(/`/g, '')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s/g, '-')
}

export function headingSlugs(text) {
  return new Set(
    text
      .split('\n')
      .filter((line) => /^#{1,6}\s/.test(line))
      .map((line) => slugify(line.replace(/^#{1,6}\s+/, ''))),
  )
}

/**
 * Every relative link resolves, every anchor exists, and a link labelled
 * with an ADR number points at that ADR.
 *
 * @param files [path, contents] for every tracked markdown file
 */
export function auditLinks(files) {
  const failures = []
  const contents = new Map(files)

  for (const [file, text] of files) {
    for (const { label, target, line } of extractLinks(text)) {
      if (/^(https?:|mailto:|#)/.test(target)) continue

      const [path, fragment] = target.split('#')
      const resolved = resolve(dirname(file), path)

      if (!existsSync(resolved)) {
        failures.push(
          `${file}:${line}: [${label}](${target}) points at nothing.\n` +
            `    Renders as a 404 on GitHub. Resolved to ${resolved.replace(`${process.cwd()}/`, '')}.`,
        )
        continue
      }

      // A fragment is only checkable when the target is markdown this
      // run can read; "#L94-98" is GitHub's line pointer, not a heading.
      if (fragment && path.endsWith('.md') && !/^L\d+(-\d+)?$/.test(fragment)) {
        const targetText = contents.get(path.startsWith('.') ? relativeTo(file, path) : path)
          ?? readIfPresent(resolved)
        if (targetText !== null) {
          const slugs = headingSlugs(targetText)
          if (!slugs.has(fragment)) {
            failures.push(
              `${file}:${line}: [${label}](${target}) -- no heading in that file makes "#${fragment}".\n` +
                `    The link works; it lands at the top of the page instead of the section.`,
            )
          }
        }
      }

      // A label that is bare ADR number has to be that ADR's number.
      const numeric = label.replace(/`/g, '').trim()
      if (/^\d{4}$/.test(numeric)) {
        const prefix = basename(path).slice(0, 4)
        if (prefix !== numeric) {
          failures.push(
            `${file}:${line}: labelled ${numeric} but links to ${basename(path)}.\n` +
              `    One of the two is a typo, and the label is what anyone reads.`,
          )
        }
      }
    }
  }

  return failures
}

function relativeTo(file, path) {
  return resolve(dirname(file), path).replace(`${process.cwd()}/`, '')
}

function readIfPresent(path) {
  try {
    return readFileSync(path, 'utf8')
  } catch {
    return null
  }
}

// ------------------------------------------------------------------ ADRs

/**
 * ADR numbers are unique, match their own H1, and carry the template's
 * sections. Extra sections are fine -- 0034 adds "Alternatives".
 *
 * @param adrs [filename, contents]
 */
export function auditAdrs(adrs) {
  const failures = []
  const byNumber = new Map()

  for (const [name, text] of adrs) {
    const prefix = name.match(/^(\d{4})-/)?.[1]
    if (!prefix) continue

    if (byNumber.has(prefix)) {
      failures.push(
        `${DECISIONS}/${name}: number ${prefix} is already taken by ${byNumber.get(prefix)}.\n` +
          `    Two ADRs with one number means every reference to it is ambiguous.`,
      )
    }
    byNumber.set(prefix, name)

    const h1 = text.match(/^#\s+(\d{4})\./m)
    if (!h1) {
      failures.push(`${DECISIONS}/${name}: no "# NNNN. Title" heading.`)
    } else if (h1[1] !== prefix) {
      failures.push(
        `${DECISIONS}/${name}: filename says ${prefix}, the heading says ${h1[1]}.\n` +
          `    Links use the filename and readers use the heading, so they have to agree.`,
      )
    }

    if (!/^\*\*Status:\*\*/m.test(text)) {
      failures.push(`${DECISIONS}/${name}: no "**Status:**" line.`)
    }
    for (const section of ['Context', 'Decision', 'Consequences']) {
      if (!new RegExp(`^##\\s+${section}\\s*$`, 'm').test(text)) {
        failures.push(
          `${DECISIONS}/${name}: no "## ${section}" section (see ${DECISIONS}/template.md).`,
        )
      }
    }
  }

  return failures
}

/**
 * An ADR this branch adds must take a number nothing on main has taken.
 * AGENTS.md asks for this by hand, "immediately before opening the PR",
 * which is the moment it is least likely to happen.
 */
export function auditAdrCollision(addedNumbers, mainNumbers) {
  const taken = new Set(mainNumbers)
  return addedNumbers
    .filter((number) => taken.has(number))
    .map(
      (number) =>
        `${DECISIONS}/${number}: main already has an ADR ${number}.\n` +
          `    Branches cut in parallel claim the same next number. Renumber to ${nextFree(mainNumbers, addedNumbers)}.`,
    )
}

function nextFree(mainNumbers, addedNumbers) {
  const highest = [...mainNumbers, ...addedNumbers].map(Number).reduce((a, b) => Math.max(a, b), 0)
  return String(highest + 1).padStart(4, '0')
}

// ------------------------------------------------------- Edge Functions

const NUMERALS = [
  'zero', 'one', 'two', 'three', 'four', 'five', 'six',
  'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve',
]

/**
 * The architecture diagram draws one node per Edge Function, and the
 * prose counts them in words. Both go stale the moment a function is
 * added, and `## History` below them legitimately draws older worlds.
 */
export function auditEdgeFunctions(deployed, architecture) {
  const live = architecture.split(/^## History/m)[0]
  const drawn = new Set([...live.matchAll(/Edge Function: ([a-z-]+)/g)].map((m) => m[1]))
  const failures = []

  for (const name of deployed) {
    if (!drawn.has(name)) {
      failures.push(
        `${ARCHITECTURE}: ${FUNCTIONS}/${name} exists and the diagram does not draw it.\n` +
          `    Add an "Edge Function: ${name}" node above "## History".`,
      )
    }
  }
  for (const name of drawn) {
    if (!deployed.includes(name)) {
      failures.push(
        `${ARCHITECTURE}: the diagram draws "Edge Function: ${name}", which no longer exists.\n` +
          `    Renamed or removed functions leave the old node behind.`,
      )
    }
  }

  const counted = live.match(/\*\*([A-Z][a-z]+) Edge Functions/)
  if (counted) {
    const expected = NUMERALS[deployed.length]
    if (counted[1].toLowerCase() !== expected) {
      failures.push(
        `${ARCHITECTURE}: prose says "${counted[1]} Edge Functions" and there are ${deployed.length}.`,
      )
    }
  }

  return failures
}

// --------------------------------------------------------- housekeeping

/** The filename convention CONTRIBUTING says keeps migrations in order. */
export function auditMigrationNames(filenames) {
  const failures = []
  const seen = new Map()

  for (const name of filenames) {
    const match = name.match(/^(\d{14})_[a-z0-9_]+\.sql$/)
    if (!match) {
      failures.push(
        `${MIGRATIONS}/${name}: not YYYYMMDDHHMMSS_lowercase_description.sql.\n` +
          `    The timestamp is what orders these; a name outside the convention sorts wherever it lands.`,
      )
      continue
    }
    const stamp = match[1]
    const iso = `${stamp.slice(0, 4)}-${stamp.slice(4, 6)}-${stamp.slice(6, 8)}T` +
      `${stamp.slice(8, 10)}:${stamp.slice(10, 12)}:${stamp.slice(12, 14)}Z`
    if (Number.isNaN(Date.parse(iso))) {
      failures.push(`${MIGRATIONS}/${name}: ${stamp} is not a real UTC timestamp.`)
    }
    if (seen.has(stamp)) {
      failures.push(
        `${MIGRATIONS}/${name}: shares its timestamp with ${seen.get(stamp)}.\n` +
          `    Two migrations at the same instant have no defined order.`,
      )
    }
    seen.set(stamp, name)
  }

  return failures
}

/**
 * Every released tag has its entry. One direction only: a release PR
 * writes the section before the tag exists, and that is correct.
 */
export function auditChangelog(tags, changelog) {
  return tags
    .filter((tag) => !new RegExp(`^## \\[${tag.replace(/^v/, '').replace(/\./g, '\\.')}\\]`, 'm').test(changelog))
    .map(
      (tag) =>
        `CHANGELOG.md: released ${tag} has no "## [${tag.replace(/^v/, '')}]" section.\n` +
          `    The changelog is the engineering record; a release missing from it did not happen.`,
    )
}

/**
 * The boundary docs/architecture.md draws as "React client -> data layer
 * -> Supabase". Chains get written across lines, so the source is
 * normalised first -- a grep for "supabase.from(" missed two real
 * violations once already.
 */
export function auditDataLayer(sources) {
  const failures = []

  for (const [file, text] of sources) {
    const flat = text.replace(/supabase\s*\n?\s*\.\s*/g, 'supabase.')
    if (/supabase\.(from|rpc)\(/.test(flat) && !file.startsWith('app/src/data/')) {
      failures.push(
        `${file}: queries Supabase directly.\n` +
          `    Tables and RPCs go through app/src/data/ -- one typed path per record, so a schema\n` +
          `    change is one file rather than a hunt through components (0032).`,
      )
    }
    if (/supabase\.storage\./.test(flat) && file !== 'app/src/lib/photo.ts') {
      failures.push(
        `${file}: calls Supabase storage directly.\n` +
          `    Storage paths carry the tenancy check in the path itself, which is why that lives\n` +
          `    in app/src/lib/photo.ts and nowhere else.`,
      )
    }
  }

  return failures
}

// ------------------------------------------------------------------ main

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8' }).trim()
}

function listFiles(dir) {
  return readdirSync(dir).filter((name) => !name.startsWith('.'))
}

function main() {
  const markdown = git(['ls-files', '*.md']).split('\n').filter(Boolean)
  const failures = []

  failures.push(...auditLinks(markdown.map((file) => [file, readFileSync(file, 'utf8')])))

  const adrFiles = listFiles(DECISIONS).filter((name) => name.endsWith('.md'))
  failures.push(...auditAdrs(adrFiles.map((name) => [name, readFileSync(`${DECISIONS}/${name}`, 'utf8')])))

  // The collision guard needs main to compare against. A shallow clone
  // or a local run without a remote simply skips it rather than failing
  // on something that is not the author's fault.
  const base = process.env.BASE_REF ?? 'origin/main'
  try {
    const onMain = git(['ls-tree', '--name-only', base, `${DECISIONS}/`])
      .split('\n')
      .map((path) => basename(path).match(/^(\d{4})-/)?.[1])
      .filter(Boolean)
    const added = git(['diff', '--name-only', '--diff-filter=A', `${base}...HEAD`, '--', DECISIONS])
      .split('\n')
      .map((path) => basename(path).match(/^(\d{4})-/)?.[1])
      .filter(Boolean)
    failures.push(...auditAdrCollision(added, onMain))
  } catch {
    console.log(`(skipping the ADR collision guard: ${base} is not available here)`)
  }

  const deployed = listFiles(FUNCTIONS).filter(
    (name) => !name.startsWith('_') && statSync(`${FUNCTIONS}/${name}`).isDirectory(),
  )
  failures.push(...auditEdgeFunctions(deployed, readFileSync(ARCHITECTURE, 'utf8')))

  failures.push(...auditMigrationNames(listFiles(MIGRATIONS).filter((name) => name.endsWith('.sql'))))

  const tags = git(['tag', '-l', 'v*']).split('\n').filter(Boolean)
  failures.push(...auditChangelog(tags, readFileSync('CHANGELOG.md', 'utf8')))

  const tracked = git(['ls-files', 'app/src/*.ts', 'app/src/*.tsx'])
    .split('\n')
    .filter((file) => file && !file.includes('.test.'))
  // A file can be tracked and not on disk: `rm` without `git add` leaves
  // the index still naming it, which is every deletion between doing it
  // and staging it. That is a state of the working tree, not a
  // documentation failure -- but it used to reach readFileSync below and
  // come back out as a raw ENOENT stack, which reads as the checker
  // being broken rather than as the tree being half-staged. It cost real
  // time exactly once: removing the artifacts feature deleted four files
  // this list names, and the run that was meant to confirm the docs were
  // consistent instead died in node:fs.
  // Skipped rather than failed, because the deletion is usually correct
  // and the next `git add` makes the check complete -- but said out
  // loud, because a checker that quietly examines less than it claims is
  // worse than one that crashes.
  const missing = tracked.filter((file) => !existsSync(file))
  if (missing.length > 0) {
    console.warn(
      `  note: ${missing.length} tracked file(s) are deleted but not staged, so they were not ` +
        `checked. Run \`git add -A\` for a complete check.\n` +
        missing.map((file) => `    ${file}`).join('\n') +
        '\n',
    )
  }
  const clientSources = tracked.filter((file) => existsSync(file))
  failures.push(...auditDataLayer(clientSources.map((file) => [file, readFileSync(file, 'utf8')])))

  if (failures.length > 0) {
    console.error('\nDocumentation check failed:\n')
    for (const failure of failures) console.error(`  - ${failure}\n`)
    console.error(
      'These are the claims in the docs that something in this repo can contradict.\n' +
        'Nothing here is a matter of taste -- each one is a file, a directory or a git ref\n' +
        'disagreeing with a sentence. See CONTRIBUTING.md, "CI".\n',
    )
    process.exit(1)
  }

  console.log(
    `Documentation check passed. ${markdown.length} markdown files, ${adrFiles.length} ADRs, ` +
      `${deployed.length} Edge Functions, ${tags.length} releases.`,
  )
}

// `node -e` and some loaders leave argv[1] unset; a module imported
// for its exports must not run main() as a side effect either way.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
