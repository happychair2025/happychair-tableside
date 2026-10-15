// Staging guard (C1).   node --test tests/staging-env.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import {
  classify, buildProblem, project, normalizeHost,
  PRODUCTION_REF, STAGING_REF, PRODUCTION_HOSTS, STAGING_HOSTS,
} from '../src/env/target.mjs'

const key = (ref: string) => 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.' +
  Buffer.from(JSON.stringify({ iss: 'supabase', ref, role: 'anon' })).toString('base64url') + '.c2ln'
const url = (ref: string) => `https://${ref}.supabase.co`
const P = [url(PRODUCTION_REF), key(PRODUCTION_REF)] as const
const ST = [url(STAGING_REF), key(STAGING_REF)] as const
const PROD_HOST = PRODUCTION_HOSTS[0]
const STG_HOST = STAGING_HOSTS[0]

test('production pair runs on production and non-staging hosts, unchanged', () => {
  for (const h of [PROD_HOST, `${PROD_HOST}.`, 'happychair-tableside-git-main-hc.vercel.app', 'localhost']) {
    assert.deepEqual(classify(...P, h), { target: 'production', problem: null }, h)
    assert.deepEqual(classify(...P, h, 'production'), { target: 'production', problem: null }, h)
  }
  assert.equal(classify(P[0], 'sb_publishable_abc', PROD_HOST).problem, null, 'an unreadable key does not block production')
})

test('URL normalisation: trailing slash / uppercase / whitespace never take production down', () => {
  for (const u of [`${P[0]}/`, `${P[0]}//`, P[0].toUpperCase(), `  ${P[0]}/ `]) {
    assert.deepEqual(project(u, P[1]), { target: 'production', problem: null }, u)
    assert.equal(buildProblem('production', u, P[1]), null, u)
  }
})

test('staging pair runs off the production host and is flagged as staging', () => {
  assert.deepEqual(classify(...ST, STG_HOST, 'preview'), { target: 'staging', problem: null })
  assert.deepEqual(classify(...ST, '192.168.1.20'), { target: 'staging', problem: null })
})

test('runtime: staging refused on the production host (any case, trailing dot)', () => {
  for (const h of [PROD_HOST, PROD_HOST.toUpperCase(), `${PROD_HOST}.`, ` ${PROD_HOST}.. `]) {
    assert.match(classify(...ST, h).problem!, /production guest address/, h)
  }
  assert.equal(normalizeHost('A.Example.COM.'), 'a.example.com')
})

test('runtime: production refused on the staging host and in a Preview build', () => {
  assert.match(classify(...P, STG_HOST).problem!, /staging guest address/)
  assert.match(classify(...P, `${STG_HOST.toUpperCase()}.`).problem!, /staging guest address/)
  assert.match(classify(...P, 'happychair-tableside-git-x-hc.vercel.app', 'preview').problem!, /Preview deployment/)
  assert.match(classify(...ST, 'happychair-tableside-git-main-hc.vercel.app', 'production').problem!, /production deployment/)
})

test('build: production must name production, Preview must name staging', () => {
  assert.equal(buildProblem('production', ...P), null)
  assert.equal(buildProblem('preview', ...ST), null)
  assert.match(buildProblem('production', ...ST)!, /production deployment was given the staging/)
  assert.match(buildProblem('preview', ...P)!, /Preview deployment was given the production/)
  assert.match(buildProblem('production', '', '')!, /Missing/)
  assert.match(buildProblem('preview', ST[0], '')!, /Missing/)
  assert.match(buildProblem('preview', ST[0], P[1])!, /different projects/)
  assert.match(buildProblem('production', url('otherprojectref00000'), key('otherprojectref00000'))!, /Unknown/)
})

test('build: local keeps old behaviour without variables; staging scripts demand staging', () => {
  assert.equal(buildProblem('', undefined, undefined), null)
  assert.equal(buildProblem('', ...P), null)
  assert.equal(buildProblem('', ...ST), null)
  assert.match(buildProblem('', ST[0], P[1])!, /different projects/)
  assert.match(buildProblem('', undefined, undefined, true)!, /Missing/)
  assert.match(buildProblem('', ...P, true)!, /STAGING pair/)
  assert.equal(buildProblem('', ...ST, true), null)
})

test('mismatched, unknown or malformed pairs refuse at runtime', () => {
  assert.match(classify(ST[0], P[1], 'x').problem!, /different projects/)
  assert.match(classify(P[0], ST[1], 'x').problem!, /different projects/)
  assert.match(classify(url('otherprojectref00000'), key('otherprojectref00000'), 'x').problem!, /Unknown/)
  assert.match(classify('https://evil.example.com', ST[1], 'x').problem!, /not a Supabase project URL/)
  assert.match(classify('', '', 'x').problem!, /Missing/)
})

test('both vite configs (Vite loads .js first) run the same build guard', () => {
  for (const f of ['vite.config.ts', 'vite.config.js']) {
    const src = readFileSync(new URL(`../${f}`, import.meta.url), 'utf8')
    assert.match(src, /from '\.\/src\/env\/target\.mjs'/, f)
    assert.match(src, /buildProblem\(vercelEnv, env\.VITE_SUPABASE_URL, env\.VITE_SUPABASE_ANON_KEY, env\.HC_REQUIRE_STAGING === '1'\)/, f)
    assert.match(src, /__HC_VERCEL_ENV__/, f)
  }
})

test('real vite build refuses a mismatched environment (exit != 0, nothing built)', () => {
  const run = (env: Record<string, string>) => spawnSync('npx', ['vite', 'build', '--outDir', '/dev/null/never'], {
    cwd: new URL('..', import.meta.url).pathname, encoding: 'utf8', env: { PATH: process.env.PATH!, HOME: process.env.HOME!, ...env },
  })
  const a = run({ VERCEL_ENV: 'preview', VITE_SUPABASE_URL: P[0], VITE_SUPABASE_ANON_KEY: P[1] })
  assert.notEqual(a.status, 0); assert.match(a.stderr + a.stdout, /\[staging guard\].*Preview deployment/)
  const b = run({ VERCEL_ENV: 'production', VITE_SUPABASE_URL: ST[0], VITE_SUPABASE_ANON_KEY: ST[1] })
  assert.notEqual(b.status, 0); assert.match(b.stderr + b.stdout, /\[staging guard\].*production deployment/)
})
