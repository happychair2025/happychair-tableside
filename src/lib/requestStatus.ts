/**
 * GUEST REQUEST STATUS — what a service button may say, derived only from facts.
 *
 * Contract C6: a guest sees request status only from authoritative timestamps. Nothing on
 * the guest's screen may advance because time passed. The previous implementation advanced
 * every button to "Accepted · On the Way" after a random 3-7 s and cleared it after 8-15 s,
 * whether or not any member of staff had seen the request — and even when the request had
 * never been written at all.
 *
 * Labels: "Sent" → "Accepted" → "Done". "Accepted" records that someone took the request,
 * nothing more — not that anyone is moving to the table.
 *
 * This module is pure so the mapping can be tested without React or a network:
 *   - `phase` is what THIS client knows about its own latest write.
 *   - `acceptedAt` / `completedAt` are only ever copied from the server (guest_request_state).
 *   - `tracked` is false when this client cannot read a request back (legacy ?table= entry,
 *     or the read-only RPC is not deployed). It may then never claim anything beyond "Sent".
 *
 * The only time-dependent rule is WHEN THE GUEST MAY SEND AGAIN — never what has happened:
 *   - untracked: after a short debounce (an accidental double tap is not a second request);
 *   - tracked and still unaccepted: after STILL_WAITING_MS, labelled "Still waiting", which
 *     claims nothing beyond "no acceptance has been recorded".
 */

export type RequestPhase = 'sending' | 'failed' | 'sent'

/** Window in which a second tap is treated as an accidental double tap. */
export const RESEND_DEBOUNCE_MS = 3000
/** A tracked request with no acceptance after this long may be sent again. */
export const STILL_WAITING_MS = 120000

export interface GuestRequest {
  phase: RequestPhase
  /**
   * Every request id this button has written in its current episode (first send plus any
   * re-sends). All are polled, so an acceptance of the first one is not lost behind a re-send.
   */
  requestIds: string[]
  /** True only when this client can read authoritative state for the request. */
  tracked: boolean
  acceptedAt: string | null
  completedAt: string | null
  /** Local time the guest first tapped, for the elapsed counter only — never a status signal. */
  at: number
  /** Local time the latest write was confirmed. Governs only when a re-send is allowed. */
  sentAt: number | null
  /** How many confirmed sends this episode has had (1 after the first). */
  sends: number
  /** The latest re-send did not confirm, while an earlier send did. */
  resendFailed: boolean
}

export type RequestStage =
  | 'sending'          // write in flight
  | 'failed'           // write did not confirm (error or timeout) — nothing known to be sent
  | 'sent'             // write confirmed, no acceptance recorded yet
  | 'sent_untracked'   // write confirmed, but this client cannot read progress
  | 'accepted'         // accepted_at exists
  | 'done'             // completed_at exists

const present = (v: string | null | undefined): boolean =>
  typeof v === 'string' && v.trim().length > 0

export function requestStage(r: Pick<GuestRequest, 'phase' | 'tracked' | 'acceptedAt' | 'completedAt'>): RequestStage {
  if (r.phase === 'sending') return 'sending'
  if (r.phase === 'failed') return 'failed'
  if (!r.tracked) return 'sent_untracked'
  // completed_at outranks accepted_at: a request can be completed by someone who never
  // separately accepted it, and "Done" is then the only true statement.
  if (present(r.completedAt)) return 'done'
  if (present(r.acceptedAt)) return 'accepted'
  return 'sent'
}

/** Stage label without per-request context (used where only the stage is known). */
export function requestStageLabel(stage: RequestStage): string {
  switch (stage) {
    case 'sending':        return 'Sending…'
    case 'failed':         return "Couldn't confirm. Tap to try again."
    case 'sent':           return 'Sent'
    case 'sent_untracked': return 'Sent'
    case 'accepted':       return 'Accepted'
    case 'done':           return 'Done'
  }
}

/** True when a tracked request has gone unaccepted long enough to offer sending again. */
export function isStillWaiting(r: GuestRequest, now: number): boolean {
  return requestStage(r) === 'sent' && r.sentAt !== null && now - r.sentAt >= STILL_WAITING_MS
}

/** The full label for one button. Time can only change WHETHER a re-send is offered. */
export function requestLabel(r: GuestRequest, now: number): string {
  const stage = requestStage(r)
  if (stage === 'sending') return r.sends > 0 ? 'Sending again…' : 'Sending…'
  if (stage === 'failed') return requestStageLabel('failed')
  if ((stage === 'sent' || stage === 'sent_untracked') && r.resendFailed) return "Sent earlier. Couldn't confirm the new one."
  if (stage === 'sent' && isStillWaiting(r, now)) return 'Still waiting. Tap to send again.'
  if ((stage === 'sent' || stage === 'sent_untracked') && r.sends > 1) return 'Sent again'
  return requestStageLabel(stage)
}

/** True while the request may still change on the server and is worth polling for. */
export function isOpen(r: GuestRequest): boolean {
  const s = requestStage(r)
  return r.tracked && r.requestIds.length > 0 && (s === 'sent' || s === 'accepted')
}

/** True when a tap on the button should be ignored rather than create another request. */
export function blocksNewTap(r: GuestRequest | undefined, now: number): boolean {
  if (!r) return false
  const s = requestStage(r)
  if (s === 'sending') return true
  if (s === 'accepted') return true                     // someone has it; nothing to resend
  if (s === 'sent_untracked') return r.sentAt !== null && now - r.sentAt < RESEND_DEBOUNCE_MS
  if (s === 'sent') return !isStillWaiting(r, now)
  return false                                          // failed or done
}

export interface ServerRequestState {
  id: string
  status?: string | null
  accepted_at?: string | null
  completed_at?: string | null
}

const earliest = (a: string | null, b: string | null): string | null =>
  !a ? b : !b ? a : (Date.parse(b) < Date.parse(a) ? b : a)

/**
 * Fold server rows into local requests. Only timestamps are copied, from rows whose id this
 * button wrote; a row missing from the response changes nothing (absence is not evidence).
 * Timestamps never move backwards: once the server has said accepted, a later read that
 * omits it does not un-accept the request on screen.
 */
export function applyServerState<K extends string | number>(
  local: Record<K, GuestRequest>,
  rows: ServerRequestState[]
): Record<K, GuestRequest> {
  const byId = new Map(rows.filter(r => r && typeof r.id === 'string').map(r => [r.id, r]))
  let changed = false
  const next = { ...local }
  for (const key of Object.keys(local) as K[]) {
    const r = local[key]
    let acceptedAt = r.acceptedAt, completedAt = r.completedAt
    for (const id of r.requestIds) {
      const row = byId.get(id)
      if (!row) continue
      if (!r.acceptedAt && present(row.accepted_at)) acceptedAt = earliest(acceptedAt, row.accepted_at!)
      if (!r.completedAt && present(row.completed_at)) completedAt = earliest(completedAt, row.completed_at!)
    }
    if (acceptedAt !== r.acceptedAt || completedAt !== r.completedAt) {
      next[key] = { ...r, acceptedAt, completedAt }
      changed = true
    }
  }
  return changed ? next : local
}
