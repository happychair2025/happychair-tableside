-- ═════════════════════════════════════════════════════════════════════════════
-- guest_request_state(p_code text, p_request_ids uuid[]) — READ-ONLY guest receipt
-- Work package W1-4 "Truthful guest" · contract C6. PROPOSAL — apply by the integrator.
-- ═════════════════════════════════════════════════════════════════════════════
--
-- INTENT
--   Contract C6: "Guests see status only from authoritative timestamps (guest_request_state).
--   No simulated progress." Tableside used to advance every service button to
--   "Accepted · On the Way" on a random 3-7 s timer. That timer is deleted (branch
--   w1/tableside). This function is what lets the guest see real progress instead:
--   "Sent" until accepted_at exists, "Accepted" once it does, "Done" once completed_at does.
--
-- SCOPING (mirrors guest_declaration_state, read from production 2026-10-08)
--   * The opaque code is resolved through guest_service_point_from_code, exactly as every
--     other guest RPC does. A retired / unverified / inactive / out-of-service code returns
--     {ok:false, reason:'unavailable'} and nothing else.
--   * Only rows that are BOTH on the resolved asset AND whose id the caller already holds are
--     returned. The ids come from guest_create_request's own response (`request_id`), so a
--     guest can only read back requests it created. Nothing is enumerable: an unknown id, or
--     an id from another table, is simply absent from the result.
--   * Bounded: at most 20 ids per call, and only requests created in the last 24 hours (a
--     receipt is for this visit, not a history API).
--   * Returns timestamps and status only — never accepted_by / completed_by / assigned_to,
--     never a venue or asset id.
--
-- PROPERTIES
--   STABLE, SECURITY DEFINER, search_path pinned to public. Performs no writes (unlike
--   guest_create_request / resolve_service_point_code it does NOT insert a scan row), so the
--   client may poll it (every 5 s while a request is open, and on visibilitychange).
--
-- GRANTS
--   EXECUTE revoked from PUBLIC; granted to anon and authenticated only.
--
-- RELEASE ORDERING
--   Either order is safe. The w1/tableside client treats PGRST202 (function not found) as
--   "progress unavailable": buttons stay at "Sent", which is true, and polling stops for that
--   page load. Applying this function before or after the client deploy changes nothing
--   for guests until both are live.
--
-- VERIFY AFTER APPLY (no writes needed)
--   select public.guest_request_state('NOT-A-CODE', array[gen_random_uuid()]);
--     → {"ok": false, "reason": "unavailable"}
--   select public.guest_request_state('<a real active code>', array[gen_random_uuid()]);
--     → {"ok": true, "requests": []}
--   select has_function_privilege('anon','public.guest_request_state(text,uuid[])','execute');  → true
--   select has_function_privilege('public','public.guest_request_state(text,uuid[])','execute'); → false
-- ═════════════════════════════════════════════════════════════════════════════

create or replace function public.guest_request_state(p_code text, p_request_ids uuid[])
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare sp record; v jsonb;
begin
  if p_request_ids is null or cardinality(p_request_ids) = 0 then
    return jsonb_build_object('ok', true, 'requests', '[]'::jsonb);
  end if;
  if cardinality(p_request_ids) > 20 then
    return jsonb_build_object('ok', false, 'reason', 'too_many');
  end if;

  select * into sp from public.guest_service_point_from_code(p_code);
  if not found then return jsonb_build_object('ok', false, 'reason', 'unavailable'); end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', r.id,
           'status', r.status,
           'accepted_at', r.accepted_at,
           'completed_at', r.completed_at
         ) order by r.created_at), '[]'::jsonb)
    into v
    from public.requests r
   where r.id = any(p_request_ids)
     and r.asset_id = sp.asset_id
     and r.venue_id = sp.venue_id
     and r.created_at >= now() - interval '24 hours';

  return jsonb_build_object('ok', true, 'requests', v);
end
$function$;

revoke all on function public.guest_request_state(text, uuid[]) from public;
grant execute on function public.guest_request_state(text, uuid[]) to anon, authenticated;

comment on function public.guest_request_state(text, uuid[]) is
  'Read-only guest receipt for service requests (C6). Resolves the opaque code, returns status/accepted_at/completed_at only for the given ids on that service point, created within 24h. Writes nothing.';

-- ─────────────────────────────────────────────────────────────────────────────
-- ROLLBACK
--   drop function if exists public.guest_request_state(text, uuid[]);
-- The client tolerates the function's absence (falls back to "Sent"), so rollback needs no
-- coordinated client change.
-- ─────────────────────────────────────────────────────────────────────────────
