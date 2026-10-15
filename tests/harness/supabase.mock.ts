// Network-free stand-in for src/lib/supabase.ts, swapped in at bundle time by run.mjs.
// Every call is recorded on window.__CALLS__ and answered by window.__MOCK__, so a harness
// can script exactly what the "server" says and when. Nothing here can reach a network.
// Supports .abortSignal(signal) like supabase-js: an aborted call resolves with an error,
// which is how the client's write timeout is exercised against a never-settling "server".

type Result = { data: unknown; error: unknown }
type Handler = (args: Record<string, unknown>) => Result | Promise<Result>
interface Mock {
  rpc: Record<string, Handler>
  table: Record<string, (op: string, payload: unknown) => Result | Promise<Result>>
}
declare global { interface Window { __MOCK__: Mock; __CALLS__: Array<{ kind: string; name: string; args: unknown }> } }

window.__CALLS__ = window.__CALLS__ || []
const mock = (): Mock => window.__MOCK__ || { rpc: {}, table: {} }
const ABORTED: Result = { data: null, error: { code: '20', message: 'AbortError: The operation was aborted.' } }

function thenable(record: () => void, answer: () => Result | Promise<Result>, extra: Record<string, unknown> = {}) {
  let signal: AbortSignal | undefined
  let p: Promise<Result> | null = null
  const run = () => new Promise<Result>(resolve => {
    record()
    if (signal?.aborted) return resolve(ABORTED)
    signal?.addEventListener('abort', () => resolve(ABORTED))
    Promise.resolve(answer()).then(resolve)
  })
  const b: Record<string, unknown> = {
    ...extra,
    abortSignal: (s: AbortSignal) => { signal = s; return b },
    then: (res: (v: Result) => unknown, rej?: (e: unknown) => unknown) => { p ??= run(); return p.then(res, rej) },
  }
  return b
}

function builder(table: string) {
  let op = 'select'
  let payload: unknown = null
  const b = thenable(
    () => window.__CALLS__.push({ kind: 'table', name: `${table}.${op}`, args: payload }),
    () => { const h = mock().table[table]; return h ? h(op, payload) : { data: null, error: null } },
  )
  for (const m of ['eq', 'is', 'order', 'limit', 'ilike', 'gte', 'neq', 'select']) b[m] = () => b
  b.insert = (p: unknown) => { op = 'insert'; payload = p; return b }
  b.update = (p: unknown) => { op = 'update'; payload = p; return b }
  b.single = () => b
  b.maybeSingle = () => b
  return b
}

export const supabase = {
  rpc: (name: string, args: Record<string, unknown>) => thenable(
    () => window.__CALLS__.push({ kind: 'rpc', name, args }),
    () => {
      const h = mock().rpc[name]
      return h ? h(args) : { data: null, error: { code: 'PGRST202', message: `mock: no function ${name}` } }
    },
  ),
  from: (table: string) => builder(table),
} as unknown as typeof import('../../src/lib/supabase').supabase

// The real module also exports the staging guard's result; the harness is never staging and never refused.
export const IS_STAGING = false
export const ENV_PROBLEM: string | null = null
