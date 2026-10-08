/**
 * GUEST REQUEST STATUS — what a service button may say, derived only from facts.
 *
 * Contract C6: a guest sees request status only from authoritative timestamps. Nothing on
 * the guest's screen may advance because time passed. The previous implementation advanced
 * every button to "Accepted · On the Way" after a random 3-7 s and cleared it after 8-15 s,
 * whether or not any member of staff had seen the request — and even when the request had
 * never been written at all.
 *
 * This module is pure so the mapping can be tested without React or a network:
 *   - `phase` is what THIS client knows about its own write.
 *   - `acceptedAt` / `completedAt` are only ever copied from the server (guest_request_state).
 *   - `tracked` is false on the legacy ?table= / ?asset= entry path, which has no way to read
 *     a request back, so it may never claim anything beyond "sent".
 */

export type RequestPhase = 'sending' | 'failed' | 'sent'

export interface GuestRequest {
  phase: RequestPhase
  /** Server request id from guest_create_request. Null on the legacy path or before it returns. */
  requestId: string | null
  /** True only when this client can read authoritative state for the request. */
  tracked: boolean
  acceptedAt: string | null
  completedAt: string | null
  /** Local time the guest tapped, for the elapsed counter only — never a status signal. */
  at: number
}

export type RequestStage =
  | 'sending'          // write in flight
  | 'failed'           // write did not succeed — nothing was sent
  | 'sent'             // write confirmed, no acceptance recorded yet
  | 'sent_untracked'   // write confirmed, but this entry path cannot read progress
  | 'on_the_way'       // accepted_at exists
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
  if (present(r.acceptedAt)) return 'on_the_way'
  return 'sent'
}

export function requestStageLabel(stage: RequestStage): string {
  switch (stage) {
    case 'sending':        return 'Sending…'
    case 'failed':         return 'Not sent. Tap to try again.'
    case 'sent':           return 'Sent'
    case 'sent_untracked': return 'Sent — your server will see it'
    case 'on_the_way':     return 'On the way'
    case 'done':           return 'Done'
  }
}

/** True while the request may still change on the server and is worth polling for. */
export function isOpen(r: GuestRequest): boolean {
  const s = requestStage(r)
  return r.tracked && !!r.requestId && (s === 'sent' || s === 'on_the_way')
}

/** True when a tap on the button should be ignored rather than create a second request. */
export function blocksNewTap(r: GuestRequest | undefined): boolean {
  if (!r) return false
  const s = requestStage(r)
  return s === 'sending' || s === 'sent' || s === 'on_the_way' || s === 'sent_untracked'
}

export interface ServerRequestState {
  id: string
  status?: string | null
  accepted_at?: string | null
  completed_at?: string | null
}

/**
 * Fold server rows into local requests. Only timestamps are copied; a row missing from the
 * response changes nothing (the server may be briefly unavailable — absence is not evidence).
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
    if (!r.requestId) continue
    const row = byId.get(r.requestId)
    if (!row) continue
    const acceptedAt = r.acceptedAt ?? (present(row.accepted_at) ? row.accepted_at! : null)
    const completedAt = r.completedAt ?? (present(row.completed_at) ? row.completed_at! : null)
    if (acceptedAt !== r.acceptedAt || completedAt !== r.completedAt) {
      next[key] = { ...r, acceptedAt, completedAt }
      changed = true
    }
  }
  return changed ? next : local
}
