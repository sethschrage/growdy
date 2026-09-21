#!/usr/bin/env node
// Fails when anything in the API's exposed schema is reachable by the
// anonymous role without somebody having written down why.
//
// This project has made the same mistake five times:
//
//   20260915040133  the Vault helpers
//   20260917164242  the parcel share audit trigger
//   #236            create_observation_candidate, after `create or
//                   replace function` with a changed argument list
//                   CREATED a second function rather than replacing one,
//                   and a new function inherits no ACL -- it gets
//                   Postgres's default, which is EXECUTE to PUBLIC
//   #238/#239       three Edge Functions doing work for callers with no
//                   credentials at all
//   #243            seven functions, including execute_readonly_query --
//                   the chat's read tool, which takes a SQL string.
//                   Verified exploitable: `set local role anon` and a
//                   call enumerated 21 tables out of information_schema
//
// Five times, and five times it was a person noticing rather than a
// machine. That is what this closes.
//
// WHY THE SUPABASE ADVISOR CANNOT DO THIS, which is the whole reason the
// file exists. Its anon-callable lint is
// `anon_security_definer_function_executable`, and it fires on SECURITY
// DEFINER. Every one of the seven in #243 was SECURITY INVOKER, so the
// lint could not see them -- and "check the advisors" at release time
// would not have surfaced any of it, in any release, past or future. So
// this check is keyed on REACHABILITY BY anon and never on
// SECURITY DEFINER.
//
// It also reads the grants out of the database rather than out of the
// migrations. The migrations are the input; the ACL is the fact. #236 is
// exactly the gap between the two -- the migration said
// `create or replace` and meant it, and Postgres created something else.

import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

const DB_URL = process.env.SUPABASE_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'

/** The schemas PostgREST serves, per supabase/config.toml. */
export const EXPOSED_SCHEMAS = ['public', 'graphql_public']

/**
 * Everything the anonymous role is allowed to reach, and why.
 *
 * A reason is required, and it is required here rather than in a data
 * file on purpose: adding one has to look like a decision in a diff. The
 * shape is borrowed from NOT_DESCRIBED in supabase/functions/chat/index.ts,
 * which exists for the same reason -- an exception nobody had to argue
 * for is indistinguishable from an oversight.
 */
export const ANON_MAY_REACH = {
  'function public.rls_auto_enable()':
    "Supabase's own platform-injected event trigger, not this project's function. Recorded as benign in docs/monitoring.md since the 2026-09-17 advisor snapshot, and not ours to revoke.",
  'function graphql_public.graphql("operationName" text, query text, variables jsonb, extensions jsonb)':
    "Supabase's own GraphQL entrypoint, owned by supabase_admin and not ours to revoke. Anonymous callers reach it by design, the same way they reach PostgREST, and it is SECURITY INVOKER -- so every query through it is RLS-scoped exactly as the equivalent REST call would be. Named here rather than excluded by schema, because 'it is in graphql_public' is a weaker reason than 'it is this function and here is why'.",
  'table public.app_status SELECT':
    'The maintenance flag. app/src/app/App.tsx calls useAppStatus() before it decides whether there is a session, so a signed-out visitor polls it -- and the block screen exists for exactly the people looking at a broken app.',
}

/**
 * Privileges nothing in this app has ever needed, from either role.
 *
 * TRUNCATE is the one with teeth: RLS does not apply to it, and
 * audit_row_change is a row-level trigger, so a truncate would empty a
 * table and leave no row behind to say so. REFERENCES and TRIGGER are
 * here because they arrive in the same platform default and nothing uses
 * them either.
 */
export const NEVER_GRANTED = ['TRUNCATE', 'REFERENCES', 'TRIGGER']

/**
 * @param functions rows of [schema, signature]           -- anon can EXECUTE
 * @param tables    rows of [schema, relname, privilege]   -- anon holds it
 * @param dangerous rows of [role, schema, relname, privilege] -- either role holds a NEVER_GRANTED one
 * @param baseline  { dangerousByRole: { role: count } } -- accepted backlog, must only shrink
 */
export function auditReach(functions, tables, dangerous, baseline = { dangerousByRole: {} }) {
  const failures = []

  for (const [schema, signature] of functions) {
    const key = `function ${schema}.${signature}`
    if (ANON_MAY_REACH[key]) continue
    failures.push(
      `${key} is EXECUTE-able by anon.\n` +
        `    PostgREST exposes every function in an exposed schema at /rest/v1/rpc/<name>,\n` +
        `    and PUBLIC includes anon -- so this is reachable by anyone holding the\n` +
        `    publishable key, which ships in the web app.\n` +
        `    Fix: revoke execute on function ${schema}.${signature} from public;\n` +
        `         grant execute on function ${schema}.${signature} to authenticated;\n` +
        `    Or, if it is meant to be public, add it to ANON_MAY_REACH with a reason.`,
    )
  }

  for (const [schema, relname, privilege] of tables) {
    const key = `table ${schema}.${relname} ${privilege}`
    if (ANON_MAY_REACH[key]) continue
    failures.push(
      `${key} is held by anon.\n` +
        `    Fix: revoke ${privilege.toLowerCase()} on ${schema}.${relname} from anon;\n` +
        `    Or add it to ANON_MAY_REACH with a reason.`,
    )
  }

  // The dangerous privileges are counted per role rather than listed,
  // because authenticated holds them on every table from Supabase's
  // platform default and fixing that needs its own migration -- see
  // docs/monitoring.md. A baseline that can only shrink keeps the board
  // green today and stops it growing back.
  const byRole = {}
  for (const [role] of dangerous) byRole[role] = (byRole[role] ?? 0) + 1

  for (const [role, count] of Object.entries(byRole)) {
    const allowed = baseline.dangerousByRole?.[role] ?? 0
    if (count > allowed) {
      failures.push(
        `${role} holds ${NEVER_GRANTED.join('/')} on ${count} relations, baseline allows ${allowed}.\n` +
          `    RLS does not apply to TRUNCATE, and audit_row_change is a row-level trigger,\n` +
          `    so a truncate empties a table and records nothing.\n` +
          `    Fix: revoke truncate, references, trigger on all tables in schema public from ${role};`,
      )
    }
  }

  for (const [role, allowed] of Object.entries(baseline.dangerousByRole ?? {})) {
    const count = byRole[role] ?? 0
    if (count < allowed) {
      failures.push(
        `the backlog shrank and the baseline did not: ${role} ${allowed} -> ${count}.\n` +
          `    Lock it in, or the slack is just room to grow back.`,
      )
    }
  }

  return failures
}

function query(sql) {
  const out = execFileSync('psql', [DB_URL, '-At', '-F', '\t', '-c', sql], { encoding: 'utf8' })
  return out.trim() ? out.trim().split('\n').map((line) => line.split('\t')) : []
}

function main() {
  const schemas = EXPOSED_SCHEMAS.map((s) => `'${s}'`).join(',')

  const functions = query(
    `select n.nspname, p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')'
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname in (${schemas})
       and has_function_privilege('anon', p.oid, 'EXECUTE')
     order by n.nspname, p.proname`,
  )

  const privs = NEVER_GRANTED.concat(['SELECT', 'INSERT', 'UPDATE', 'DELETE'])
    .map((p) => `('${p}')`)
    .join(',')

  const tables = query(
    `select n.nspname, c.relname, v.priv
     from pg_class c join pg_namespace n on n.oid = c.relnamespace
     cross join lateral (values ${privs}) as v(priv)
     where n.nspname in (${schemas}) and c.relkind in ('r','v','p','m','f')
       and has_table_privilege('anon', c.oid, v.priv)
     order by n.nspname, c.relname, v.priv`,
  )

  const dangerousPrivs = NEVER_GRANTED.map((p) => `('${p}')`).join(',')
  const dangerous = query(
    `select r.rolname, n.nspname, c.relname, v.priv
     from pg_class c join pg_namespace n on n.oid = c.relnamespace
     cross join lateral (values ('anon'),('authenticated')) as r(rolname)
     cross join lateral (values ${dangerousPrivs}) as v(priv)
     where n.nspname in (${schemas}) and c.relkind in ('r','v','p','m','f')
       and has_table_privilege(r.rolname, c.oid, v.priv)
     order by r.rolname, n.nspname, c.relname, v.priv`,
  )

  // anon's own dangerous grants are reported individually above, so they
  // are not double-counted into the per-role backlog.
  const dangerousForBaseline = dangerous.filter(([role]) => role !== 'anon')

  const baseline = JSON.parse(readFileSync(new URL('./grant-baseline.json', import.meta.url), 'utf8'))

  const failures = auditReach(functions, tables, dangerousForBaseline, baseline)

  if (failures.length > 0) {
    console.error('\nAnonymous reachability check failed:\n')
    for (const failure of failures) console.error(`  - ${failure}\n`)
    console.error(
      "Supabase's security advisor cannot catch most of this: its anon-callable lint fires on\n" +
        'SECURITY DEFINER, and the seven functions found in #243 were all SECURITY INVOKER.\n' +
        'That is why this check is keyed on reachability rather than on how a function is\n' +
        'declared. See docs/monitoring.md.\n',
    )
    process.exit(1)
  }

  console.log(
    `Anonymous reachability check passed. ${functions.length} function(s) and ${tables.length} table ` +
      `privilege(s) reachable by anon, all named with a reason.`,
  )
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
