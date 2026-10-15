// Which Supabase project this guest build talks to — the ONE implementation, used by the
// runtime (src/lib/supabase.ts), the build (vite.config.ts / vite.config.js) and the tests.
// Plain JS + target.d.mts so `tsc -b` (tsconfig.node.json) never emits a copy of it.
// Runbook: happychair-admin/docs/staging/THREE_APP_STAGING.md.
//
//   BUILD (buildProblem): VERCEL_ENV=production must name production; VERCEL_ENV=preview must
//   name staging; HC_REQUIRE_STAGING=1 (npm run dev:staging / build:staging) must name staging.
//   Anything else fails the build — loud, instead of a runtime outage.
//   RUNTIME (classify): defence in depth — production or staging only; staging never on a
//   production host; production never on the staging host; never against the build's VERCEL_ENV.

export const PRODUCTION_REF = 'hnrojtcctqgtzdrinyvu'
export const STAGING_REF = 'pfzkaqqgwxdkmkmksoiz'
/** Hosts that serve the PRODUCTION guest app. */
export const PRODUCTION_HOSTS = ['happychair-tableside.vercel.app']
/** Hosts that serve the STAGING guest app. */
export const STAGING_HOSTS = ['happychair-tableside-staging.vercel.app']

export function keyRef(key) {
  try {
    const part = String(key).split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    return JSON.parse(atob(part)).ref ?? null
  } catch { return null }
}

/** trim, lowercase, no trailing '/'. */
export const normalizeUrl = u => String(u ?? '').trim().toLowerCase().replace(/\/+$/, '')
/** trim, lowercase, no trailing '.' (the FQDN form of the same host). */
export const normalizeHost = h => String(h ?? '').trim().toLowerCase().replace(/\.+$/, '')

/** The project a URL/key pair names: { target, problem }. Host- and environment-independent. */
export function project(rawUrl, rawKey) {
  const url = normalizeUrl(rawUrl)
  const key = String(rawKey ?? '').trim()
  if (!url || !key) return { target: null, problem: 'Missing Supabase environment variables' }
  const m = /^https:\/\/([a-z0-9]{20})\.supabase\.co$/.exec(url)
  if (!m) return { target: null, problem: 'VITE_SUPABASE_URL is not a Supabase project URL' }
  const ref = m[1]
  const kref = keyRef(key)
  if (kref !== null && kref !== ref) return { target: null, problem: 'VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are for different projects' }
  if (ref === PRODUCTION_REF) return { target: 'production', problem: null }
  if (ref === STAGING_REF) return { target: 'staging', problem: null }
  return { target: null, problem: `Unknown Supabase project ${ref}` }
}

/** Build-time refusal: the reason, or null if the build may run. */
export function buildProblem(vercelEnv, rawUrl, rawKey, requireStaging = false) {
  const onVercel = vercelEnv === 'production' || vercelEnv === 'preview'
  const p = project(rawUrl, rawKey)
  if (!onVercel && !requireStaging) {
    // A local build with no variables keeps the old behaviour; a set-but-bad pair is refused.
    return p.problem && (normalizeUrl(rawUrl) || String(rawKey ?? '').trim()) ? p.problem : null
  }
  if (p.problem) return p.problem
  if (requireStaging && p.target !== 'staging') return 'this staging build / dev server needs the STAGING pair'
  if (vercelEnv === 'production' && p.target !== 'production') return 'a production deployment was given the staging project; set Production-scope variables to production'
  if (vercelEnv === 'preview' && p.target !== 'staging') return 'a Preview deployment was given the production project; set Preview-scope variables to staging'
  return null
}

/** Runtime classification: { target, problem }. vercelEnv is the build's VERCEL_ENV ('' locally). */
export function classify(rawUrl, rawKey, hostname, vercelEnv = '') {
  const p = project(rawUrl, rawKey)
  if (p.problem) return p
  const host = normalizeHost(hostname)
  if (p.target === 'staging' && PRODUCTION_HOSTS.includes(host)) return { target: 'staging', problem: 'A staging build cannot run on the production guest address' }
  if (p.target === 'production' && STAGING_HOSTS.includes(host)) return { target: 'production', problem: 'A production build cannot run on the staging guest address' }
  if (vercelEnv === 'production' && p.target !== 'production') return { target: p.target, problem: 'A production deployment cannot run against staging' }
  if (vercelEnv === 'preview' && p.target !== 'staging') return { target: p.target, problem: 'A Preview deployment cannot run against production' }
  return p
}
