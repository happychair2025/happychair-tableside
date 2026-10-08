-- ═════════════════════════════════════════════════════════════════════════════
-- guest_submit_sentiment — stop recording a review prompt that is never shown
-- Work package W1-4 "Truthful guest" · contracts C8, C12. PROPOSAL — apply by the integrator.
-- ═════════════════════════════════════════════════════════════════════════════
--
-- INTENT
--   The live function (read from production 2026-10-08) writes
--   google_review_prompted = (p_score = 3). Tableside showed a "Leave a Review" button on the
--   score-3 screen, but that button had no action, and branch w1/tableside removes it. From
--   that deploy on, NO guest is prompted for a review, so recording `true` fabricates the
--   admin "review prompts" metric (SettingsPage.tsx:132, Dashboard.tsx:158,
--   ModulesPage.tsx:80 read it). The legacy direct-insert path on w1/tableside already writes
--   false.
--
-- CHANGE
--   Identical to the live definition except google_review_prompted is written as false.
--   Same signature, SECURITY DEFINER, search_path, return shape. CREATE OR REPLACE keeps the
--   existing EXECUTE grants (PUBLIC, anon, authenticated, service_role) unchanged.
--   When a real review prompt ships, it should set this flag at the moment it is SHOWN, not
--   at rating time.
--
-- HISTORY IS NOT REWRITTEN
--   36 existing rows carry google_review_prompted = true and 16 carry
--   google_review_clicked = true (nothing in any client writes google_review_clicked, so those
--   are seed/legacy values). This migration does not touch them; whether to correct or label
--   that history is a separate Product Owner decision.
--
-- RELEASE ORDERING
--   Apply with (or after) the w1/tableside deploy. Before it, the button is still visible
--   (though inert), so either order is defensible; after it, this is required for the metric
--   to be true.
--
-- VERIFY AFTER APPLY (read-only)
--   select pg_get_functiondef('public.guest_submit_sentiment(text,integer)'::regprocedure)
--     ilike '%p_score = 3, p_score = 1%';                     → false
--   select proacl from pg_proc where oid = 'public.guest_submit_sentiment(text,integer)'::regprocedure;
--     → unchanged ({=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres})
-- ═════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.guest_submit_sentiment(p_code text, p_score integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare sp record; s public.sentiment_ratings;
begin
  select * into sp from public.guest_service_point_from_code(p_code);
  if not found then return jsonb_build_object('ok', false, 'reason', 'unavailable'); end if;

  -- google_review_prompted is false: rating is not prompting. It is set only when a review
  -- prompt is actually shown to the guest, and no such prompt exists today.
  insert into public.sentiment_ratings
    (venue_id, asset_id, score, google_review_prompted, manager_intervention_needed, notification_priority)
  values (sp.venue_id, sp.asset_id, p_score,
          false, p_score = 1,
          case p_score when 3 then null when 2 then 'normal' else 'urgent' end)
  returning * into s;
  return jsonb_build_object('ok', true, 'sentiment_id', s.id);
end
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- ROLLBACK (the exact live definition as of 2026-10-08)
--
-- CREATE OR REPLACE FUNCTION public.guest_submit_sentiment(p_code text, p_score integer)
--  RETURNS jsonb
--  LANGUAGE plpgsql
--  SECURITY DEFINER
--  SET search_path TO 'public'
-- AS $function$
-- declare sp record; s public.sentiment_ratings;
-- begin
--   select * into sp from public.guest_service_point_from_code(p_code);
--   if not found then return jsonb_build_object('ok', false, 'reason', 'unavailable'); end if;
--
--   insert into public.sentiment_ratings
--     (venue_id, asset_id, score, google_review_prompted, manager_intervention_needed, notification_priority)
--   values (sp.venue_id, sp.asset_id, p_score,
--           p_score = 3, p_score = 1,
--           case p_score when 3 then null when 2 then 'normal' else 'urgent' end)
--   returning * into s;
--   return jsonb_build_object('ok', true, 'sentiment_id', s.id);
-- end
-- $function$;
-- ─────────────────────────────────────────────────────────────────────────────
