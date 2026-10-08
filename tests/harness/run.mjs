// W1-4 Truthful guest — headless Chrome harness runner. NO production calls:
//   * src/lib/supabase.ts is replaced at bundle time by tests/harness/supabase.mock.ts
//   * Chrome runs with every host except 127.0.0.1 mapped to NOTFOUND
// Usage: node tests/harness/run.mjs [shotsDir]
// Writes tests/truthful-guest.results.txt; screenshots go to shotsDir (default ../shots-tableside).

import { build } from 'esbuild'
import { createServer } from 'node:http'
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, existsSync } from 'node:fs'
import { join, dirname, resolve, relative } from 'node:path'
import { tmpdir } from 'node:os'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..', '..')
const SHOTS = resolve(process.argv[2] || join(ROOT, '..', 'shots-tableside'))
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const OUT = mkdtempSync(join(tmpdir(), 'hc-harness-'))
mkdirSync(SHOTS, { recursive: true })

await build({
  entryPoints: [join(ROOT, 'src/main.tsx')],
  bundle: true, outfile: join(OUT, 'bundle.js'), format: 'iife', jsx: 'automatic',
  define: { 'process.env.NODE_ENV': '"development"' }, logLevel: 'error',
  plugins: [{ name: 'mock-supabase', setup(b) {
    b.onResolve({ filter: /\/lib\/supabase$/ }, () => ({ path: join(HERE, 'supabase.mock.ts') }))
  } }],
})

const SCENARIOS = [
  ['request', '?c=TESTCODE'],
  ['requestFail', '?c=TESTCODE'],
  ['requestNoStateFn', '?c=TESTCODE&nostate=1'],
  ['legacyRequest', '?table=11111111-1111-4111-8111-111111111111&venue=22222222-2222-4222-8222-222222222222'],
  ['emergency', '?c=TESTCODE'],
  ['emergencyFail', '?c=TESTCODE'],
  ['sentimentCode', '?c=TESTCODE'],
  ['sentimentLegacy', '?table=11111111-1111-4111-8111-111111111111&venue=22222222-2222-4222-8222-222222222222'],
  ['a11y', '?c=TESTCODE'],
  ['errorScreen', '?c=TESTCODE&unavail=1'],
]

let cdp, onResults
const results = []
const server = createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x')
  if (u.pathname === '/__results') {
    let body = ''; for await (const c of req) body += c
    res.end('ok'); onResults?.(body); return
  }
  if (u.pathname === '/__shot') {
    const { data } = await cdp('Page.captureScreenshot', { format: 'png' })
    writeFileSync(join(SHOTS, u.searchParams.get('name') + '.png'), Buffer.from(data, 'base64'))
    res.end('ok'); return
  }
  const file = u.pathname === '/' ? join(HERE, 'truthful-guest.harness.html')
    : u.pathname === '/bundle.js' ? join(OUT, 'bundle.js')
    : u.pathname === '/bundle.css' ? join(OUT, 'bundle.css') : null
  if (!file || !existsSync(file)) { res.statusCode = 404; res.end(); return }
  res.setHeader('content-type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html')
  res.end(readFileSync(file))
})
await new Promise(r => server.listen(0, '127.0.0.1', r))
const PORT = server.address().port

const chrome = spawn(CHROME, [
  '--headless=new', '--remote-debugging-port=9339', `--user-data-dir=${mkdtempSync(join(tmpdir(), 'hc-chrome-'))}`,
  '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1', '--no-first-run', '--no-default-browser-check',
  'about:blank',
], { stdio: 'ignore' })

let targets
for (let i = 0; i < 50; i++) {
  try { targets = await (await fetch('http://127.0.0.1:9339/json/list')).json(); if (targets.some(t => t.type === 'page')) break } catch {}
  await new Promise(r => setTimeout(r, 200))
}
const ws = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl)
await new Promise(r => ws.addEventListener('open', r))
let id = 0; const pending = new Map()
ws.addEventListener('message', e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result || m); pending.delete(m.id) } })
cdp = (method, params = {}) => new Promise(r => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })) })
await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })

for (const [name, qs] of SCENARIOS) {
  const done = new Promise(r => { onResults = r })
  await cdp('Page.navigate', { url: `http://127.0.0.1:${PORT}/${qs}${qs ? '&' : '?'}s=${name}` })
  const out = await Promise.race([done, new Promise(r => setTimeout(() => r(`FAIL  ${name} · timed out`), 90000))])
  results.push(out)
  process.stdout.write(out + '\n')
}

// Static check that cannot be done from inside the page.
const vp = readFileSync(join(ROOT, 'index.html'), 'utf8')
const zoomOk = !/user-scalable\s*=\s*no|maximum-scale\s*=\s*1/.test(vp)
results.push(`${zoomOk ? 'PASS' : 'FAIL'}  index.html · viewport does not disable zoom`)

const all = results.join('\n').split('\n').filter(Boolean)
const fails = all.filter(l => l.startsWith('FAIL')).length
const report = `${all.join('\n')}\n\n${all.length - fails} passed, ${fails} failed\nscreenshots: ${relative(ROOT, SHOTS)}\n`
writeFileSync(join(ROOT, 'tests', 'truthful-guest.results.txt'), report)
console.log(`\n${all.length - fails} passed, ${fails} failed`)
ws.close(); chrome.kill(); server.close()
process.exit(fails ? 1 : 0)
