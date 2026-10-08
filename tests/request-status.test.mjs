// Unit tests for the guest request status mapping (src/lib/requestStatus.ts).
// Run: node tests/request-status.test.mjs   (Node >= 22.18 / 23.6 strips TS types natively)
//
// The invariant under test (contract C6): a label past "Sent" exists only when the matching
// server timestamp exists, and nothing a client does locally can produce one.

import {
  requestStage, requestStageLabel, isOpen, blocksNewTap, applyServerState,
} from '../src/lib/requestStatus.ts'

let failed = 0
const eq = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  [got ${JSON.stringify(got)}, want ${JSON.stringify(want)}]`}`)
  if (!ok) failed++
}

const T1 = '2026-10-08T19:00:05Z', T2 = '2026-10-08T19:04:10Z'
const req = (o = {}) => ({ phase: 'sent', requestId: 'r1', tracked: true, acceptedAt: null, completedAt: null, at: 0, ...o })
const label = r => requestStageLabel(requestStage(r))

// ── timestamps → label ──
eq('sending while the write is in flight', label(req({ phase: 'sending', requestId: null })), 'Sending…')
eq('failed write says not sent', label(req({ phase: 'failed', requestId: null })), 'Not sent. Tap to try again.')
eq('confirmed write, no accepted_at → Sent', label(req()), 'Sent')
eq('accepted_at present → On the way', label(req({ acceptedAt: T1 })), 'On the way')
eq('completed_at present → Done', label(req({ acceptedAt: T1, completedAt: T2 })), 'Done')
eq('completed without separate accept → Done', label(req({ completedAt: T2 })), 'Done')
eq('empty-string timestamp is not a timestamp', label(req({ acceptedAt: '' })), 'Sent')
eq('whitespace timestamp is not a timestamp', label(req({ acceptedAt: '  ' })), 'Sent')

// ── legacy / untracked path may never claim progress ──
eq('legacy path → Sent, your server will see it', label(req({ tracked: false, requestId: null })), 'Sent — your server will see it')
eq('legacy path ignores even a stray accepted_at', label(req({ tracked: false, acceptedAt: T1, completedAt: T2 })), 'Sent — your server will see it')
eq('failed beats tracked flag', label(req({ phase: 'failed', tracked: false })), 'Not sent. Tap to try again.')

// ── no label anywhere claims more than its timestamp ──
const stages = ['sending', 'failed', 'sent', 'sent_untracked', 'on_the_way', 'done']
const labels = stages.map(requestStageLabel)
eq('only on_the_way says "On the way"', stages.filter((s, i) => /on the way/i.test(labels[i])), ['on_the_way'])
eq('only done says "Done"', stages.filter((s, i) => /done/i.test(labels[i])), ['done'])
eq('no label says accepted / acknowledged / help is coming',
  labels.filter(l => /accepted|acknowledg|help is|coming|alerted/i.test(l)), [])

// ── polling scope ──
eq('open while Sent', isOpen(req()), true)
eq('open while On the way', isOpen(req({ acceptedAt: T1 })), true)
eq('closed once Done', isOpen(req({ completedAt: T2 })), false)
eq('never polled without an id', isOpen(req({ requestId: null })), false)
eq('never polled on the legacy path', isOpen(req({ tracked: false })), false)
eq('never polled for a failed write', isOpen(req({ phase: 'failed' })), false)

// ── tap rules ──
eq('first tap allowed', blocksNewTap(undefined), false)
eq('tap ignored while sending', blocksNewTap(req({ phase: 'sending' })), true)
eq('tap ignored while Sent', blocksNewTap(req()), true)
eq('tap ignored while On the way', blocksNewTap(req({ acceptedAt: T1 })), true)
eq('tap retries after failure', blocksNewTap(req({ phase: 'failed' })), false)
eq('tap starts a new request after Done', blocksNewTap(req({ completedAt: T2 })), false)

// ── folding server rows ──
const local = { 0: req({ requestId: 'a' }), 1: req({ requestId: 'b' }), 2: req({ tracked: false, requestId: null }) }
const after = applyServerState(local, [
  { id: 'a', status: 'accepted', accepted_at: T1, completed_at: null },
  { id: 'zzz', status: 'completed', accepted_at: T1, completed_at: T2 }, // not ours
])
eq('server accepted_at copied onto the matching request', label(after[0]), 'On the way')
eq('request absent from the response is unchanged', label(after[1]), 'Sent')
eq('foreign ids are ignored', label(after[2]), 'Sent — your server will see it')
eq('status string alone does not advance (timestamps only)',
  label(applyServerState(local, [{ id: 'b', status: 'completed', accepted_at: null, completed_at: null }])[1]), 'Sent')
eq('timestamps never move backwards',
  label(applyServerState(after, [{ id: 'a', status: 'pending', accepted_at: null, completed_at: null }])[0]), 'On the way')
eq('no change returns the same object (no re-render)', applyServerState(local, []) === local, true)
eq('completion arrives', label(applyServerState(after, [{ id: 'a', accepted_at: T1, completed_at: T2 }])[0]), 'Done')

console.log(failed ? `\n${failed} FAILED` : '\nall passed')
process.exit(failed ? 1 : 0)
