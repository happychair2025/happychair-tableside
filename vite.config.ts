import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { buildProblem } from './src/env/target.mjs'

// VERCEL_ENV is set by Vercel ('production' | 'preview'). A deployment pointed at the wrong
// Supabase project fails HERE, loudly, rather than shipping a guest app that is either down or
// talking to the wrong project. HC_REQUIRE_STAGING=1 (npm run dev:staging / build:staging) demands
// the staging pair. Rules and tests: src/env/target.mjs, tests/staging-env.test.ts.
// NOTE: Vite loads vite.config.js before vite.config.ts — keep the committed vite.config.js in sync
// (`npx tsc -b tsconfig.node.json` regenerates it).
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '')
  const vercelEnv = env.VERCEL_ENV ?? ''
  const problem = buildProblem(vercelEnv, env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, env.HC_REQUIRE_STAGING === '1')
  if (problem) throw new Error(`[staging guard] Build refused: ${problem}`)
  return {
    plugins: [react()],
    define: { __HC_VERCEL_ENV__: JSON.stringify(vercelEnv) },
  }
})
