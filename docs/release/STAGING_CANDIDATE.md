# Tableside staging candidate (phase 1)

**Status:** prepared and tested on 2026-10-16. **Not deployed.** No `staging/tableside` branch
exists yet. Nothing here was merged into `main`, pushed to `staging/*`, or applied to any
database. Runbook: `happychair-admin` `docs/staging/THREE_APP_STAGING.md`.

## What the candidate is

| | SHA |
|---|---|
| Production (`main`, deployed) | `9cf694d68b1aca120a83f789791e1add1cf6f8ea` |
| Candidate code = `w3/staging-config` (#2) head, unchanged | `2956c7793f533cdc286d2a7668b762ce785dcbfd` |
| Candidate head (`w3/staging-candidate`) | the commit that adds this file. Its only parent is `2956c77` and it changes nothing else |

Merge order: none. The candidate is #2 as it stands, which already contains `main` (0 commits of
`main` missing). Conflicts: none.

`vercel.json` at the candidate head: `git.deploymentEnabled` has `"w3/*": false`, so pushing
`w3/staging-candidate` produces no Preview. `staging/*` is deliberately not named, so
`staging/tableside` will deploy.

## Results (local, 2026-10-16, node v24.14.1; no network database)

| Check | Result |
|---|---|
| `npm test` (no-simulated-progress, request-status, `tests/staging-env.test.ts`) | all passed; staging-env **10/10**, including a real `vite build` refusal |
| `npm run test:harness` | **70 passed / 0 failed** |
| `npx tsc -b` | clean |
| Production build: `VERCEL_ENV=production` + production-shaped pair, `npx vite build` (the Vercel `buildCommand`) | built. Production URL and key present; **no staging URL, no staging key** |
| Preview build: `VERCEL_ENV=preview` + staging-shaped pair | built. Staging URL and key present; **no production URL, no production key** |
| Production build given the staging pair | **refused**: `[staging guard] Build refused: a production deployment was given the staging project…`, nothing built |
| Preview build given the production pair | **refused**: `…a Preview deployment was given the production project…`, nothing built |
| Preview build with no variables | **refused**: `Missing Supabase environment variables` |

Keys used were dummies shaped like legacy anon keys (`eyJ…` header, payload `{"ref":"<project>","role":"anon"}`,
a fake signature). No real secret was used.

**Reference counting, stated exactly.** Each bundle contains both project refs once, as the
guard's own constants (`PRODUCTION_REF`, `STAGING_REF` in `src/env/target.mjs`), plus both host
lists. These are classification data, not endpoints: the client is created from the build's own
pair only. Counted endpoints: production bundle has 1 production URL, 0 staging URLs; staging
bundle has 1 staging URL, 0 production URLs.

### Host refusal (headless Chromium)

How: Playwright (`playwright-core` 1.55.1, Chromium 1193) loaded the built `dist/` **at the real
production or staging origin** with no network. Every request to the page's own origin was
answered from the local `dist/` by request interception (`context.route`); every other request
was aborted and recorded. So `location.hostname` inside the page was exactly the spoofed host,
and nothing reached any Supabase project.

| Bundle | Origin | Result |
|---|---|---|
| staging | `https://happychair-tableside.vercel.app/` | **refused**: "This page is not available…", error `A staging build cannot run on the production guest address`; no request attempted |
| staging | `https://HAPPYCHAIR-TABLESIDE.vercel.app./` (case + trailing dot) | **refused**, same |
| staging | `https://happychair-tableside-staging.vercel.app/` | runs; title `[STAGING] Happy Chair Tableside`; strip "STAGING — test only, not a real table" |
| staging | `…-staging…/t/ABCD1234` | only host attempted: `pfzkaqqgwxdkmkmksoiz.supabase.co` |
| production | `https://happychair-tableside-staging.vercel.app/` | **refused**: `A production build cannot run on the staging guest address` |
| production | `https://happychair-tableside.vercel.app/` | runs, no strip; on `/t/ABCD1234` only `hnrojtcctqgtzdrinyvu.supabase.co` attempted |

### Production behaviour vs `main`

Same project, same key, same UI. Differences are the C1 guard only: URL normalisation (case,
trailing `/`), a build that fails on a wrong environment instead of shipping, and the two runtime
refusals above. On the production host with production variables the app behaves as `main`.

## Later: creating `staging/tableside` (NOT run now)

Prerequisites: THREE_APP_STAGING.md step 2 (Tableside Production keeps the production pair;
Preview gets the staging pair) and founder approval.

```sh
git fetch origin
git rev-parse origin/w3/staging-candidate^            # must print 2956c7793f533cdc286d2a7668b762ce785dcbfd
git diff --stat 2956c77 origin/w3/staging-candidate   # must list only docs/release/STAGING_CANDIDATE.md
git push origin origin/w3/staging-candidate:refs/heads/staging/tableside   # creates it; never --force
```

Domain: Vercel → happychair-tableside → Settings → Domains → `happychair-tableside-staging.vercel.app`
assigned to Git branch `staging/tableside`. Never assign `happychair-tableside.vercel.app`.

## Verification after the deploy

```sh
curl -sI https://happychair-tableside-staging.vercel.app/ | head -1                 # HTTP/2 200
B=$(curl -s https://happychair-tableside-staging.vercel.app/ | grep -o '/assets/index-[^"]*\.js')
curl -s "https://happychair-tableside-staging.vercel.app$B" | grep -c 'https://pfzkaqqgwxdkmkmksoiz.supabase.co'   # 1
curl -s "https://happychair-tableside-staging.vercel.app$B" | grep -c 'https://hnrojtcctqgtzdrinyvu.supabase.co'   # 0
P=$(curl -s https://happychair-tableside.vercel.app/ | grep -o '/assets/index-[^"]*\.js')
curl -s "https://happychair-tableside.vercel.app$P" | grep -c 'https://pfzkaqqgwxdkmkmksoiz.supabase.co'           # 0 (production untouched)
```

On a phone: the staging domain shows the orange strip and `[STAGING]` title; the production
domain shows no strip. The Vercel build log of `staging/tableside` has no `[staging guard]` line
(a refusal would fail the build).

## Rollback

- Unassign the staging domain and delete the branch with an ordinary push:
  `git push origin --delete staging/tableside`. Never force-push.
- Nothing is promoted to production. `staging/tableside` never merges into `main`.
- Roll back if: the strip is missing on the staging domain; the bundle names the production URL;
  any request from the staging domain reaches `hnrojtcctqgtzdrinyvu`; or the production domain
  changes in any way.
