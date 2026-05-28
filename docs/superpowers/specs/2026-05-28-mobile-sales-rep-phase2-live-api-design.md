# Mobile Sales Rep — Phase 2 Sub-project 1: Live API Integration

**Author:** Claude (via brainstorming skill)
**Authoring date:** 2026-05-28
**Status:** Awaiting Irfan's review
**Sub-project of:** TalkMate Mobile Phase 2 (6 sub-projects total — this is #1)
**Related Phase 1 spec:** `talkmate-mobile-sales-rep-brief.md` (shipped 2026-05-27 per memory `talkmate-mobile-sales-rep`)

---

## 1. Summary

The `talkmate-mobile` app currently has a working Sales Rep mode (5 tabs: Leads · Pipeline · Activity · Commissions · Support) running on mock data, shipped 2026-05-27. This spec covers replacing the mock data with live calls to the `talkmate-portal` backend, plus the auth, distribution, and audit work needed to put a real installable app in Jade's hand.

**Outcome:** Jade signs in on a TestFlight build with her real `@talkmate.com.au` credentials, sees her real leads, marks a real lead won, and the commission row lands in production Supabase. Same for any other active sales rep.

**Scope discipline:** This is sub-project #1 of six. Push notifications, in-app voice recording, drag-and-drop kanban, offline drafts queue, and deep linking are deliberately deferred to their own future specs.

---

## 2. Goals and non-goals

### Goals
- Replace mock data on the mobile Sales Rep tabs with live portal API calls.
- Add an in-app "Add Lead" modal (Phase 1 currently shows an Alert pointing to the portal).
- Make the mobile app installable as a real app (TestFlight on iOS, internal track on Android).
- Run a full end-to-end audit on a real device and fix any bugs found before declaring done.

### Non-goals (deferred to later sub-projects)
- Push notifications (sub-project 2).
- In-app voice recording with Whisper transcription (sub-project 3).
- Drag-and-drop on the pipeline kanban (sub-project 4).
- Offline drafts queue surviving app kill (sub-project 5).
- Deep linking from email/SMS into the app (sub-project 6).
- Mobile parity for `/sales/demo`, `/sales/hitlist`, `/sales/leads/[id]/proposal` (separate spec).
- Twilio-tracked outbound calls (separate spec, possibly never).

---

## 3. Architecture

Two repos, one mobile bundle, one Supabase project per environment.

```
talkmate-mobile (new GitHub repo)        talkmate-portal (existing repo)
─────────────────────────────────         ────────────────────────────────
Expo SDK 54 + React Navigation v7         Next.js + Vercel
                                          
  Supabase JS SDK                          Supabase Auth ────────────┐
  (AsyncStorage adapter)  ─── login ──→                              │
                                                                     │
  Fetch layer with 3× retry  ── Bearer JWT ─→  requireSalesRep()    ─┘
                                               (now reads Bearer
                                                or SSR cookie)
                                                     │
                                                     ▼
                                               5 new GET routes
                                               + 1 PATCH extension
                                               + 1 migration
                                                     │
                                                     ▼
                                               Supabase (prod or preview)
```

### Security boundary

The Supabase JWT is the rep's identity. `requireSalesRep()` (existing helper at `src/lib/sales-auth.ts`) is extended to accept the JWT either from the SSR cookie (current behavior — web portal) OR from the `Authorization: Bearer <jwt>` header (new — mobile app). Once verified, the helper looks up the matching `sales_reps` row and gates on `status = 'active'`, identical to the web flow. Server-side database access continues to use `createAdminClient()` (service role) per the portal's existing architecture. RLS is NOT the security boundary.

### Environment selection

The mobile app reads `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_SUPABASE_URL`, and `EXPO_PUBLIC_SUPABASE_ANON_KEY` from EAS-channel-scoped env vars set via `eas env:create`. `production` channel ships prod values; `preview` channel ships preview-Supabase values (project `rgifivtzmjvanzqwgadq` per memory `talkmate-preview-supabase`). Bundle ID stays `com.talkmate.mobile` for both channels.

---

## 4. Backend changes (Stage 1 — portal PR, ~3 days)

### 4.1 Migration 058

New file: `supabase/migrations/058_lead_followup_at.sql`

(Migration numbering confirmed against live repo on 2026-05-28: migrations 050-057 already taken by sessions 42, 42b, 43, 53-56. Next free is 058. Re-verify with `ls supabase/migrations/ | tail -3` before applying.)

```sql
BEGIN;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS next_followup_at timestamptz;
CREATE INDEX IF NOT EXISTS idx_leads_next_followup_at_active
  ON leads(next_followup_at)
  WHERE status NOT IN ('won', 'lost', 'bad_lead') AND next_followup_at IS NOT NULL;
COMMIT;
```

Migration number per live `SYSTEM_MAP.md` "Next migration number: 058" (verified 2026-05-28).

### 4.2 Auth extension to `requireSalesRep()`

File: `src/lib/sales-auth.ts`

Current behavior: reads Supabase session from SSR cookies (via `@supabase/ssr`).

New behavior: if `Authorization: Bearer <jwt>` is present, verify the JWT via `supabase.auth.getUser(jwt)` using the service-role client; on success, treat the returned user as authenticated and proceed with the existing `sales_reps` lookup + active-status gate. Cookie fallback unchanged.

The implementation must NOT trust the Bearer header without verifying it against Supabase. The JWT signature check happens inside `getUser()`.

### 4.3 Five new GET endpoints

All gated by the updated `requireSalesRep()`. All return `{ ok: true, data: ... }` on success or `{ ok: false, error: string }` on failure. All use `createAdminClient()` post-auth, per the portal's existing pattern.

| Route | Returns |
|---|---|
| `GET /api/sales/me` | The rep's row from `sales_reps` joined with computed `commission_rate` and `bonus_rate` from `COMMISSION_MAP` (see `src/lib/commission.ts`). Shape matches the mobile `mockSalesRep` object minus `joinedDate` (use `created_at`). |
| `GET /api/sales/leads` | The rep's assigned leads (`assigned_to = auth.rep.id`). Includes the columns mobile already expects: `id, business_name, contact_name, phone, email, industry, suburb, state, status, next_followup_at, won_plan, won_at, lost_reason, created_at, updated_at`. Excludes `bad_lead` status by default; supports `?include=bad_lead` if needed by a future view. |
| `GET /api/sales/activity?since=today\|week` | Activity rows from `lead_activities` for leads where `assigned_to = auth.rep.id`. Joined with `leads.business_name` and `leads.contact_name` for display. Default `since=week`. |
| `GET /api/sales/commissions` | Commission rows from `commissions` where `sales_rep_id = auth.rep.id`. Joined with `businesses.name` for display. Returns all three statuses (pending / approved / paid). |
| `GET /api/sales/pipeline` | A stages array: `[{ id: 'new', label: 'New', count: N, leads: [...] }, ...]` for the 7 in-flight stages. Single query: select all assigned leads, group client-side in the route handler. |

### 4.4 PATCH extension

File: `src/app/api/sales/leads/[id]/route.ts`

Add `next_followup_at` to `EDITABLE_FIELDS`. Validate it's either `null` or a valid ISO timestamp before passing to the update. Reject anything else with a 400.

### 4.5 Audit + verification

After all five GETs are implemented, ship through the existing pipeline (Builder → Validator → QA Tester → Reviewer). QA Tester uses curl with a real rep JWT to verify each endpoint returns the expected shape. Reviewer GREEN-lights merge to `dev`, then `dev` → `main`, Vercel auto-deploys.

---

## 5. Mobile changes (Stage 2 — mobile PR, ~5 days)

### 5.1 Repo setup

Push the existing local commits at `C:\Users\info\.claude\WEBSITE BUILD\talkmate-mobile` to a new GitHub repo `irfanhanif89-art/talkmate-mobile`. Initial branch: `main` (already exists locally from commit `ebbede8`). Add a `.gitignore` if missing. Add a brief README pointing at the portal repo for context.

### 5.2 Supabase SDK integration

Install `@supabase/supabase-js` and `@react-native-async-storage/async-storage`. Create `src/lib/supabase.ts`:

```js
import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  }
);
```

`react-native-url-polyfill` is required because Supabase SDK uses URL APIs that RN doesn't ship.

### 5.3 AuthContext rewrite

`src/context/AuthContext.js` currently has three hardcoded mock branches. Rewrite as:

- `login(email, password)` calls `supabase.auth.signInWithPassword({ email, password })`.
- On success, fetch `GET /api/sales/me` to confirm the user is a sales rep. If yes, set `user` + `rep` from the response and route to Sales Rep tabs. If no, sign out and reject with "Not a sales rep — use the portal at app.talkmate.com.au."
- `logout()` calls `supabase.auth.signOut()` and clears state.
- The admin / client branches (Glen, Irfan) are removed from this app's AUTH FLOW — mobile is sales-rep-only from now on. The admin and client screen files (`src/screens/client/*`, `src/screens/admin/*`) and tab definitions stay in the repo as dead code (leaves the door open for a future client-mobile build). `AppNavigator.js` is simplified to: `unauthenticated → Login` or `authenticated → SalesRepTabs`. The three-way branch (admin / client / sales rep) collapses to a single sales-rep flow.
- `loginAsDemoClient()` is removed (it was a Phase 1 onboarding-screen shortcut to drop a new signup into the demo client view; with mobile being sales-rep-only, it has no callers).

### 5.4 Fetch layer

New file `src/lib/api.ts`:

```js
async function apiFetch(path, options = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');
  const url = process.env.EXPO_PUBLIC_API_URL + path;
  return fetch(url, {
    ...options,
    headers: {
      ...options.headers,
      Authorization: `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
    },
  });
}

export async function apiGet(path) { /* with 3× retry, exponential backoff 500/1000/2000ms */ }
export async function apiPost(path, body) { /* same */ }
export async function apiPatch(path, body) { /* same */ }
```

Retry policy: 3 attempts with backoff 500ms / 1000ms / 2000ms. Retry only on network errors and 5xx. Don't retry 4xx (those are deterministic).

### 5.5 Screen rewrites

Each of the five sales screens drops its mock import and gains a `useEffect`-driven fetch on mount + on screen-foreground (`useFocusEffect` from React Navigation). Pull-to-refresh hooks already exist in Phase 1 — keep them.

| Screen | Old mock | New fetch |
|---|---|---|
| `LeadsScreen.js` | `mockLeads` | `apiGet('/api/sales/leads')` |
| `LeadDetailScreen.js` | lead from `mockLeads` by id | passed from LeadsScreen (already real shape); activity refetched via `GET /api/sales/leads/[id]/activities` (already exists) |
| `PipelineScreen.js` | `getMockPipelineCounts()` | `apiGet('/api/sales/pipeline')` |
| `ActivityScreen.js` | `mockLeadActivities` | `apiGet('/api/sales/activity?since=week')` |
| `CommissionsScreen.js` | `mockCommissionsForRep` | `apiGet('/api/sales/commissions')` |

Loading state: skeleton rows until the response arrives (or the first 200ms passes, whichever is later, to avoid flashing). Error state: red banner "Couldn't load — pull down to retry." Empty state: keep existing `EmptyState` component.

### 5.6 Mutations

Each mutation goes through the new `api.ts` layer with optimistic UI:

| User action | API call |
|---|---|
| Tap "Mark Won" → submit modal | `POST /api/sales/leads/[id]/won` (exists) |
| Tap "Mark Lost" → submit modal | `POST /api/sales/leads/[id]/lost` (exists) |
| Change stage via horizontal selector | `PATCH /api/sales/leads/[id]` with `{ status }` (exists) |
| Add note via TextInput modal | `POST /api/sales/leads/[id]/activities` with `{ activity_type: 'note', body }` (exists) |
| Set followup date | `PATCH /api/sales/leads/[id]` with `{ next_followup_at }` (extended in 4.4) |
| Add new lead | `POST /api/sales/leads` (exists) |

Optimistic UI: update local list state immediately, fire the network call in the background. On success, swap the optimistic row for the server-returned row. On 3 failed retries, revert the optimistic change AND show a top-of-screen banner "Couldn't save — tap to retry."

### 5.7 Stage list alignment

Update everywhere the mobile uses `stage` to use `status`. Replace the stage enum:

- **Remove:** `qualified`
- **Add:** `demo_done`, `nurture`
- **Keep:** `new`, `contacted`, `demo_booked`, `proposal_sent`, `won`, `lost`

Pipeline kanban shows 7 in-flight columns: New, Contacted, Demo Booked, Demo Done, Proposal Sent, Nurture, Won. Lost stays hidden from kanban (reachable via filter chip + Mark Lost modal). `bad_lead` is excluded from mobile entirely in this spec.

### 5.8 Add Lead modal

New component `src/components/sales/AddLeadModal.js`. Form fields: business_name (required), contact_name (required), phone (required), email, industry (free text for now — no industry picker), suburb, state, source (dropdown: cold_call / referral / walk_in / online / other). Submit calls `POST /api/sales/leads`. On success, prepend to the list and navigate to LeadDetail. On error, show inline form errors.

### 5.9 CommandBar hide

Wherever `CommandBar` renders inside a Sales Rep screen, gate on `!isSalesRep` (or pass an explicit `hidden` prop). Don't delete the component — clients and the (now dead) admin mode keep it for later. Add a code comment explaining the hide is intentional for sub-project 1.

### 5.10 Reassignment edge case

If a mutation returns 404 from a `/api/sales/leads/[id]/*` endpoint (lead no longer assigned to this rep), the mobile shows a toast: "This lead is no longer assigned to you" and bounces back to LeadsScreen. The next refresh will naturally drop the lead from the list since the GET filters on `assigned_to = me`.

---

## 6. Distribution (Stage 3 — EAS setup, ~2 days, blocked on accounts)

### Prerequisites (Irfan does these)

- Sign up for **Apple Developer Program** ($99 USD/yr) at developer.apple.com. Use the same Apple ID associated with TalkMate (or whichever ID you want to own the bundle).
- Sign up for **Google Play Console** ($25 USD one-time) at play.google.com/console.
- Sign up for an **Expo account** (free) at expo.dev — used for EAS Build.

These are HARD blockers for Stage 3. Stages 1 and 2 can proceed without them.

### EAS configuration

New file `eas.json` in `talkmate-mobile`:

```json
{
  "cli": { "version": ">= 5.0.0" },
  "build": {
    "production": {
      "channel": "production",
      "ios": { "resourceClass": "m-medium" },
      "android": { "buildType": "app-bundle" }
    },
    "preview": {
      "channel": "preview",
      "distribution": "internal",
      "ios": { "simulator": false },
      "android": { "buildType": "apk" }
    }
  },
  "submit": {
    "production": {
      "ios": { "appleId": "<Irfan's apple id>", "ascAppId": "<filled after first submit>" },
      "android": { "serviceAccountKeyPath": "./play-service-account.json" }
    }
  }
}
```

### Env vars in EAS

Set via `eas env:create`:

| Channel | `EXPO_PUBLIC_API_URL` | `EXPO_PUBLIC_SUPABASE_URL` | `EXPO_PUBLIC_SUPABASE_ANON_KEY` |
|---|---|---|---|
| production | `https://app.talkmate.com.au` | `https://mdsfdaefsxwrakgkyflr.supabase.co` | prod anon |
| preview | `https://<latest-dev-branch-vercel-preview-url>` | `https://rgifivtzmjvanzqwgadq.supabase.co` | preview anon |

**Note on preview URLs:** Vercel preview URLs are per-deployment (e.g. `talkmate-portal-git-dev-irfanhanif89-art.vercel.app`). For the mobile preview channel we use the stable `git-dev-` alias that Vercel generates for the `dev` branch — it updates automatically as `dev` advances. If Vercel doesn't generate a stable alias by default, set up one via `vercel alias` pointing at the latest `dev` deployment. As a fallback, the preview channel can be omitted entirely and Expo Go used for all non-production iteration; in that case prod is the only EAS build target.

### App Store + Play Store assets

- App icon: existing `assets/icon.png` (verify it's 1024×1024 PNG with no transparency for App Store).
- Splash screen: configure via `expo-splash-screen` plugin in `app.json`.
- App Store description: ~250 words explaining "TalkMate Sales Rep — internal tool for TalkMate sales reps to manage leads, log calls, and track commissions on the go." Internal-use language; no public marketing claims.
- Privacy policy URL: pointer to the existing portal privacy policy at `app.talkmate.com.au/privacy` (verify exists; create stub if not).
- App Store Connect setup: complete during first submission via `eas submit -p ios --profile production`.
- Google Play Console setup: complete during first submission via `eas submit -p android --profile production`.

### TestFlight + Android internal track

- Build production: `eas build -p all --profile production`.
- Submit to App Store: `eas submit -p ios --profile production` (auto-uploads to TestFlight; first review can take 24-48h).
- Submit to Google Play internal track: `eas submit -p android --profile production` (faster — usually ~30min).
- Invite Jade to TestFlight via App Store Connect (her Apple ID email).
- Add Jade to the Android internal track if she has Android too.

---

## 7. Full end-to-end audit (Stage 4 — mandatory, ~1 day)

**Pre-authorized by Irfan in chat 2026-05-28: "when you have finished building this, I want you to do a full end to end audit and make sure that everything works as it should. And if there are any bugs or things that do not work, I authorize you to go ahead and fix them."**

Audit checklist — every item must pass before declaring the build done. Bugs found are fixed inline without additional approval.

### Auth + identity
- [ ] Sign in with Jade's real prod credentials on a TestFlight build → reaches LeadsScreen.
- [ ] Sign out → returns to login screen, AsyncStorage session cleared (verified by signing back in to a fresh session).
- [ ] Sign in with a non-sales-rep email (e.g. a client account) → app shows "Not a sales rep" error and stays on login.
- [ ] Force-quit app and reopen → Jade is still signed in (session persisted).
- [ ] Wait 1 hour, return to app → session auto-refreshes silently, no re-login prompt.

### Leads tab
- [ ] LeadsScreen loads Jade's real assigned leads (count matches `SELECT count(*) FROM leads WHERE assigned_to = '<jade-id>'`).
- [ ] All five filter chips (All / Hot / Warm / Cold / Today) filter correctly.
- [ ] Search by business name + contact name + phone all work.
- [ ] Pull-to-refresh re-fetches.
- [ ] Returning to LeadsScreen from another tab triggers auto-refresh.
- [ ] Tap a lead row → LeadDetailScreen renders with the same data.
- [ ] "Call" button opens the device dialer with the lead's phone.
- [ ] "SMS" button opens the SMS composer with the prefilled body.

### LeadDetail
- [ ] Identity card shows real lead data.
- [ ] Stage selector reflects the current `status`.
- [ ] Tap a different stage → optimistic UI swaps, PATCH lands, screen reflects new stage; verify in Supabase that `leads.status` updated.
- [ ] Mark Won modal: pick plan + billing cycle + setup fee waiver → POST lands; verify commission row created in Supabase with correct base + bonus amounts.
- [ ] Mark Lost modal: pick reason → POST lands; verify `leads.status = 'lost'` and `lost_reason` set.
- [ ] Add Note: type a note, save → POST lands; verify row in `lead_activities` with `activity_type = 'note'`.
- [ ] Followup picker: pick a date → PATCH lands; verify `leads.next_followup_at` set in Supabase.

### Pipeline tab
- [ ] All 7 in-flight columns render with correct counts.
- [ ] Tap a card → LeadDetailScreen for that lead.
- [ ] Lost column not shown.

### Activity tab
- [ ] Today / Yesterday / This Week sections render with correct activity rows.
- [ ] Stat tiles up top match the activity log.
- [ ] Tap a row → corresponding LeadDetailScreen.

### Commissions tab
- [ ] Pending / Approved / Paid tabs show correct rows.
- [ ] Hero total matches the sum of unpaid commissions.
- [ ] Policy modal opens and closes cleanly.

### Add Lead modal
- [ ] Required field validation fires on missing business_name / contact_name / phone.
- [ ] Source dropdown shows all 5 options.
- [ ] Submit → lead appears in Jade's list immediately, then settles into the real list on refresh.
- [ ] Verify row in Supabase `leads` table with `assigned_to = jade-id` and `assigned_by = jade-auth-user-id`.

### Security check
- [ ] Pick a lead assigned to a different rep (e.g. via SQL). Confirm Jade's mobile does NOT see it in any list or pipeline.
- [ ] Reassign one of Jade's leads to another rep via admin portal. Trigger refresh on Jade's mobile. Confirm the lead disappears.
- [ ] If Jade has the reassigned lead open in LeadDetail at the moment of reassignment, attempt a mutation. Confirm 404 → toast → bounce to LeadsScreen.

### Network resilience
- [ ] Enable airplane mode mid-mutation. Confirm optimistic UI shows the change, then the "Couldn't save — tap to retry" banner appears after 3 retries.
- [ ] Tap retry. Disable airplane mode. Mutation completes.
- [ ] Force a 500 from the server (via temporarily breaking the endpoint). Confirm 3 retries with backoff, then banner.
- [ ] Force a 401 (expired token). Confirm app prompts re-login cleanly.

### Distribution
- [ ] TestFlight install on Jade's iPhone succeeds.
- [ ] App icon shows the orange TalkMate icon (not the Expo default).
- [ ] Splash screen shows during launch.
- [ ] Background → foreground triggers data refresh.

### Stages 1-3 sign-off
- [ ] Migration 050 applied to prod Supabase.
- [ ] All 5 new GET endpoints return 200 against prod with a real rep JWT (curl test).
- [ ] PATCH `/api/sales/leads/[id]` accepts `next_followup_at` and rejects invalid values.
- [ ] `requireSalesRep()` still accepts SSR cookies (web portal didn't break — smoke-test by signing into `/sales/dashboard` on app.talkmate.com.au).
- [ ] `talkmate-mobile` pushed to GitHub at `irfanhanif89-art/talkmate-mobile`.
- [ ] EAS production build of mobile installs and runs on Jade's phone.

Any item failing → fix inline, re-run that section.

---

## 8. Risks and rollback

### Risk: Bearer token verification opens a new attack surface

If `requireSalesRep()` is mis-implemented and accepts an unverified Bearer JWT, anyone with any Supabase JWT (e.g. a regular client) could call sales endpoints.

**Mitigation:** the Bearer path MUST call `supabase.auth.getUser(jwt)` against the service-role client, which verifies the JWT signature against Supabase's signing keys. Only then is the user looked up in `sales_reps`. The `sales_reps.status = 'active'` gate is the same as the web flow.

**Verification:** part of the Stage 4 security audit. Try calling `/api/sales/me` with (a) no header (expect 401), (b) a junk Bearer string (expect 401), (c) a valid Supabase JWT for a non-rep user (expect 403), (d) an expired JWT (expect 401), (e) a valid JWT for an active rep (expect 200).

### Risk: Migration 058 collides with parallel work

The portal has rapid session turnover; migration 058 could be in flight from another session by the time we apply it.

**Mitigation:** before applying, run `ls supabase/migrations/ | tail -3` to confirm 058 is still free. If a parallel session has claimed 058, renumber to the next free number and update the SYSTEM_MAP entry.

### Risk: Mobile-only stage values break the portal

If we accidentally send `qualified` as a status from the mobile (from a stale code path), the portal's PATCH rejects with 400.

**Mitigation:** mobile must use the portal's enum exactly. Add a TypeScript const in `src/data/types.ts` (mobile) named `LEAD_STATUSES` listing the seven valid values; reference it everywhere stage is set. Lint rule (optional): grep CI step that fails the build if `'qualified'` appears in `src/screens/sales/` or `src/data/`.

### Risk: Apple TestFlight review delays Stage 3

Apple can take 24-48h to review the first TestFlight build.

**Mitigation:** submit to TestFlight as early in Stage 3 as possible. While waiting, use `eas build --profile preview` to give Jade an internal-distribution iOS build (still requires signing into her Apple ID to install). Android internal track is fast (~30min).

### Risk: Rep account doesn't exist in production

Jade's auth user must exist in prod Supabase with a `sales_reps` row attached.

**Mitigation:** Stage 4 audit includes verifying Jade can sign in. If she can't, work backwards from the auth/sales_reps tables and either resend her portal invite (existing flow) or create the account manually. This is verification-only — not a build task.

### Rollback

- **Migration 058:** `ALTER TABLE leads DROP COLUMN IF EXISTS next_followup_at;` + drop the index. Safe and instant.
- **5 new endpoints + PATCH extension:** revert the portal PR; Vercel auto-redeploys; old web behavior unchanged.
- **Mobile app:** TestFlight has rollback to previous build; users with the older version unaffected.
- **The riskiest fail mode** is a bug in `requireSalesRep()` that accidentally weakens the web portal's auth. The audit's "smoke-test /sales/dashboard on app.talkmate.com.au still works" gate catches this before merge to main.

---

## 9. Prerequisites and timeline

### Prerequisites (Irfan does)
1. Sign up for Apple Developer Program — $99 USD/yr.
2. Sign up for Google Play Console — $25 USD one-time.
3. Sign up for Expo account (free).
4. Confirm Jade has an active `sales_reps` row in prod (per memory `session-43-shipped` she has rep account; verify).

These can happen anytime during Stages 1-2.

### Timeline estimate
- **Stage 1 (portal):** ~3 working days. Smaller than typical portal sessions because all endpoints are additive reads.
- **Stage 2 (mobile):** ~5 working days. Larger because the AuthContext rewrite + fetch layer + optimistic UI patterns are net new for the mobile codebase.
- **Stage 3 (distribution):** ~2 working days of active work + ~1-2 days of Apple TestFlight review waiting.
- **Stage 4 (audit):** ~1 working day on real hardware.

**Total active work: ~11 working days. Calendar time including Apple review: ~2.5 weeks.**

---

## 10. Acceptance criteria

Build is done when:

1. All five new portal GET endpoints are merged to `main`, deployed, and return 200 for an active rep against prod Supabase.
2. Migration 050 is applied to prod Supabase.
3. PATCH `/api/sales/leads/[id]` accepts `next_followup_at`.
4. `talkmate-mobile` repo lives at `github.com/irfanhanif89-art/talkmate-mobile` with the live-API integration on `main`.
5. An EAS production build of the mobile app is installed via TestFlight on Jade's iPhone, and she can sign in with her real prod credentials.
6. Every item in the Stage 4 audit checklist passes.
7. SYSTEM_MAP.md updated with this work (migration 050, 5 new endpoints, Bearer auth path, mobile repo link).
8. MEMORY.md updated with a new memory file capturing the Phase 2 sub-project 1 outcome.

---

## 11. What this spec deliberately leaves open

- **Industry picker on Add Lead modal:** Phase 1 mock used free text for industry. This spec keeps free text. A dropdown using the existing `BUSINESS_TYPE_CONFIG` is a small follow-on improvement, not blocking.
- **App icon + splash screen polish:** the existing `assets/icon.png` is reused as-is. If you want a custom splash for the rep app, that's a small design task that can happen any time without blocking the build.
- **Privacy policy URL:** the spec assumes `app.talkmate.com.au/privacy` exists. If not, this needs creating before App Store submission. Trivial work — copy any standard SaaS privacy policy template.
- **Apple TestFlight reviewer notes:** standard text saying "Internal tool for TalkMate sales contractors. Test login: contact developer." Written at submission time, not before.
