// Static guard against simulated progress (contracts C6 / C12: "a status appears only after
// KNOWN GAPS (verified by mutation, Oct 2026): a decoy network call before a sink inside the same
// timer (e.g. `void supabase.rpc('noop'); setBtnStates(...)`) passes, and a timeout helper that
// resolves SUCCESS passes. Both are caught by the runtime harness (tests/harness), which is the
// authoritative guard; this static scan is a fast first line.
// the write confirms it", "no simulated progress"). Run: node tests/no-simulated-progress.test.mjs
//
// WHAT IT GUARANTEES — within each file under src/, a violation is reported when time alone
// leads to a guest-visible status change, i.e. when code reached through
//   (a) a setTimeout / setInterval callback, inline or named (`setInterval(check, 5000)`),
//   (b) code after `await <delay>` where <delay> is an inline `new Promise(r => setTimeout(r, …))`
//       or a same-file helper of that shape (`const sleep = ms => new Promise(…)`), or
//   (c) a `.then(cb)` chained directly on such a delay,
// calls a STATUS SINK before any network read (supabase / .rpc( / fetch( ). Sinks:
//   set*Btn* / *Status* / *State* / *Phase* / *Request* / *Feedback* / *Reviewed* / *Receipt* /
//   *Sent* / *Acked* / *AckAt* / *Acknowledg* / *Accepted* / *Completed* / *Progress* setters, showToast(…),
//   setToast(<anything but null>), setScreen(…) and go(…).
// Helper indirection is followed: a same-file function called from the timed code (up to 4
// levels deep) is expanded in place, so `setTimeout(markAccepted, 3000)` and
// `setTimeout(() => markAccepted(), 3000)` are both caught.
//
// WHAT IT DOES NOT SEE — cross-file indirection, setters passed around as values or aliased
// to another name, requestAnimationFrame loops, and timing driven by event handlers. Those
// are covered by the runtime harness (tests/harness), which asserts on the rendered screen
// that nothing advances without a scripted server answer.
//
// Legitimate timers stay clean by construction: toast dismissal (setToast(null)), splash,
// pull-to-refresh indicator, keyboard scroll, the allergy auto-advance (setStep is a flow
// step, not a status), the elapsed-time tick (setTick), the write timeout (it only aborts
// and reports failure) and server polls (network read before any sink).

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(fileURLToPath(import.meta.url), '..', '..')
// SCAN_SRC lets the detector be pointed at another tree, e.g. a checkout of the pre-fix code.
const SRC = process.env.SCAN_SRC || join(ROOT, 'src')

const SINK = new RegExp([
  String.raw`\bset\w*(?:Btn|Status|State|Phase|Request|Feedback|Reviewed|Receipt|Sent|Acked|AckAt|Acknowledg|Accepted|Completed|Progress)\w*\s*\(`,
  String.raw`\bshowToast\s*\(`,
  String.raw`\bsetToast\s*\(\s*(?!null\s*\))`,
  String.raw`\bsetScreen\s*\(`,
  String.raw`(?<![\w.$])go\s*\(`,
].join('|'))
const NETWORK = /\bsupabase\b|\.rpc\s*\(|\bfetch\s*\(/

function walk(dir) {
  return readdirSync(dir).flatMap(n => {
    const p = join(dir, n)
    return statSync(p).isDirectory() ? walk(p) : /\.(t|j)sx?$/.test(n) ? [p] : []
  })
}

// Text between the bracket at `open` and its matching close (exclusive), plus the close index.
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
  return { text: src.slice(open + 1, i - 1), end: i - 1 }
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

// Same-file function definitions: name -> body text.
function definitions(src) {
  const defs = new Map()
  const re = /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\([^()]*(?:\([^()]*\)[^()]*)*\)|[A-Za-z_$][\w$]*)\s*(?::[^=]*?)?=>|function\s+([A-Za-z_$][\w$]*)\s*\(/g
  let m
  while ((m = re.exec(src))) {
    const name = m[1] || m[2]
    let i = m.index + m[0].length
    if (m[2]) i = balanced(src, i - 1).end + 1         // skip the parameter list
    while (/\s/.test(src[i])) i++
    let body
    if (src[i] === '{') body = balanced(src, i).text
    else {                                              // expression body: to end of statement
      const rest = src.slice(i)
      const stop = rest.search(/\n\s*(?:const|let|var|function|return|\/\/|\})|;\s*\n/)
      body = stop < 0 ? rest : rest.slice(0, stop)
    }
    if (!defs.has(name)) defs.set(name, body)
  }
  return defs
}

// Inline helper calls into the text, so indirection cannot hide a sink.
function expand(text, defs, depth = 0, seen = new Set()) {
  if (depth > 4) return text
  let out = text
  for (const [, name] of text.matchAll(/(?<![\w.$])([A-Za-z_$][\w$]*)\s*\(/g)) {
    if (seen.has(name) || !defs.has(name)) continue
    seen.add(name)
    out += '\n' + expand(defs.get(name), defs, depth + 1, seen)
  }
  return out
}

function stripCommentsAndStrings(code) {
  return code
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/[^\n]*/g, ' ')
    .replace(/(['"`])(?:\\.|(?!\1)[^\\])*\1/g, '""')
}

// A sink that is not preceded, in the timed code, by a network read.
function unguardedSink(text) {
  const s = SINK.exec(text)
  if (!s) return null
  // Comments and string literals cannot vouch for a network read: strip them first, so a
  // comment mentioning "supabase" before a sink does not exempt it.
  return NETWORK.test(stripCommentsAndStrings(text.slice(0, s.index))) ? null : s[0].replace(/\s*\($/, '').trim()
}

const DELAY_INLINE = /new\s+Promise\s*(?:<[^>]*>)?\s*\(\s*\(?\s*([A-Za-z_$][\w$]*)[^)]*?\)?\s*=>\s*\{?\s*(?:[\w$.]+\s*=\s*)?setTimeout\s*\(\s*\1\b/

export function scan(src) {
  const out = []
  const defs = definitions(src)
  const lineOf = i => src.slice(0, i).split('\n').length
  const report = (i, how, text) => {
    const sink = unguardedSink(expand(text, defs))
    if (sink) out.push({ line: lineOf(i), how, sink })
  }

  // (a) timer callbacks
  for (const m of src.matchAll(/\b(setTimeout|setInterval)\s*\(/g)) {
    const open = m.index + m[0].length - 1
    let cb = firstArg(balanced(src, open).text)
    if (/^[A-Za-z_$][\w$]*$/.test(cb)) {
      if (DELAY_INLINE.test(src.slice(Math.max(0, m.index - 80), m.index + 40)) && /^[a-z_$]\w{0,7}$/.test(cb)
          && !defs.has(cb)) continue   // `setTimeout(resolve, ms)` inside a delay promise: handled by (b)/(c)
      cb = defs.get(cb) ?? cb
    }
    report(m.index, m[1] + ' callback', cb)
  }

  // Delay helpers defined in this file.
  const delayNames = [...defs].filter(([, body]) => DELAY_INLINE.test(body)).map(([n]) => n)
  const delayCall = new RegExp(
    `(?:${delayNames.length ? `(?<![\\w.$])(?:${delayNames.join('|')})\\s*\\(` + '|' : ''}new\\s+Promise\\s*(?:<[^>]*>)?\\s*\\()`, 'g')

  for (const m of src.matchAll(delayCall)) {
    const open = m.index + m[0].length - 1
    const { text: args, end } = balanced(src, open)
    if (m[0].startsWith('new') && !DELAY_INLINE.test(m[0] + args + ')')) continue
    const before = src.slice(Math.max(0, m.index - 12), m.index)
    const after = src.slice(end + 1)
    // (c) delay(...).then(cb)
    const then = /^\s*\.then\s*\(/.exec(after)
    if (then) {
      const thenOpen = end + 1 + then[0].length - 1
      report(m.index, 'delay .then', firstArg(balanced(src, thenOpen).text))
      continue
    }
    // (b) await delay(...); <continuation to the end of the enclosing block>
    if (/\bawait\s*$/.test(before)) {
      let depth = 0, i = end + 1
      for (; i < src.length; i++) {
        if ('([{'.includes(src[i])) depth++
        else if (')]}'.includes(src[i])) { if (depth === 0) break; depth-- }
      }
      report(m.index, 'await delay', src.slice(end + 1, i))
    }
  }
  return out
}

// ── Self-test: every form it claims to catch, and the legitimate timers it must not flag. ──
const MUST_FLAG = {
  'inline timer sets request state': `setTimeout(() => { setBtnStates(p => ({...p, 0: {status:'accepted'}})) }, 3000)`,
  'toast fired from a timer': `ok.then(v => { setTimeout(() => { go('main'); if (v) showToast('Help is on the way') }, 1200) })`,
  'setToast with a message from a timer': `setTimeout(() => setToast('Accepted'), 4000)`,
  'go() from a timer': `setTimeout(() => go('happy'), 5000)`,
  'setScreen from a timer': `setInterval(() => { setScreen('alack') }, 8000)`,
  'named helper as the callback': `const markAccepted = () => { setBtnStates(p => p) }\nsetTimeout(markAccepted, 3000)`,
  'helper called from the callback': `const markAccepted = () => { setReviewedAt('x') }\nsetTimeout(() => { markAccepted() }, 3000)`,
  'acknowledgement setter from a timer': `setTimeout(() => setKitchenAckAt(new Date().toISOString()), 3000)`,
  'two-level indirection': `const inner = () => { setHoldPhase(4) }\nconst outer = () => { inner() }\nsetTimeout(() => outer(), 900)`,
  'await sleep helper then setter': `const sleep = (ms) => new Promise(r => setTimeout(r, ms))\nasync function fake() { await sleep(3000); setBtnStates(p => p) }`,
  'await inline delay then setter': `async function fake() { await new Promise(resolve => setTimeout(resolve, 3000)); setHoldPhase(4) }`,
  'delay .then setter': `const wait = (ms) => new Promise(r => setTimeout(r, ms))\nwait(3000).then(() => setNoteSent(true))`,
  'inline delay .then go()': `new Promise(r => setTimeout(r, 2000)).then(() => go('success'))`,
  'comment mentioning supabase cannot vouch': `setTimeout(() => { /* supabase */ setBtnStates(p => ({...p, 0: {status:'accepted'}})) }, 4000)`,
  'string mentioning fetch( cannot vouch': `setTimeout(() => { const s = 'fetch(x)'; setBtnStates(p => p) }, 4000)`,
}
const MUST_PASS = {
  'server poll (named)': `const check = async () => { const { data } = await supabase.rpc('guest_request_state', {}); setBtnStates(p => applyServerState(p, data)) }\nconst t = setInterval(check, 5000)`,
  'sleep then network then setter': `const sleep = (ms) => new Promise(r => setTimeout(r, ms))\nasync function poll() { await sleep(5000); const { data } = await supabase.rpc('x'); setBtnStates(data) }`,
  'elapsed tick': `const iv = setInterval(() => setTick(t => t+1), 1000)`,
  'toast dismiss': `const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 2400) }`,
  'splash': `const t1 = setTimeout(() => { setShowSplash(false); setAppVisible(true) }, 2600)`,
  'pull indicator': `void refreshState().finally(() => setTimeout(() => ind?.classList.remove('on', 'spin'), 350))`,
  'keyboard scroll': `setTimeout(() => ensureVisible(el), 200)`,
  'allergy auto-advance': `const advance = (from) => { if (from === 'rehearsal') { setRehearsalAck(true); setStep('name'); return } if (fromReview) { setFromReview(false); setStep('review'); return } if (from === 'name') { setStep('allergens'); return } }\nsetTimeout(() => advance('name'), 60)`,
  'write timeout reports failure only': `const timeout = new Promise(resolve => { timer = setTimeout(() => { ctl.abort(); resolve({ data: null, error: { code: 'TIMEOUT' } }) }, 10000) })`,
}

let failed = 0
const expect = (name, cond, detail = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond || !detail ? '' : '  [' + detail + ']'}`)
  if (!cond) failed++
}
for (const [n, code] of Object.entries(MUST_FLAG)) expect(`self-test · flags ${n}`, scan(code).length > 0)
for (const [n, code] of Object.entries(MUST_PASS)) {
  const hits = scan(code)
  expect(`self-test · allows ${n}`, hits.length === 0, JSON.stringify(hits))
}

// ── The real check ──
const files = walk(SRC)
let total = 0
for (const f of files) {
  const hits = scan(readFileSync(f, 'utf8'))
  total += hits.length
  for (const h of hits) expect(`${relative(ROOT, f)}:${h.line} · ${h.how} reaches ${h.sink} without a network read`, false)
}
expect(`src · no timer or delay sets guest-visible status (${files.length} files scanned)`, total === 0, `${total} violation(s)`)

console.log(failed ? `\n${failed} FAILED` : '\nall passed')
process.exit(failed ? 1 : 0)
