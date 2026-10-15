import { createClient } from '@supabase/supabase-js'
import { classify, normalizeUrl } from '../env/target.mjs'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables')
}

declare const __HC_VERCEL_ENV__: string | undefined
const vercelEnv = typeof __HC_VERCEL_ENV__ === 'string' ? __HC_VERCEL_ENV__ : ''

// The build already refused a mismatched environment (vite.config); this is defence in depth.
const resolved = classify(supabaseUrl, supabaseAnonKey, typeof location === 'undefined' ? '' : location.hostname, vercelEnv)

export const IS_STAGING = resolved.target === 'staging'
/** Set when this build must not start (unknown project, mismatched pair, wrong host or environment). */
export const ENV_PROBLEM = resolved.problem

// A refused build gets a non-routable client: main.tsx will not render the app, and nothing
// can reach either project.
export const supabase = createClient(ENV_PROBLEM ? 'https://not-configured.invalid' : normalizeUrl(supabaseUrl), supabaseAnonKey)
