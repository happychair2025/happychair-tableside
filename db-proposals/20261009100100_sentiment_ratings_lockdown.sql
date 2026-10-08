-- ═════════════════════════════════════════════════════════════════════════════
-- sentiment_ratings lockdown — writes only through the guest server functions
-- Work package W1-4 "Truthful guest" · contract C8. PROPOSAL — apply by the integrator.
-- ═════════════════════════════════════════════════════════════════════════════
--
-- CURRENT STATE (read from production 2026-10-08)
--   RLS enabled (not forced). Three policies:
--     "anon can insert sentiment_ratings"   INSERT  anon           with_check true
--     "auth full access sentiment"          ALL     authenticated  qual true / check true
--     "auth full access sentiment_ratings"  ALL     authenticated  qual true / check true   (duplicate)
--   Table grants: anon AND authenticated hold INSERT, SELECT, UPDATE, DELETE, TRUNCATE,
--   REFERENCES, TRIGGER.
--   => any signed-in user of ANY venue can read, rewrite or delete every venue's sentiment;
--      any anonymous caller can insert arbitrary rows for any venue/asset. Same cross-venue
--      shape closed for requests/assets by Lifecycle RLS Hardening (June 25, 2026).
--   Not in any realtime publication.
--
-- TARGET (contract C8: "Ratings and notes are written only through server functions")
--   * authenticated: SELECT only, venue members only — venue_id in user_active_venue_ids().
--     No INSERT / UPDATE / DELETE policy, and the write grants are revoked as well.
--   * anon: no policy and no table privilege at all.
--   * Writes continue through the existing SECURITY DEFINER functions, which are owned by
--     postgres and therefore unaffected: guest_submit_sentiment, guest_add_sentiment_note
--     (both resolve the opaque code server-side), and detect_recovery_cases (service_role).
--   * service_role (nightly-aggregate Edge Function) bypasses RLS and is unaffected.
--
-- WHO IS AFFECTED (checked read-only)
--   Admin (happychair-admin/src) — READS ONLY, all filtered by the operator's own venue, so
--   all continue to work for venue members:
--     src/pages/GuestSentiment.tsx:21, :45     src/pages/Dashboard.tsx:151, :158, :164
--     src/pages/FloorManager.tsx:175           src/components/floor/LiveView.tsx:177
--     src/pages/SettingsPage.tsx:132, :133     src/pages/ModulesPage.tsx:80
--   No admin code inserts, updates or deletes sentiment_ratings. The watch-preview worktree
--   carries copies of the same read sites. happychair-staff and happychair-passport do not
--   reference the table. supabase/functions/nightly-aggregate uses the service role key.
--
--   Tableside — the ONLY breakage:
--     * Legacy ?table= / ?asset= entry: submitSentiment does a direct anon
--       insert(...).select('id').single(). After this migration it fails with 42501 and the
--       guest sees the existing honest error ("Couldn't send feedback — try again.").
--       NOTE: that path is very likely ALREADY failing today — anon has an INSERT policy but
--       no SELECT policy, and PostgREST's return=representation requires the inserted row to
--       pass a SELECT policy. Expected from RLS semantics, not verified live (verifying would
--       require a write).
--     * The legacy anon direct UPDATE of notes was removed on branch w1/tableside (it matched
--       zero rows under RLS and reported success); the note box is now hidden on that path.
--     * The permanent-code (/t/<code>) path uses guest_submit_sentiment and
--       guest_add_sentiment_note only, and is unaffected.
--
-- RELEASE ORDERING
--   Safe to apply after w1/tableside is deployed (the code path never touches the table
--   directly). Applying before deploy only affects the legacy anon note UPDATE, which was
--   already a silent no-op.
--
-- VERIFY AFTER APPLY
--   select policyname, cmd, roles, qual from pg_policies where tablename='sentiment_ratings';
--     → exactly one row: sentiment_ratings_select_venue_members | SELECT | {authenticated}
--   select grantee, privilege_type from information_schema.role_table_grants
--    where table_name='sentiment_ratings' and grantee in ('anon','authenticated');
--     → authenticated SELECT only
--   Admin Guest Sentiment page and Dashboard still show today's ratings for the operator.
-- ═════════════════════════════════════════════════════════════════════════════

begin;

-- 1. Replacement first (additive), so authenticated reads never see a gap.
create policy sentiment_ratings_select_venue_members
  on public.sentiment_ratings
  for select
  to authenticated
  using (venue_id in (select public.user_active_venue_ids()));

-- 2. Drop the broad policies (guarded: abort if the replacement is missing).
do $$
begin
  if not exists (select 1 from pg_policies
                  where schemaname = 'public' and tablename = 'sentiment_ratings'
                    and policyname = 'sentiment_ratings_select_venue_members') then
    raise exception 'replacement policy missing — refusing to drop broad policies';
  end if;
end $$;

drop policy if exists "auth full access sentiment"          on public.sentiment_ratings;
drop policy if exists "auth full access sentiment_ratings"  on public.sentiment_ratings;
drop policy if exists "anon can insert sentiment_ratings"   on public.sentiment_ratings;

-- 3. Grants: anon gets nothing; authenticated keeps SELECT only.
revoke all on table public.sentiment_ratings from anon;
revoke insert, update, delete, truncate, references, trigger on table public.sentiment_ratings from authenticated;
grant select on table public.sentiment_ratings to authenticated;

commit;

-- NOTE: Supabase's MCP execute_sql is not transactional (CLAUDE.md §8.1). If applied through
-- it, run the three stages separately and verify between them (create → verify → drop →
-- revoke), as the Lifecycle RLS Hardening runbook does.

-- ─────────────────────────────────────────────────────────────────────────────
-- ROLLBACK (restores the exact pre-migration state, including the broad policies)
--
-- begin;
-- grant insert, select, update, delete, truncate, references, trigger
--   on table public.sentiment_ratings to anon, authenticated;
-- create policy "anon can insert sentiment_ratings" on public.sentiment_ratings
--   for insert to anon with check (true);
-- create policy "auth full access sentiment" on public.sentiment_ratings
--   for all to authenticated using (true) with check (true);
-- create policy "auth full access sentiment_ratings" on public.sentiment_ratings
--   for all to authenticated using (true) with check (true);
-- drop policy if exists sentiment_ratings_select_venue_members on public.sentiment_ratings;
-- commit;
-- ─────────────────────────────────────────────────────────────────────────────
