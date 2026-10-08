// Network-free stand-in for src/lib/supabase.ts, swapped in at bundle time by run.mjs.
// Every call is recorded on window.__CALLS__ and answered by window.__MOCK__, so a harness
// can script exactly what the "server" says and when. Nothing here can reach a network.

type Result = { data: unknown; error: unknown }
type Handler = (args: Record<string, unknown>) => Result | Promise<Result>
interface Mock {
  rpc: Record<string, Handler>
  table: Record<string, (op: string, payload: unknown) => Result | Promise<Result>>
}
declare global { interface Window { __MOCK__: Mock; __CALLS__: Array<{ kind: string; name: string; args: unknown }> } }

window.__CALLS__ = window.__CALLS__ || []
const mock = (): Mock => window.__MOCK__ || { rpc: {}, table: {} }

function builder(table: string) {
  let op = 'select'
  let payload: unknown = null
  const run = async (): Promise<Result> => {
    window.__CALLS__.push({ kind: 'table', name: `${table}.${op}`, args: payload })
    const h = mock().table[table]
    return h ? await h(op, payload) : { data: null, error: null }
  }
  const b: Record<string, unknown> = {}
  for (const m of ['eq', 'is', 'order', 'limit', 'ilike', 'gte', 'neq']) b[m] = () => b
  b.select = () => b
  b.insert = (p: unknown) => { op = 'insert'; payload = p; return b }
  b.update = (p: unknown) => { op = 'update'; payload = p; return b }
  b.single = run
  b.maybeSingle = run
  b.then = (res: (v: Result) => unknown, rej?: (e: unknown) => unknown) => run().then(res, rej)
  return b
}

export const supabase = {
  rpc: async (name: string, args: Record<string, unknown>): Promise<Result> => {
    window.__CALLS__.push({ kind: 'rpc', name, args })
    const h = mock().rpc[name]
    if (!h) return { data: null, error: { code: 'PGRST202', message: `mock: no function ${name}` } }
    return await h(args)
  },
  from: (table: string) => builder(table),
} as unknown as typeof import('../../src/lib/supabase').supabase
