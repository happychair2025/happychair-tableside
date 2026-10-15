import { createClient } from '@supabase/supabase-js'
import { classify } from '../env/target'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

const resolved = classify(supabaseUrl, supabaseAnonKey, typeof location === 'undefined' ? '' : location.hostname)

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables')
}

export const IS_STAGING = resolved.target === 'staging'
/** Set when this build must not start (unknown project, mismatched pair, staging on the production host). */
export const ENV_PROBLEM = resolved.problem

// A refused build gets a non-routable client: main.tsx will not render the app, and nothing
// can reach either project.
export const supabase = createClient(ENV_PROBLEM ? 'https://not-configured.invalid' : supabaseUrl, supabaseAnonKey)
