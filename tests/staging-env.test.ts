// Staging guard (C1).   node --test tests/staging-env.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { classify, PRODUCTION_REF, STAGING_REF, PRODUCTION_HOSTS } from '../src/env/target.ts'

const key = (ref: string) => 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.' +
  Buffer.from(JSON.stringify({ iss: 'supabase', ref, role: 'anon' })).toString('base64url') + '.c2ln'
const url = (ref: string) => `https://${ref}.supabase.co`
const PROD_HOST = PRODUCTION_HOSTS[0]

test('production pair runs anywhere, unchanged', () => {
  for (const h of [PROD_HOST, 'happychair-tableside-git-x.vercel.app', 'localhost']) {
    assert.deepEqual(classify(url(PRODUCTION_REF), key(PRODUCTION_REF), h), { target: 'production', problem: null })
  }
  assert.equal(classify(url(PRODUCTION_REF), 'sb_publishable_abc', PROD_HOST).problem, null, 'an unreadable key does not block production')
})

test('staging pair runs off the production host and is flagged as staging', () => {
  assert.deepEqual(classify(url(STAGING_REF), key(STAGING_REF), 'happychair-tableside-staging.vercel.app'), { target: 'staging', problem: null })
  assert.deepEqual(classify(url(STAGING_REF), key(STAGING_REF), '192.168.1.20'), { target: 'staging', problem: null })
})

test('a staging build refuses the production guest host', () => {
  assert.match(classify(url(STAGING_REF), key(STAGING_REF), PROD_HOST).problem!, /production guest address/)
  assert.match(classify(url(STAGING_REF), key(STAGING_REF), PROD_HOST.toUpperCase()).problem!, /production guest address/)
})

test('mismatched, unknown or malformed pairs refuse', () => {
  assert.match(classify(url(STAGING_REF), key(PRODUCTION_REF), 'x').problem!, /different projects/)
  assert.match(classify(url(PRODUCTION_REF), key(STAGING_REF), 'x').problem!, /different projects/)
  assert.match(classify(url('otherprojectref00000'), key('otherprojectref00000'), 'x').problem!, /Unknown/)
  assert.match(classify('https://evil.example.com', key(STAGING_REF), 'x').problem!, /not a Supabase project URL/)
  assert.match(classify('', '', 'x').problem!, /Missing/)
})
