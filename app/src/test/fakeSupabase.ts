// A stand-in for the supabase-js client, for testing `src/data/`.
//
// The real client builds a query by chaining, then sends it when the
// builder is awaited. This records the chain instead and resolves to
// whatever the test set, which makes two things checkable that
// otherwise only show up against a live database: the filter a function
// actually sends (a missing `.eq('status', 'pending')` is a queue that
// shows confirmed rows), and what it does when the database says no.
//
// A singleton rather than a factory, because `vi.mock` is hoisted above
// the imports: the mock factory and the test body both reach the client
// through this module, so they are guaranteed to be holding the same
// one.

export type ChainCall = [method: string, args: unknown[]]

export type RecordedQuery = {
  kind: 'from' | 'rpc' | 'invoke'
  name: string
  args: unknown[]
  chain: ChainCall[]
}

type Outcome = { data: unknown; error: { message: string } | null }

let queries: RecordedQuery[] = []
let outcome: Outcome = { data: null, error: null }
let invokeOutcome: { data: unknown; error: unknown } = { data: null, error: null }

function builder(record: RecordedQuery) {
  const proxy: Record<string, unknown> = new Proxy(
    {},
    {
      get(_target, property) {
        // Symbols reach here when something inspects the object --
        // Promise.resolve checking for a thenable, a test printer
        // formatting it. Returning a recorder function for those makes
        // the fake look like whatever the inspector hoped for.
        if (typeof property !== 'string') return undefined
        if (property === 'then') {
          return (resolve: (value: Outcome) => unknown) => Promise.resolve(outcome).then(resolve)
        }
        return (...args: unknown[]) => {
          record.chain.push([property, args])
          return proxy
        }
      },
    },
  ) as Record<string, unknown>
  return proxy
}

function record(kind: RecordedQuery['kind'], name: string, args: unknown[]): RecordedQuery {
  const entry: RecordedQuery = { kind, name, args, chain: [] }
  queries.push(entry)
  return entry
}

export const fakeClient = {
  from(name: string) {
    return builder(record('from', name, []))
  },
  rpc(name: string, args?: unknown) {
    return builder(record('rpc', name, args === undefined ? [] : [args]))
  },
  functions: {
    invoke(name: string, options?: unknown) {
      record('invoke', name, options === undefined ? [] : [options])
      return Promise.resolve(invokeOutcome)
    },
  },
}

export const fake = {
  reset() {
    queries = []
    outcome = { data: null, error: null }
    invokeOutcome = { data: null, error: null }
  },
  /** What the next awaited query resolves to. */
  returns(data: unknown) {
    outcome = { data, error: null }
  },
  /** Make the next awaited query fail the way Postgrest does: in the value, not by throwing. */
  fails(message: string) {
    outcome = { data: null, error: { message } }
  },
  /** What the next Edge Function invocation resolves to. */
  invokeReturns(data: unknown) {
    invokeOutcome = { data, error: null }
  },
  invokeFails(error: unknown) {
    invokeOutcome = { data: null, error }
  },
  get queries() {
    return queries
  },
  /** The single query the function under test made. Fails loudly if it made none or several. */
  only(): RecordedQuery {
    if (queries.length !== 1) {
      throw new Error(`expected exactly one query, got ${queries.length}`)
    }
    return queries[0]
  },
  /** The arguments a chained method was called with, e.g. chainArgs('eq'). */
  chainArgs(method: string): unknown[][] {
    return fake.only().chain.filter(([name]) => name === method).map(([, args]) => args)
  },
}
