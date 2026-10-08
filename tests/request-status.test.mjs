// Unit tests for the guest request status mapping (src/lib/requestStatus.ts).
// Run: node tests/request-status.test.mjs   (Node >= 22.18 / 23.6 strips TS types natively)
//
// The invariant under test (contract C6): a label past "Sent" exists only when the matching
// server timestamp exists. Labels are "Sent" -> "Accepted" -> "Done". Time may only change
// WHETHER the guest can send again, never what is claimed to have happened.

import {
  requestStage, requestStageLabel, requestLabel, isOpen, blocksNewTap, isStillWaiting,
  applyServerState, RESEND_DEBOUNCE_MS, STILL_WAITING_MS,
} from '../src/lib/requestStatus.ts'

let failed = 0
const eq = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  [got ${JSON.stringify(got)}, want ${JSON.stringify(want)}]`}`)
  if (!ok) failed++
}

const NOW = 1_800_000_000_000
const T1 = '2026-10-08T19:00:05Z', T2 = '2026-10-08T19:04:10Z', T0 = '2026-10-08T18:59:00Z'
const req = (o = {}) => ({ phase: 'sent', requestIds: ['r1'], tracked: true, acceptedAt: null, completedAt: null,
  at: NOW - 1000, sentAt: NOW - 1000, sends: 1, resendFailed: false, ...o })
const label = (r, now = NOW) => requestLabel(r, now)

// ── timestamps → label ──
eq('sending while the write is in flight', label(req({ phase: 'sending', requestIds: [], sends: 0 })), 'Sending…')
eq('failed / timed-out write: not confirmed', label(req({ phase: 'failed', requestIds: [], sends: 0 })), "Couldn't confirm. Tap to try again.")
eq('confirmed write, no accepted_at → Sent', label(req()), 'Sent')
eq('accepted_at present → Accepted', label(req({ acceptedAt: T1 })), 'Accepted')
eq('completed_at present → Done', label(req({ acceptedAt: T1, completedAt: T2 })), 'Done')
eq('completed without separate accept → Done', label(req({ completedAt: T2 })), 'Done')
eq('empty-string timestamp is not a timestamp', label(req({ acceptedAt: '' })), 'Sent')
eq('whitespace timestamp is not a timestamp', label(req({ acceptedAt: '  ' })), 'Sent')

// ── untracked (legacy path / RPC not deployed) may never claim progress ──
eq('untracked → plain Sent', label(req({ tracked: false, requestIds: [] })), 'Sent')
eq('untracked ignores even a stray accepted_at', label(req({ tracked: false, acceptedAt: T1, completedAt: T2 })), 'Sent')
eq('failed beats tracked flag', label(req({ phase: 'failed', tracked: false })), "Couldn't confirm. Tap to try again.")

// ── no label anywhere claims more than its timestamp ──
const stages = ['sending', 'failed', 'sent', 'sent_untracked', 'accepted', 'done']
const labels = stages.map(requestStageLabel)
eq('only accepted says "Accepted"', stages.filter((s, i) => /accepted/i.test(labels[i])), ['accepted'])
eq('only done says "Done"', stages.filter((s, i) => /done/i.test(labels[i])), ['done'])
const everyLabel = [...labels,
  label(req({ sentAt: NOW - STILL_WAITING_MS })), label(req({ sends: 2 })), label(req({ resendFailed: true, sends: 2 })),
  label(req({ phase: 'sending', sends: 1 }))]
eq('no label says on the way / acknowledged / coming / alerted / will see',
  everyLabel.filter(l => /on the way|acknowledg|help is|coming|alerted|will see/i.test(l)), [])

// ── polling scope ──
eq('open while Sent', isOpen(req()), true)
eq('open while Accepted', isOpen(req({ acceptedAt: T1 })), true)
eq('closed once Done', isOpen(req({ completedAt: T2 })), false)
eq('never polled without an id', isOpen(req({ requestIds: [] })), false)
eq('never polled when untracked', isOpen(req({ tracked: false })), false)
eq('never polled for a failed write', isOpen(req({ phase: 'failed' })), false)

// ── tap / re-send rules ──
eq('first tap allowed', blocksNewTap(undefined, NOW), false)
eq('tap ignored while sending', blocksNewTap(req({ phase: 'sending' }), NOW), true)
eq('tap retries after failure', blocksNewTap(req({ phase: 'failed' }), NOW), false)
eq('tap starts a new request after Done', blocksNewTap(req({ completedAt: T2 }), NOW), false)
eq('tap ignored while Accepted', blocksNewTap(req({ acceptedAt: T1, sentAt: NOW - 10 * STILL_WAITING_MS }), NOW), true)
// untracked: debounce only
const ut = req({ tracked: false, requestIds: [], sentAt: NOW })
eq('untracked: double tap inside the debounce is ignored', blocksNewTap(ut, NOW + RESEND_DEBOUNCE_MS - 1), true)
eq('untracked: tap after the debounce sends again', blocksNewTap(ut, NOW + RESEND_DEBOUNCE_MS), false)
// tracked: only after STILL_WAITING_MS without acceptance
const tr = req({ sentAt: NOW })
eq('tracked: tap ignored before the wait threshold', blocksNewTap(tr, NOW + STILL_WAITING_MS - 1), true)
eq('tracked: not "still waiting" before the threshold', isStillWaiting(tr, NOW + STILL_WAITING_MS - 1), false)
eq('tracked: tap allowed after the threshold', blocksNewTap(tr, NOW + STILL_WAITING_MS), false)
eq('tracked: label after the threshold claims no progress', label(tr, NOW + STILL_WAITING_MS), 'Still waiting. Tap to send again.')
eq('re-sent request reads "Sent again"', label(req({ sends: 2, requestIds: ['r1', 'r2'] })), 'Sent again')
eq('re-sending reads "Sending again…"', label(req({ phase: 'sending', sends: 1 })), 'Sending again…')
eq('failed re-send keeps the earlier confirmed send visible',
  label(req({ resendFailed: true })), "Sent earlier. Couldn't confirm the new one.")
eq('the elapsed threshold never yields Accepted or Done',
  [STILL_WAITING_MS, 10 * STILL_WAITING_MS].map(d => label(tr, NOW + d)).some(l => /Accepted|Done/.test(l)), false)

// ── folding server rows ──
const local = { 0: req({ requestIds: ['a'] }), 1: req({ requestIds: ['b'] }), 2: req({ tracked: false, requestIds: [] }) }
const after = applyServerState(local, [
  { id: 'a', status: 'accepted', accepted_at: T1, completed_at: null },
  { id: 'zzz', status: 'completed', accepted_at: T1, completed_at: T2 }, // not ours
])
eq('server accepted_at copied onto the matching request', label(after[0]), 'Accepted')
eq('request absent from the response is unchanged', label(after[1]), 'Sent')
eq('foreign ids are ignored', label(after[2]), 'Sent')
eq('status string alone does not advance (timestamps only)',
  label(applyServerState(local, [{ id: 'b', status: 'completed', accepted_at: null, completed_at: null }])[1]), 'Sent')
eq('timestamps never move backwards',
  label(applyServerState(after, [{ id: 'a', status: 'pending', accepted_at: null, completed_at: null }])[0]), 'Accepted')
eq('no change returns the same object (no re-render)', applyServerState(local, []) === local, true)
eq('completion arrives', label(applyServerState(after, [{ id: 'a', accepted_at: T1, completed_at: T2 }])[0]), 'Done')
// re-sent episode: acceptance of the FIRST request is not lost behind the re-send
const ep = { 0: req({ requestIds: ['first', 'second'], sends: 2 }) }
eq('acceptance of the earlier request in a re-sent episode shows',
  label(applyServerState(ep, [{ id: 'first', accepted_at: T1 }, { id: 'second', accepted_at: null }])[0]), 'Accepted')
eq('earliest acceptance across the episode is kept',
  applyServerState(ep, [{ id: 'first', accepted_at: T1 }, { id: 'second', accepted_at: T0 }])[0].acceptedAt, T0)

console.log(failed ? `\n${failed} FAILED` : '\nall passed')
process.exit(failed ? 1 : 0)
