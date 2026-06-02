# Automated Branded PDF Proposals + Acceptance Flow — Design Spec

**Date:** 2026-06-02
**Status:** Draft for review
**Author:** Claude (with Irfan)
**Related:** Original audit of the Send Proposal flow (commission-attribution gap); design briefs in
`_docs/briefs/talkmate-proposal-design-towing.md` and the decoded design sources in
`_docs/briefs/towing-proposal-design/` and `_docs/briefs/confirmation-screen-design/`.

---

## 1. Goal

Replace the current lightweight HTML-only proposal email with an automated, branded, per-lead
**PDF proposal** generated server-side and emailed as an attachment, plus a self-serve
**acceptance flow** that lands the prospect on a personalised confirmation page and notifies the team.

No AI / no per-send API cost: the design was created once in Claude Design; every send is
deterministic template-fill + PDF render on existing Vercel infrastructure, delivered via Resend.

## 2. What already exists (reuse, do not rebuild)

- **Proposal design** — 6-page A4 print-ready HTML/CSS at `_docs/briefs/towing-proposal-design/_template.html`.
  Already templated with `data-tm` attributes: `business, contact, rep, phone, email, date,
  missed_calls, avg_job, revenue, hours_week, hours_year, break_even`. Includes a featured plan
  card style (`.pf` + "Most Popular" badge) currently hardcoded to Growth.
- **Confirmation screen** — responsive web page at `_docs/briefs/confirmation-screen-design/_template.html`.
  `data-tm`: `contact, business, selected_plan, selected_plan_price, setup_fee, rep, phone, email`.
- **Send path** — `src/lib/proposal-send.ts`, `src/app/api/sales/send-proposal/route.ts`,
  `src/app/api/sales/proposals/quick-send/route.ts`, `ProposalForm.tsx`, `QuickProposalForm.tsx`.
- **Email helper** — `src/lib/resend.ts` (`sendEmail`); supports html only today.
- **Pricing source of truth** — `src/lib/pricing.ts` (monthly/annual/setup fees).
- **Tracking** — `proposal_tracking` table + `/api/webhooks/resend` open/click tracking.

## 3. Decisions locked in

| Decision | Value |
|---|---|
| Medium | PDF attachment (rendered server-side from the design template) |
| Primary CTA in PDF | View plans, then decide (no checkout button in the PDF) |
| Sending identity | From: `hello@talkmate.com.au`, Reply-To: `hello@talkmate.com.au` (single inbox) |
| Recommended plan | Rep-selectable in the form; drives the featured `.pf` card on the PDF |
| ROI figures | Rep can enter; fall back to towing defaults |
| Confirmation trigger | "Ready to go ahead" link in the proposal email |
| On accept | Notify hello@ + rep, record acceptance, advance lead status |
| Plan feature copy | Proposal-only packaging (intentionally differs from live website for now) |

## 4. Architecture

### 4.1 Templates
Move both decoded HTML files into the app as server-side templates (e.g.
`src/lib/proposal/templates/towing-proposal.html` and `confirmation.html`). Strip the
client-side `data-tm` URL-param fill script; instead inject values server-side before render.

- Self-host the two Outfit `woff2` files (in `public/fonts/` or inline as base64 in the template)
  so PDF rendering does not depend on Google Fonts network fetch.
- Keep the `data-tm` attributes as the injection contract. A small helper
  `fillTemplate(html, values)` replaces the inner text of each `data-tm` node (server-side via a
  tiny HTML transform or token replacement on pre-marked spans).
- Featured plan: helper applies `.pf` class + "Most Popular" badge to the rep-selected plan card,
  removing it from the default Growth card.
- Industry: start with towing; structure templates so the problem framing + value bullets + ROI
  copy are swappable per industry (one template per industry, or one template with industry slots).

### 4.2 PDF rendering (KEY TECHNICAL DECISION)
The design is print-CSS heavy (mm units, `@page`, flexbox page layout) and must be pixel-accurate,
which requires a real browser engine.

- **Recommended:** `puppeteer-core` + `@sparticuz/chromium` in a Node serverless function
  (`runtime = 'nodejs'`, raised `maxDuration` and memory). Renders the filled HTML to A4 PDF bytes.
- **Risk:** Chromium bundle size vs Vercel function limits / cold-start latency. Build must verify
  it fits and performs; if not, fall back options: (a) a tiny separate render service, or
  (b) `@react-pdf/renderer` (means re-expressing the design in its component model — higher effort).
- No third-party paid PDF API (avoids per-send cost).

### 4.3 Email with attachment
Extend `sendEmail` in `src/lib/resend.ts` to accept an optional
`attachments: { filename: string; content: string /* base64 */ }[]` and pass through to the Resend
API `attachments` field. Proposal send sets `from`/`replyTo` to `hello@talkmate.com.au` (new env
`PROPOSAL_EMAIL_FROM` defaulting to it). Email body = short branded cover note + the
"Ready to go ahead?" button; PDF attached as `TalkMate Proposal - <Business>.pdf`.

### 4.4 Acceptance flow
- Each proposal send generates a unique, unguessable **token** (e.g. random 32+ char) stored on
  the proposal record, mapping token -> lead + rep + selected plan.
- The email button links to `https://app.talkmate.com.au/p/accept/<token>` (public route, no auth).
- Route loads the proposal by token, renders the **confirmation page** (server-side filled with
  contact/business/plan/price/setup/rep), and on first acceptance:
  - inserts a `lead_activities` row ("Proposal accepted by client"),
  - sets `proposal_tracking.accepted_at`,
  - advances `leads.status` to an accepted state (see 5),
  - sends a notification to `hello@talkmate.com.au` and the rep (reuse `sendEmail`/`sendAdminTelegram`).
- Idempotent: re-visiting the link shows the confirmation page but does not re-fire notifications.

## 5. Database changes (migration)

Add to `proposal_tracking` (or a dedicated `proposals` table if cleaner):
- `accept_token text unique`
- `accepted_at timestamptz null`
- `template_type text` (already passed), `selected_plan`, `billing_cycle`
- optional ROI snapshot columns or a `roi jsonb` for audit.

Lead status: introduce `proposal_accepted` between `proposal_sent` and `won`. **Check first**
whether a CHECK constraint governs `leads.status`; if so, alter it (mirror migration 051's pattern).
If no constraint, just start writing the new value. Keep terminal-status guard logic in
`proposal-send.ts` consistent.

## 6. Send Proposal form changes (`ProposalForm.tsx` + `QuickProposalForm.tsx`)
- **Recommended plan selector** already exists (plan radio) — reuse it as the featured plan.
- Add **ROI inputs** (3 fields: missed callouts/week, avg job value, hours/week) with towing
  defaults pre-filled; compute `revenue`, `hours_year`, `break_even` server-side from these.
- Keep industry; default ROI defaults per industry.
- Submit posts the same shape plus `roi_*` fields.

## 7. Data flow at send time
1. Rep opens lead -> picks plan (= recommended), template, optional note, ROI figures.
2. POST `/api/sales/send-proposal` (and quick-send) -> validate -> gather rep (from auth) + lead.
3. `sendProposalForLead`: build values map -> `fillTemplate(towingProposalHtml, values)` ->
   render PDF -> generate accept token -> `sendEmail({from/replyTo hello@, html: coverNote+acceptLink,
   attachments:[pdf]})` -> insert `proposal_tracking` (token, plan, etc.) -> advance status ->
   `lead_activities`.
4. Return ok to UI -> existing "Proposal sent" success card.

## 8. Files (new / changed)
- NEW `src/lib/proposal/templates/towing-proposal.html`, `confirmation.html`
- NEW `src/lib/proposal/fill-template.ts` (data-tm injection + featured-plan + ROI compute)
- NEW `src/lib/proposal/render-pdf.ts` (puppeteer-core + chromium)
- NEW `src/app/p/accept/[token]/route.ts` (or page) — public confirmation + accept recording
- NEW `public/fonts/outfit-*.woff2`
- CHG `src/lib/resend.ts` (attachments, from/replyTo)
- CHG `src/lib/proposal-send.ts` (PDF + token + cover-note email + status)
- CHG `src/app/api/sales/send-proposal/route.ts`, `.../proposals/quick-send/route.ts` (ROI + plan)
- CHG `src/components/sales/ProposalForm.tsx`, `QuickProposalForm.tsx` (ROI inputs)
- NEW migration `0xx_proposal_accept.sql`
- CHG `.env` / Vercel: `PROPOSAL_EMAIL_FROM=hello@talkmate.com.au`

## 9. Error handling
- PDF render failure -> return error to rep, do not record send (or record as failed). Do not send
  an email without the attachment silently.
- Email failure -> surface to rep (existing pattern), keep tracking row marked unsent.
- Token route: unknown/expired token -> friendly "this link is no longer valid, contact your rep".

## 10. Out of scope (follow-ons)
- Other industries (reuse template structure; swap problem/bullets/ROI).
- Syncing live website pricing to the proposal packaging.
- Full commission-attribution checkout (this spec adds an accept signal, not payment).
- BCC hello@ for a Gmail "Sent" copy (optional toggle).

## 11. Testing plan (per CLAUDE.md pipeline)
- Builder: `npm run build` + `npx tsc --noEmit` clean.
- Validator: no hardcoded rep/lead data; correct column names; from/replyTo = hello@.
- QA (Playwright): send a real proposal to the QA mailbox (testingtalkmate@gmail.com); verify the
  PDF attaches, opens, is 6 pages, correct names/plan/ROI; click the accept link; verify the
  confirmation page renders and a notification fires; check mobile viewport for the confirmation page.
- Reviewer: downstream risk to Resend, Supabase, lead status constraints; GREEN/YELLOW/RED.
