import type { PostgrestError } from '@supabase/supabase-js'

// Every query in data/ ends here.
//
// supabase-js reports failure in the resolved value rather than by
// rejecting, so `const { data } = await ...` is valid code that silently
// treats a permission denial, a dropped connection and an empty table as
// the same thing -- which is what the client did everywhere before this
// layer existed: a delete that failed left the row on screen and said
// nothing. Throwing turns that into something a caller has to decide
// about, and the components that already show a message keep showing it,
// now from a catch rather than from an `if (error)` written out at each
// call site.
export function unwrap<T>(result: { data: T; error: PostgrestError | null }): T {
  if (result.error) throw new Error(result.error.message)
  return result.data
}

// The same, for reads where "nothing came back" is an ordinary answer
// rather than a failure -- a list with no rows yet, a lookup for a row
// that may not exist. Null collapses to the empty array so callers can
// render a list without deciding what a missing array means.
export function unwrapList<T>(result: { data: T[] | null; error: PostgrestError | null }): T[] {
  return unwrap(result) ?? []
}

// Postgres functions here declare their optional arguments with a
// default of null, and the generated types spell that `| undefined`
// rather than `| null`. The client's own data is full of honest nulls --
// no planting attached, no photo, no GPS fix -- so something has to
// bridge the two.
//
// It bridges them by lying to the type system, not by changing the call:
// every argument is still sent, null and all. That is deliberate.
// PostgREST resolves which function to call from the argument names it
// receives, so quietly dropping the null ones makes resolution depend on
// nobody ever adding an overload -- and each of these arguments is
// declared `default null` anyway, so an explicit null and an omitted
// argument mean the same thing to Postgres and different things to
// PostgREST.
type NullsAsUndefined<T> = {
  [K in keyof T]: null extends T[K] ? Exclude<T[K], null> | undefined : T[K]
}

export function rpcArgs<T extends Record<string, unknown>>(args: T): NullsAsUndefined<T> {
  return args as NullsAsUndefined<T>
}
