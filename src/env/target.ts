// Which Supabase project this guest build talks to. Pure, so node --test can run it.
// Runbook: happychair-admin/docs/staging/THREE_APP_STAGING.md.
//
// Runtime-only guard (the build config is untouched): the app runs against production or
// staging and nothing else; a staging build shows a STAGING strip and refuses to start on the
// production guest host, so a guest at a real table can never be served by staging.

export const PRODUCTION_REF = 'hnrojtcctqgtzdrinyvu'
export const STAGING_REF = 'pfzkaqqgwxdkmkmksoiz'
/** Hosts that serve the PRODUCTION guest app. */
export const PRODUCTION_HOSTS = ['happychair-tableside.vercel.app']

export type Target = 'production' | 'staging'
export interface Classified { target: Target | null; problem: string | null }

export function keyRef(key: string): string | null {
  try {
    const part = key.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    return (JSON.parse(atob(part)) as { ref?: string }).ref ?? null
  } catch { return null }
}

export function classify(rawUrl: string | undefined, rawKey: string | undefined, hostname: string): Classified {
  const url = (rawUrl ?? '').trim()
  const key = (rawKey ?? '').trim()
  if (!url || !key) return { target: null, problem: 'Missing Supabase environment variables' }
  const m = /^https:\/\/([a-z0-9]{20})\.supabase\.co$/.exec(url)
  if (!m) return { target: null, problem: 'VITE_SUPABASE_URL is not a Supabase project URL' }
  const ref = m[1]
  const kref = keyRef(key)
  if (kref !== null && kref !== ref) return { target: null, problem: 'VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are for different projects' }
  if (ref === PRODUCTION_REF) return { target: 'production', problem: null }
  if (ref !== STAGING_REF) return { target: null, problem: `Unknown Supabase project ${ref}` }
  if (PRODUCTION_HOSTS.includes(hostname.toLowerCase())) return { target: 'staging', problem: 'A staging build cannot run on the production guest address' }
  return { target: 'staging', problem: null }
}
