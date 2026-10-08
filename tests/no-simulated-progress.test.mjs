// Fails if any setTimeout / setInterval callback in src/ sets guest-visible status state
// without reading the network first. Contract C6 / C12: "a status appears only after the
// write confirms it" and "no simulated progress". Run: node tests/no-simulated-progress.test.mjs
//
// How it decides:
//   1. Every setTimeout( / setInterval( call in src/**/*.ts(x) is found and its first
//      argument extracted with a balanced-bracket scan.
//   2. If that argument is a bare identifier (e.g. `setInterval(check, 5000)`), the body of
//      the same-file `const check = ...` / `function check` is used instead.
//   3. The callback is a violation when it calls a status-shaped setter (setBtnStates,
//      setHoldPhase, setReviewedAt, setNoteSent, ... see STATUS_SETTER) or showToast, AND the
//      callback contains no network read (supabase / .rpc( / fetch( ).
// A poll that reads the server and then sets state is therefore allowed; a timer that
// advances a status on its own is not.

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(fileURLToPath(import.meta.url), '..', '..')
// SCAN_SRC lets the detector be pointed at another tree, e.g. a checkout of the pre-fix code.
const SRC = process.env.SCAN_SRC || join(ROOT, 'src')

const STATUS_SETTER = /\b(set\w*(?:Btn|Status|State|Phase|Request|Feedback|Review|Receipt|Note|Sent|Ack|Accepted|Completed|Progress)\w*)\s*\(|\bshowToast\s*\(/
const NETWORK = /\bsupabase\b|\.rpc\s*\(|\bfetch\s*\(/

function walk(dir) {
  return readdirSync(dir).flatMap(n => {
    const p = join(dir, n)
    return statSync(p).isDirectory() ? walk(p) : /\.(t|j)sx?$/.test(n) ? [p] : []
  })
}

// Returns the text between the bracket at `open` and its matching close (exclusive).
function balanced(src, open) {
  const pairs = { '(': ')', '{': '}', '[': ']' }
  const stack = [pairs[src[open]]]
  let i = open + 1, q = null
  for (; i < src.length && stack.length; i++) {
    const c = src[i]
    if (q) { if (c === '\\') i++; else if (c === q) q = null; continue }
    if (c === '"' || c === "'" || c === '`') { q = c; continue }
    if (pairs[c]) stack.push(pairs[c])
    else if (c === stack[stack.length - 1]) stack.pop()
  }
  return src.slice(open + 1, i - 1)
}

function firstArg(args) {
  let depth = 0, q = null
  for (let i = 0; i < args.length; i++) {
    const c = args[i]
    if (q) { if (c === '\\') i++; else if (c === q) q = null; continue }
    if (c === '"' || c === "'" || c === '`') { q = c; continue }
    if ('([{'.includes(c)) depth++
    else if (')]}'.includes(c)) depth--
    else if (c === ',' && depth === 0) return args.slice(0, i).trim()
  }
  return args.trim()
}

function bodyOfNamed(src, name) {
  const m = new RegExp(`(?:const|let|var)\\s+${name}\\s*=|function\\s+${name}\\s*\\(`).exec(src)
  if (!m) return null
  const brace = src.indexOf('{', m.index)
  return brace < 0 ? null : balanced(src, brace)
}

export function scan(src) {
  const out = []
  const re = /\b(setTimeout|setInterval)\s*\(/g
  let m
  while ((m = re.exec(src))) {
    const open = m.index + m[0].length - 1
    let cb = firstArg(balanced(src, open))
    if (/^[A-Za-z_$][\w$]*$/.test(cb)) cb = bodyOfNamed(src, cb) ?? cb
    const setter = STATUS_SETTER.exec(cb)
    if (setter && !NETWORK.test(cb)) {
      const line = src.slice(0, m.index).split('\n').length
      out.push({ line, timer: m[1], setter: setter[1] ?? 'showToast' })
    }
  }
  return out
}

// ── Self-test: the detector must catch the exact pattern it was written to forbid. ──
const OLD_SIMULATION = `
  const handleSvcTap = async (idx) => {
    setBtnStates(p => ({...p, [idx]: {status:'pending', at:Date.now()}}))
    await svcHandlers[idx]()
    setTimeout(() => {
      setBtnStates(p => ({...p, [idx]: {status:'accepted'}}))
    }, 3000 + Math.random() * 4000)
  }`
const OLD_HOLD = `handleUrgentSubmit().then(ok => { setTimeout(() => { go('main'); if (ok) showToast('Help is on the way') }, 1200) })`
const ALLOWED_POLL = `
  const check = async () => {
    const { data } = await supabase.rpc('guest_request_state', {})
    setBtnStates(p => applyServerState(p, data.requests))
  }
  const t = setInterval(check, 5000)`
const ALLOWED_TICK = `const iv = setInterval(() => setTick(t => t+1), 1000)`

let failed = 0
const expect = (name, cond, detail = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond || !detail ? '' : '  [' + detail + ']'}`)
  if (!cond) failed++
}
expect('self-test · catches simulated accept timer', scan(OLD_SIMULATION).length === 1)
expect('self-test · catches toast fired from a timer', scan(OLD_HOLD).length === 1)
expect('self-test · allows a poll that reads the server', scan(ALLOWED_POLL).length === 0)
expect('self-test · allows an elapsed-time re-render tick', scan(ALLOWED_TICK).length === 0)

// ── The real check ──
const files = walk(SRC)
let total = 0
for (const f of files) {
  const hits = scan(readFileSync(f, 'utf8'))
  total += hits.length
  for (const h of hits) {
    expect(`${relative(ROOT, f)}:${h.line} · ${h.timer} callback calls ${h.setter} without a network read`, false)
  }
}
expect(`src · no timer sets guest-visible status (${files.length} files scanned)`, total === 0, `${total} violation(s)`)

console.log(failed ? `\n${failed} FAILED` : '\nall passed')
process.exit(failed ? 1 : 0)
