# Session 78 — Integrations Day 1 — DEPLOYMENT

Branch: `feature/session-78-integrations` · built on top of the side-effects fix (PR #174, migration 084).
Migration: **085** (`085_integrations_day1.sql`). Applied to PREVIEW. PROD pending auth.

---

## PHASE 0 REVIEW (done before build)

1. **Live webhook is dead — fires must use the pull cron.** The brief wires call
   fires into `/api/webhooks/vapi`, which 401s on every live call (Vapi-side).
   Resolution: integration fires live in the shared `runCallSideEffects()`
   (PR #174) which runs from the pull cron `/api/cron/vapi-call-sync` (the live
   path) + the webhook, claimed exactly-once via `calls.side_effects_at`.
2. **No `google_access_token` column exists** (migration 080 stored only an
   encrypted `google_refresh_token`, and only on PREVIEW — PROD 080 is held).
   Resolution: new `getGoogleAccessToken()` mints a short-lived token from the
   refresh token; GBP gates on `google_refresh_token`. Brief's GBP v4 endpoints
   are deprecated → used `mybusinessaccountmanagement`/`mybusinessbusinessinformation` v1.
   GBP is triple-blocked on prod (080 held + no Google app + `business.manage`
   needs Google allowlist) → built env-gated, inert until those land.
3. **`intelligence_score` is null at fire time** (scored async after ingestion in
   both paths). Zapier/HubSpot payloads carry null score. Documented, accepted v1.
4. **Settings already had an Integrations tab** (WhatsApp/Telegram) + ServiceM8 in
   Automation. Merged: `IntegrationsView` added at top of the tab, WhatsApp/Telegram
   kept below under a Notifications header, ServiceM8 moved into Integrations.
5. **MYOB cloud company files** may need `x-myobapi-cftoken` beyond the bearer →
   create may 401 until added. Fine while env-gated (no creds yet).

---

## What shipped

- **Migration 085** — additive `businesses` cols: zapier_*, hubspot_*, google_business_*, myob_*.
- **Libs** — `src/lib/integrations/{types,zapier,hubspot,myob,google-business}.ts`;
  `crypto.ts` `encryptWith`/`decryptWith` (INTEGRATION_ENCRYPTION_KEY); `google-oauth.ts` `business.manage` scope.
- **Fires** — Zapier (every call) / HubSpot (dur>=30 & !abandoned) / MYOB (+caller) added to `runCallSideEffects` (pull-cron path, exactly-once, skips demo/non-active).
- **16 API routes** — zapier save/test/status; hubspot connect/callback/status/disconnect; myob connect/callback/status/disconnect; google-business locations/select/pull/disconnect/status. HubSpot/MYOB return `not_configured` when env unset.
- **UI** — `IntegrationCard` + `IntegrationsView` (ServiceM8 / HubSpot / MYOB / Xero[coming-soon] / Zapier / GBP), wired into Settings > Integrations; OAuth-return tab + toast handling.
- **Admin parity** — Integrations dot-chips column on `/admin/clients`; detail covered by the admin-as-client impersonation view.

## Validation
- `tsc --noEmit` 0 errors. `npm run build` passes.
- Migration 085 applied to PREVIEW (15 cols verified). 084 (side-effects) already PROD+PREVIEW.

## ENV (Irfan)
- `INTEGRATION_ENCRYPTION_KEY` — `openssl rand -base64 32` → Vercel prod + preview (needed before any HubSpot/MYOB token is stored).
- `HUBSPOT_CLIENT_ID` / `HUBSPOT_CLIENT_SECRET` — after creating the HubSpot app (redirect `https://app.talkmate.com.au/api/integrations/hubspot/callback`).
- `MYOB_CLIENT_ID` / `MYOB_CLIENT_SECRET` — after creating the MYOB app (redirect `.../api/integrations/myob/callback`).
- GBP: Google Cloud OAuth app must add `business.manage` + Google must allowlist the GBP APIs.

## Deploy (pending Irfan auth)
1. Generate + set `INTEGRATION_ENCRYPTION_KEY` (prod + preview).
2. Apply migration 085 to PROD.
3. Merge to main → Vercel deploys. HubSpot/MYOB/GBP stay "coming soon" until their apps/env exist; Zapier is fully live immediately.

## PHASE 3 — BROWSER AUDIT
(pending — run against the Vercel preview deploy: Settings > Integrations renders, cards show correct states, Zapier save/test, coming-soon badges for unset OAuth, 375px, console clean.)
