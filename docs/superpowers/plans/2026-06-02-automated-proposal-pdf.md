# Automated Branded PDF Proposals + Acceptance Flow — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generate a branded per-lead PDF proposal server-side, email it from hello@talkmate.com.au as an attachment, and give the prospect a tokenised "Ready to go ahead" link that opens a personalised confirmation page, records acceptance, and notifies the team.

**Architecture:** Two Claude-Design HTML files become server-side templates filled via their `data-tm` hooks. A headless-Chromium renderer turns the filled proposal HTML into A4 PDF bytes; Resend sends it as an attachment. A public tokenised route renders the confirmation page and records acceptance.

**Tech Stack:** Next.js (App Router) + TypeScript, Supabase (admin client), Resend, `puppeteer-core` + `@sparticuz/chromium` for PDF, `tsx` for lightweight pure-function tests.

**Repo facts:** No jest/vitest. Verify via `npm run build`, `npx tsc --noEmit`, `npm run lint`, `npx tsx <file>` for pure logic, and Playwright QA (CLAUDE.md pipeline). `pdf-lib` + `resend` already installed. Design sources: `_docs/briefs/towing-proposal-design/_template.html`, `_docs/briefs/confirmation-screen-design/_template.html` (+ their woff2 fonts). Branch off `dev`: `feature/automated-proposal-pdf`.

---

## File Structure

- `src/lib/proposal/fill-template.ts` — inject `data-tm` values + featured-plan styling into template HTML (pure).
- `src/lib/proposal/roi.ts` — compute ROI figures from rep inputs + towing defaults (pure).
- `src/lib/proposal/token.ts` — generate/format the accept token (pure).
- `src/lib/proposal/render-pdf.ts` — HTML → A4 PDF bytes via puppeteer-core + chromium.
- `src/lib/proposal/templates/towing-proposal.html` — proposal template (from decoded design, script stripped).
- `src/lib/proposal/templates/confirmation.html` — confirmation template (from decoded design, script stripped).
- `public/fonts/outfit-latin.woff2`, `outfit-latin-ext.woff2` — self-hosted fonts.
- `src/app/p/accept/[token]/route.ts` — public confirmation + acceptance recorder.
- `src/lib/resend.ts` — extend `sendEmail` with attachments (MODIFY).
- `src/lib/proposal-send.ts` — orchestrate PDF + token + cover email + status (MODIFY).
- `src/app/api/sales/send-proposal/route.ts`, `.../proposals/quick-send/route.ts` — accept ROI fields (MODIFY).
- `src/components/sales/ProposalForm.tsx`, `QuickProposalForm.tsx` — ROI inputs (MODIFY).
- `supabase/migrations/0xx_proposal_accept.sql` — token/accept columns.

---

## Task 1: Add dependencies and a PDF render spike

**Files:**
- Modify: `package.json`
- Create: `src/lib/proposal/render-pdf.ts`
- Create: `scripts/spike-render.ts` (temporary, deleted in Step 6)

- [ ] **Step 1: Install deps**

Run:
```bash
npm install puppeteer-core @sparticuz/chromium
npm install -D tsx
```

- [ ] **Step 2: Write the renderer**

Create `src/lib/proposal/render-pdf.ts`:
```ts
// HTML -> A4 PDF bytes. Uses @sparticuz/chromium on serverless (Vercel) and a
// local Chrome when running on a dev machine. Keep this the ONLY place that
// knows about the browser engine so it can be swapped if Vercel limits bite.
import chromium from '@sparticuz/chromium'
import puppeteer from 'puppeteer-core'

export async function renderHtmlToPdf(html: string): Promise<Uint8Array> {
  const isServerless = !!process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.VERCEL === '1'
  const browser = await puppeteer.launch(
    isServerless
      ? {
          args: chromium.args,
          executablePath: await chromium.executablePath(),
          headless: true,
        }
      : {
          channel: 'chrome',
          headless: true,
        },
  )
  try {
    const page = await browser.newPage()
    await page.setContent(html, { waitUntil: 'networkidle0' })
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: '0', right: '0', bottom: '0', left: '0' },
    })
    return pdf
  } finally {
    await browser.close()
  }
}
```

- [ ] **Step 3: Write the spike test**

Create `scripts/spike-render.ts`:
```ts
import { writeFileSync } from 'node:fs'
import { renderHtmlToPdf } from '../src/lib/proposal/render-pdf'

const html = `<!doctype html><html><head><style>@page{size:A4;margin:0}
body{margin:0}.p{width:210mm;height:297mm;background:#061322;color:#fff;
display:flex;align-items:center;justify-content:center;font:48px sans-serif}</style></head>
<body><div class="p">TalkMate A4 OK</div></body></html>`

renderHtmlToPdf(html).then(pdf => {
  writeFileSync('scripts/spike.pdf', pdf)
  console.log('PDF bytes:', pdf.length)
})
```

- [ ] **Step 4: Run the spike (expect it to fail first if Chrome missing, then pass)**

Run: `npx tsx scripts/spike-render.ts`
Expected: prints `PDF bytes: <n>` and writes `scripts/spike.pdf`. Open it: one navy A4 page reading "TalkMate A4 OK". If local Chrome is absent, install Chrome or set `channel` accordingly.

- [ ] **Step 5: Verify build + types**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Remove the spike, commit**

```bash
rm scripts/spike-render.ts scripts/spike.pdf
git add package.json package-lock.json src/lib/proposal/render-pdf.ts
git commit -m "feat(proposal): add headless-chromium PDF renderer"
```

> QA note: Vercel-fit for `@sparticuz/chromium` is verified during the QA stage on a preview deploy (render a real proposal). If the function exceeds limits, fall back to a small render service or `@react-pdf/renderer` (re-express design) — flag to Irfan before proceeding.

---

## Task 2: Move design templates into the app and self-host fonts

**Files:**
- Create: `src/lib/proposal/templates/towing-proposal.html`
- Create: `src/lib/proposal/templates/confirmation.html`
- Create: `public/fonts/outfit-latin.woff2`, `public/fonts/outfit-latin-ext.woff2`

- [ ] **Step 1: Copy fonts**

```bash
mkdir -p public/fonts
cp "../_docs/briefs/towing-proposal-design/794374b4-b866-42c0-976d-885dd9591be6.woff2" public/fonts/outfit-latin.woff2
cp "../_docs/briefs/towing-proposal-design/35839f9d-059c-439a-a792-85ffcbc92237.woff2" public/fonts/outfit-latin-ext.woff2
```

- [ ] **Step 2: Copy + clean the proposal template**

Copy `_docs/briefs/towing-proposal-design/_template.html` to `src/lib/proposal/templates/towing-proposal.html`, then:
- Replace each `@font-face` `src: url("<uuid>")` with `src: url("/fonts/outfit-latin.woff2")` (latin) and `/fonts/outfit-latin-ext.woff2` (latin-ext) respectively.
- DELETE the trailing `<script>...data-tm fill...</script>` block (server fills instead).
- Keep the `.no-print` print bar (harmless in PDF; hidden by print CSS).

- [ ] **Step 3: Copy + clean the confirmation template**

Copy `_docs/briefs/confirmation-screen-design/_template.html` to `src/lib/proposal/templates/confirmation.html`, fix the two `@font-face` URLs the same way, and DELETE the trailing fill `<script>`.

- [ ] **Step 4: Ensure templates are bundled**

These are imported as raw strings at runtime via `fs.readFileSync(path.join(process.cwd(), 'src/lib/proposal/templates/...'))`. Confirm files exist:

Run: `node -e "['towing-proposal','confirmation'].forEach(f=>console.log(f, require('fs').existsSync('src/lib/proposal/templates/'+f+'.html')))"`
Expected: both `true`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/proposal/templates public/fonts
git commit -m "feat(proposal): vendor design templates + self-hosted Outfit fonts"
```

---

## Task 3: ROI compute helper (pure, TDD)

**Files:**
- Create: `src/lib/proposal/roi.ts`
- Create: `src/lib/proposal/roi.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/proposal/roi.test.ts`:
```ts
import assert from 'node:assert'
import { computeRoi, ROI_DEFAULTS } from './roi'

const r = computeRoi({ missedCallsPerWeek: 10, avgJobValue: 240, hoursPerWeek: 9 })
assert.equal(r.missed_calls, '10')
assert.equal(r.avg_job, '$240')
assert.equal(r.revenue, '$124,800')        // 10*240*52
assert.equal(r.hours_week, '9')
assert.equal(r.hours_year, '468')          // 9*52
assert.equal(r.break_even, '21')           // ceil(4990 / 240) annual Growth / avg job

const d = computeRoi(ROI_DEFAULTS)
assert.equal(d.revenue, '$124,800')
console.log('roi ok')
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx tsx src/lib/proposal/roi.test.ts`
Expected: FAIL (module not found / computeRoi undefined).

- [ ] **Step 3: Implement**

Create `src/lib/proposal/roi.ts`:
```ts
// Pure ROI maths for the proposal. Produces display-ready strings keyed to the
// proposal template's data-tm fields. break_even = how many recovered jobs at
// avgJobValue cover one year of the Growth plan (annual price 4990).
const GROWTH_ANNUAL = 4990

export interface RoiInput {
  missedCallsPerWeek: number
  avgJobValue: number
  hoursPerWeek: number
}

export const ROI_DEFAULTS: RoiInput = {
  missedCallsPerWeek: 10,
  avgJobValue: 240,
  hoursPerWeek: 9,
}

function aud(n: number): string {
  return '$' + Math.round(n).toLocaleString('en-AU')
}

export function computeRoi(input: RoiInput): {
  missed_calls: string; avg_job: string; revenue: string
  hours_week: string; hours_year: string; break_even: string
} {
  const revenue = input.missedCallsPerWeek * input.avgJobValue * 52
  const hoursYear = input.hoursPerWeek * 52
  const breakEven = input.avgJobValue > 0 ? Math.ceil(GROWTH_ANNUAL / input.avgJobValue) : 0
  return {
    missed_calls: String(input.missedCallsPerWeek),
    avg_job: aud(input.avgJobValue),
    revenue: aud(revenue),
    hours_week: String(input.hoursPerWeek),
    hours_year: String(hoursYear),
    break_even: String(breakEven),
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx tsx src/lib/proposal/roi.test.ts`
Expected: prints `roi ok`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/proposal/roi.ts src/lib/proposal/roi.test.ts
git commit -m "feat(proposal): ROI compute helper with tests"
```

---

## Task 4: Accept-token helper (pure, TDD)

**Files:**
- Create: `src/lib/proposal/token.ts`
- Create: `src/lib/proposal/token.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/proposal/token.test.ts`:
```ts
import assert from 'node:assert'
import { generateAcceptToken } from './token'

const a = generateAcceptToken()
const b = generateAcceptToken()
assert.match(a, /^[A-Za-z0-9_-]{32,}$/)
assert.notEqual(a, b)
console.log('token ok')
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx tsx src/lib/proposal/token.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

Create `src/lib/proposal/token.ts`:
```ts
import { randomBytes } from 'node:crypto'

// URL-safe, unguessable token for the public accept link.
export function generateAcceptToken(): string {
  return randomBytes(24).toString('base64url')
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx tsx src/lib/proposal/token.test.ts`
Expected: prints `token ok`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/proposal/token.ts src/lib/proposal/token.test.ts
git commit -m "feat(proposal): accept-token helper with tests"
```

---

## Task 5: fill-template helper (pure, TDD)

**Files:**
- Create: `src/lib/proposal/fill-template.ts`
- Create: `src/lib/proposal/fill-template.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/proposal/fill-template.test.ts`:
```ts
import assert from 'node:assert'
import { fillTemplate, featurePlan } from './fill-template'

const html = `<span data-tm="business">X</span><span data-tm="rep">Y</span>`
const out = fillTemplate(html, { business: 'Joe & Co <Towing>', rep: 'Sam' })
assert.ok(out.includes('Joe &amp; Co &lt;Towing&gt;'))   // escaped
assert.ok(out.includes('>Sam<'))

// featured plan: Growth card has class "plan-card pf", choosing pro moves it
const plans = `<div class="plan-card pf" data-plan="growth"><div class="plan-badge">Most Popular</div></div>
<div class="plan-card" data-plan="pro"></div>`
const pro = featurePlan(plans, 'pro')
assert.ok(/<div class="plan-card" data-plan="growth">/.test(pro))      // growth de-featured
assert.ok(/<div class="plan-card pf" data-plan="pro"><div class="plan-badge">Most Popular<\/div><\/div>/.test(pro))
console.log('fill ok')
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx tsx src/lib/proposal/fill-template.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

Create `src/lib/proposal/fill-template.ts`:
```ts
// Server-side template filling. Replaces the inner content of <span data-tm="key">…</span>
// nodes with escaped values, and moves the featured ".pf" plan styling to the chosen plan.
// Template plan cards MUST carry data-plan="starter|growth|pro" (added in Task 6).

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, ch =>
    ch === '&' ? '&amp;' : ch === '<' ? '&lt;' : ch === '>' ? '&gt;' : ch === '"' ? '&quot;' : '&#39;')
}

export function fillTemplate(html: string, values: Record<string, string | null | undefined>): string {
  return html.replace(
    /(<span[^>]*\bdata-tm="([^"]+)"[^>]*>)([\s\S]*?)(<\/span>)/g,
    (full, open: string, key: string, _inner: string, close: string) => {
      if (!(key in values) || values[key] == null) return full
      return open + escapeHtml(String(values[key])) + close
    },
  )
}

type Plan = 'starter' | 'growth' | 'pro'

// De-feature every plan card, then feature the chosen one (add `pf` class + badge).
export function featurePlan(html: string, plan: Plan): string {
  // 1. strip "pf" from any plan-card class and remove existing Most Popular badge
  let out = html.replace(/<div class="plan-card pf"([^>]*)>/g, '<div class="plan-card"$1>')
  out = out.replace(/<div class="plan-badge">Most Popular<\/div>\s*/g, '')
  // 2. add pf + badge to the chosen card (matched by data-plan)
  out = out.replace(
    new RegExp(`<div class="plan-card"([^>]*\\bdata-plan="${plan}"[^>]*)>`),
    `<div class="plan-card pf"$1><div class="plan-badge">Most Popular</div>`,
  )
  return out
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx tsx src/lib/proposal/fill-template.test.ts`
Expected: prints `fill ok`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/proposal/fill-template.ts src/lib/proposal/fill-template.test.ts
git commit -m "feat(proposal): data-tm fill + featured-plan helper with tests"
```

---

## Task 6: Annotate plan cards with data-plan + remove hardcoded feature

**Files:**
- Modify: `src/lib/proposal/templates/towing-proposal.html`

- [ ] **Step 1: Add data-plan attributes**

In the plans grid, change the three plan card opening tags so each carries its plan key:
- Starter: `<div class="plan-card" data-plan="starter">`
- Growth (currently `plan-card pf`): keep `<div class="plan-card pf" data-plan="growth">` (default feature; `featurePlan()` will move it if the rep picks another).
- Pro: `<div class="plan-card" data-plan="pro">`

- [ ] **Step 2: Verify markers present**

Run: `node -e "const h=require('fs').readFileSync('src/lib/proposal/templates/towing-proposal.html','utf8'); console.log(['starter','growth','pro'].map(p=>h.includes('data-plan=\"'+p+'\"')))"`
Expected: `[ true, true, true ]`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/proposal/templates/towing-proposal.html
git commit -m "feat(proposal): tag plan cards with data-plan for rep-selectable feature"
```

---

## Task 7: Extend sendEmail with attachments + reply-to (already supports replyTo)

**Files:**
- Modify: `src/lib/resend.ts`

- [ ] **Step 1: Add attachments to the interface and request body**

In `src/lib/resend.ts`, extend `SendEmailOptions`:
```ts
export interface SendEmailOptions {
  to: string | string[]
  subject: string
  html: string
  from?: string
  replyTo?: string
  attachments?: { filename: string; content: string /* base64 */ }[]
}
```
And in the `fetch` body object, add after the `replyTo` spread:
```ts
        ...(opts.attachments && opts.attachments.length ? { attachments: opts.attachments } : {}),
```

- [ ] **Step 2: Verify types**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/resend.ts
git commit -m "feat(email): support attachments in sendEmail"
```

---

## Task 8: Migration — accept token + acceptance columns

**Files:**
- Create: `supabase/migrations/0xx_proposal_accept.sql` (use next migration number; latest is 064)

- [ ] **Step 1: Inspect current proposal_tracking + status constraint**

Run (via Supabase MCP `execute_sql` against prod or read migrations): confirm `proposal_tracking` columns and whether a CHECK constraint governs `leads.status`. If a status CHECK exists, the migration must add `'proposal_accepted'` to it.

- [ ] **Step 2: Write the migration**

Create `supabase/migrations/065_proposal_accept.sql`:
```sql
-- Session: automated PDF proposals + acceptance flow
alter table public.proposal_tracking
  add column if not exists accept_token text unique,
  add column if not exists accepted_at timestamptz,
  add column if not exists template_type text,
  add column if not exists selected_plan text;

create index if not exists proposal_tracking_accept_token_idx
  on public.proposal_tracking (accept_token);

-- If (and only if) a CHECK constraint restricts leads.status, recreate it to
-- include 'proposal_accepted'. Example (adjust constraint name to the real one):
-- alter table public.leads drop constraint if exists leads_status_check;
-- alter table public.leads add constraint leads_status_check
--   check (status in ('new','contacted','demo','proposal_sent','proposal_accepted','won','lost','bad_lead'));
```

- [ ] **Step 3: Apply to preview, then prod (per workflow)**

Apply via Supabase MCP `apply_migration` to preview first; verify with `list_tables`. Prod applied after code is live.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/065_proposal_accept.sql
git commit -m "feat(db): proposal accept token + acceptance columns (migration 065)"
```

---

## Task 9: Orchestrate PDF + token + cover email in proposal-send.ts

**Files:**
- Modify: `src/lib/proposal-send.ts`

- [ ] **Step 1: Extend args + imports**

At top, add imports:
```ts
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { renderHtmlToPdf } from '@/lib/proposal/render-pdf'
import { fillTemplate, featurePlan } from '@/lib/proposal/fill-template'
import { computeRoi, type RoiInput } from '@/lib/proposal/roi'
import { generateAcceptToken } from '@/lib/proposal/token'
import { PRICING } from '@/lib/pricing'
```
Extend `SendProposalArgs` with `roi: RoiInput` and (optional) `appUrl?: string`.

- [ ] **Step 2: Build the proposal HTML, render PDF, send with attachment**

Replace the email-build + send section of `sendProposalForLead` with:
```ts
  const token = generateAcceptToken()
  const appUrl = args.appUrl ?? process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.talkmate.com.au'
  const acceptUrl = `${appUrl}/p/accept/${token}`

  const roi = computeRoi(args.roi)
  const planMeta = PRICING[plan]
  const todayAu = new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })

  // Build the proposal PDF from the template
  let proposalHtml = readFileSync(
    join(process.cwd(), 'src/lib/proposal/templates/towing-proposal.html'), 'utf8',
  )
  proposalHtml = featurePlan(proposalHtml, plan)
  proposalHtml = fillTemplate(proposalHtml, {
    business: lead.business_name,
    contact: lead.contact_name,
    rep: rep.full_name,
    phone: rep.phone,
    email: rep.notification_email,
    date: todayAu,
    ...roi,
  })
  const pdfBytes = await renderHtmlToPdf(proposalHtml)
  const pdfBase64 = Buffer.from(pdfBytes).toString('base64')

  const fromAddr = process.env.PROPOSAL_EMAIL_FROM ?? 'hello@talkmate.com.au'
  const coverHtml = proposalCoverHtml({
    contactName: lead.contact_name,
    businessName: lead.business_name,
    acceptUrl,
    repFullName: rep.full_name,
  })

  const result = await sendEmail({
    from: `TalkMate <${fromAddr}>`,
    replyTo: fromAddr,
    to: lead.email,
    subject,
    html: coverHtml,
    attachments: [{ filename: `TalkMate Proposal - ${lead.business_name}.pdf`, content: pdfBase64 }],
  })
```

- [ ] **Step 3: Persist the token + plan on the tracking row**

In the `proposal_tracking` insert, add: `accept_token: token, template_type: templateType, selected_plan: plan,`.

- [ ] **Step 4: Add the cover-note builder**

Add at the bottom of the file:
```ts
function proposalCoverHtml(o: { contactName: string | null; businessName: string; acceptUrl: string; repFullName: string }) {
  return `
  <div style="font-family:'Outfit',Arial,sans-serif;max-width:600px;margin:0 auto;color:#061322;">
    <div style="background:#061322;padding:22px 28px;"><div style="font-size:22px;font-weight:800;color:#fff;">Talk<span style="color:#E8622A;">Mate</span></div></div>
    <div style="height:3px;background:#E8622A;"></div>
    <div style="padding:28px;">
      <p style="font-size:15px;line-height:1.6;margin:0 0 14px;">Hi ${o.contactName ?? 'there'},</p>
      <p style="font-size:15px;line-height:1.6;margin:0 0 14px;">Your TalkMate proposal for <strong>${o.businessName}</strong> is attached as a PDF. It covers how TalkMate answers every call, what it is worth to your business, and the plan options.</p>
      <p style="font-size:15px;line-height:1.6;margin:0 0 22px;">When you are ready, just tap the button below.</p>
      <p style="margin:0 0 24px;"><a href="${o.acceptUrl}" style="display:inline-block;padding:14px 26px;background:#E8622A;color:#fff;text-decoration:none;border-radius:10px;font-weight:700;font-size:15px;">Ready to go ahead</a></p>
      <p style="font-size:14px;color:#34495e;margin:0;">${o.repFullName}<br/>TalkMate</p>
    </div>
    <div style="padding:16px 28px;background:#f9fafb;border-top:1px solid #eef0f3;font-size:11px;color:#7BAED4;">TalkMate. AI Receptionist for Australian Small Business. talkmate.com.au</div>
  </div>`
}
```
Remove the now-unused `fullProposalHtml`/`postDemoHtml` builders only if no longer referenced (keep `subject` logic).

- [ ] **Step 5: Verify types + build**

Run: `npx tsc --noEmit && npm run build`
Expected: success.

- [ ] **Step 6: Commit**

```bash
git add src/lib/proposal-send.ts
git commit -m "feat(proposal): render PDF, attach to hello@ email, add accept token"
```

---

## Task 10: Pass ROI + plan through the API routes

**Files:**
- Modify: `src/app/api/sales/send-proposal/route.ts`
- Modify: `src/app/api/sales/proposals/quick-send/route.ts`

- [ ] **Step 1: Parse ROI from the body and pass to sendProposalForLead**

In both routes, read ROI fields from the JSON body with defaults and pass `roi`:
```ts
import { ROI_DEFAULTS } from '@/lib/proposal/roi'
// ...
const roi = {
  missedCallsPerWeek: Number(body.missed_calls_per_week) || ROI_DEFAULTS.missedCallsPerWeek,
  avgJobValue: Number(body.avg_job_value) || ROI_DEFAULTS.avgJobValue,
  hoursPerWeek: Number(body.hours_per_week) || ROI_DEFAULTS.hoursPerWeek,
}
```
Add `roi` to the `sendProposalForLead({...})` call in each route. Extend each route's body type with the three optional numeric `*_per_week` / `avg_job_value` fields.

- [ ] **Step 2: Verify types + build**

Run: `npx tsc --noEmit && npm run build`
Expected: success.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/sales/send-proposal/route.ts src/app/api/sales/proposals/quick-send/route.ts
git commit -m "feat(proposal): accept ROI inputs in send routes"
```

---

## Task 11: ROI inputs in the Send Proposal forms

**Files:**
- Modify: `src/components/sales/ProposalForm.tsx`
- Modify: `src/components/sales/QuickProposalForm.tsx`

- [ ] **Step 1: Add ROI state + fields (ProposalForm)**

Add three numeric inputs (defaults 10 / 240 / 9) under the note field, and include them in the POST body as `missed_calls_per_week`, `avg_job_value`, `hours_per_week`. Reuse the existing `Field` + `inputStyle`:
```tsx
const [missedCalls, setMissedCalls] = useState(10)
const [avgJob, setAvgJob] = useState(240)
const [hoursWeek, setHoursWeek] = useState(9)
// ...in <Field label="ROI estimates" help="Shown on page 4. Adjust to the client's real numbers.">
//   three <input type="number"> bound to the above
// ...in the fetch body:
missed_calls_per_week: missedCalls, avg_job_value: avgJob, hours_per_week: hoursWeek,
```

- [ ] **Step 2: Mirror in QuickProposalForm**

Apply the same three inputs + body fields to `QuickProposalForm.tsx`.

- [ ] **Step 3: Verify build + lint**

Run: `npm run build && npm run lint`
Expected: success.

- [ ] **Step 4: Commit**

```bash
git add src/components/sales/ProposalForm.tsx src/components/sales/QuickProposalForm.tsx
git commit -m "feat(proposal): rep ROI inputs in send forms"
```

---

## Task 12: Public accept route — confirmation page + record + notify

**Files:**
- Create: `src/app/p/accept/[token]/route.ts`

- [ ] **Step 1: Implement the route**

Create `src/app/p/accept/[token]/route.ts`:
```ts
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createAdminClient } from '@/lib/supabase/server'
import { sendEmail } from '@/lib/resend'
import { fillTemplate } from '@/lib/proposal/fill-template'
import { PRICING, isPricingPlan } from '@/lib/pricing'

export const dynamic = 'force-dynamic'

function page(html: string, status = 200) {
  return new Response(html, { status, headers: { 'Content-Type': 'text/html; charset=utf-8' } })
}

export async function GET(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params
  const admin = createAdminClient()

  const { data: tracking } = await admin
    .from('proposal_tracking')
    .select('id, lead_id, rep_id, selected_plan, accepted_at')
    .eq('accept_token', token)
    .maybeSingle()

  if (!tracking) {
    return page('<p style="font-family:sans-serif;padding:40px;text-align:center">This link is no longer valid. Please contact your TalkMate rep.</p>', 404)
  }

  const { data: lead } = await admin
    .from('leads').select('business_name, contact_name').eq('id', tracking.lead_id).maybeSingle()
  const { data: rep } = await admin
    .from('sales_reps').select('full_name, phone, notification_email, email').eq('id', tracking.rep_id).maybeSingle()

  const plan = isPricingPlan(tracking.selected_plan) ? tracking.selected_plan : 'growth'
  const meta = PRICING[plan]

  // Record acceptance once (idempotent)
  if (!tracking.accepted_at) {
    const nowIso = new Date().toISOString()
    await admin.from('proposal_tracking').update({ accepted_at: nowIso }).eq('id', tracking.id)
    await admin.from('leads').update({ status: 'proposal_accepted', updated_at: nowIso }).eq('id', tracking.lead_id)
    await admin.from('lead_activities').insert({
      lead_id: tracking.lead_id, rep_id: tracking.rep_id,
      activity_type: 'proposal', title: 'Proposal accepted by client',
    })
    const repEmail = rep?.notification_email ?? rep?.email ?? null
    await sendEmail({
      from: 'TalkMate <hello@talkmate.com.au>', replyTo: 'hello@talkmate.com.au',
      to: repEmail ? ['hello@talkmate.com.au', repEmail] : 'hello@talkmate.com.au',
      subject: `Proposal accepted: ${lead?.business_name ?? 'Client'}`,
      html: `<p style="font-family:sans-serif">${lead?.business_name ?? 'A client'} (${lead?.contact_name ?? ''}) accepted the ${plan} proposal.</p>`,
    })
  }

  let html = readFileSync(join(process.cwd(), 'src/lib/proposal/templates/confirmation.html'), 'utf8')
  html = fillTemplate(html, {
    contact: lead?.contact_name ?? 'there',
    business: lead?.business_name ?? 'your business',
    selected_plan: plan.charAt(0).toUpperCase() + plan.slice(1),
    selected_plan_price: '$' + meta.monthly,
    setup_fee: '$' + meta.setup_fee,
    rep: rep?.full_name ?? 'Your TalkMate rep',
    phone: rep?.phone ?? '',
    email: rep?.notification_email ?? rep?.email ?? 'hello@talkmate.com.au',
  })
  return page(html)
}
```

> Confirm `sales_reps` is the correct table/columns during Step 2 (mirror how `requireSalesRep` loads the rep). Adjust select if the rep table differs.

- [ ] **Step 2: Verify build**

Run: `npx tsc --noEmit && npm run build`
Expected: success.

- [ ] **Step 3: Commit**

```bash
git add src/app/p/accept/[token]/route.ts
git commit -m "feat(proposal): public accept route — confirmation page + record + notify"
```

---

## Task 13: Env config + end-to-end QA

**Files:**
- Modify: Vercel env (preview + prod), local `.env.local`

- [ ] **Step 1: Add env var**

Add `PROPOSAL_EMAIL_FROM=hello@talkmate.com.au` to `.env.local` and (announce first) Vercel preview + prod. Ensure `hello@talkmate.com.au` is a verified Resend sender (it already sends payment-link emails).

- [ ] **Step 2: Deploy preview + Vercel-fit check for Chromium**

Push branch; open the Vercel preview. This is the real test of Task 1's renderer on serverless.

- [ ] **Step 3: Playwright QA (per CLAUDE.md pipeline)**

- Log into the portal (preview), open a test lead, set ROI numbers, pick Pro, send a proposal to `testingtalkmate@gmail.com`.
- In the QA mailbox: confirm the email is from hello@talkmate.com.au, has the PDF attached, the PDF is 6 pages, names/plan/ROI correct, and Pro is the featured ("Most Popular") card.
- Click "Ready to go ahead": confirmation page renders with the right name/plan; a notification email arrives at hello@; the lead shows `proposal_accepted` and a "Proposal accepted by client" activity.
- Re-click the link: page still renders, no duplicate notification.
- Mobile viewport (375px): confirmation page looks right.

- [ ] **Step 4: Final commit / open PR to dev**

```bash
git push -u origin feature/automated-proposal-pdf
```
Open PR `feature/automated-proposal-pdf` -> `dev`. Reviewer gives GREEN/YELLOW/RED. After approval: dev -> main per the standard promotion (Irfan authorises main).

---

## Self-Review notes
- Spec coverage: templates (T2,6), fill/ROI/token (T3-5), PDF (T1), attachment email + hello@ (T7,9), DB (T8), routes/forms ROI + rep-selectable plan (T6,9,10,11), acceptance flow notify+record (T12), QA (T13). All spec sections mapped.
- Open verifications flagged inline: `leads.status` CHECK constraint (T8), `sales_reps` table/columns (T12), Vercel Chromium fit (T1/T13 with fallback).
