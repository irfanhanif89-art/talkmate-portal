# Mobile Sales Rep Phase 2 Sub-project 1 — Live API Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace mock data in the existing `talkmate-mobile` Sales Rep tabs with live calls to the `talkmate-portal` backend, then ship a real installable app to Jade via TestFlight.

**Architecture:** Two repos (portal stays, new mobile repo). Mobile signs in with the Supabase JS SDK + AsyncStorage; portal API calls go out with the Supabase access JWT as a Bearer token. Portal extends `requireSalesRep()` to accept Bearer alongside the existing SSR cookie path. Five new portal GET endpoints + one PATCH extension + one migration close the read/write gap. Mutations use optimistic UI with 3× in-session retry. Final stage = EAS Build + TestFlight + Android internal track.

**Tech Stack:** Next.js 15 / React 19 / Supabase / TypeScript (portal); Expo SDK 54 / React Native 0.81 / React Navigation v7 / JavaScript (mobile); EAS Build + TestFlight + Google Play internal track (distribution).

**Source spec:** `docs/superpowers/specs/2026-05-28-mobile-sales-rep-phase2-live-api-design.md`

---

## Stage layout

The plan has four stages mapping to the spec's stages:

- **Stage 1: Portal backend** (~3 days, ~12 tasks). Tasks 1.x. Ships independently to dev → main.
- **Stage 2: Mobile** (~5 days, ~19 tasks). Tasks 2.x. Depends on Stage 1 being on `dev` (preview Supabase) at minimum.
- **Stage 3: Distribution** (~2 active days + Apple review, ~11 tasks). Tasks 3.x. Hard-blocked on Irfan's account purchases.
- **Stage 4: End-to-end audit** (~1 day, ~10 audit tasks + fix tasks). Tasks 4.x. Bugs found get fixed inline (Irfan pre-authorized on 2026-05-28).

---

## Stage 1: Portal backend

### Task 1.0: Sync repo state + create feature branch

**Files:**
- Modify: `git` state only

**Working directory:** `C:\Users\info\.claude\WEBSITE BUILD\talkmate-portal` (or wherever the active portal git repo lives — confirm with Irfan if ambiguous)

- [ ] **Step 1: Sync `dev` to latest**

```bash
git checkout dev
git pull origin dev
```

Expected: "Already up to date" or fast-forward.

- [ ] **Step 2: Create feature branch**

```bash
git checkout -b feature/mobile-phase2-portal-api
```

Expected: "Switched to a new branch 'feature/mobile-phase2-portal-api'".

- [ ] **Step 3: Confirm next migration number**

At plan-authoring time (2026-05-28) the live repo's last migration was `057_scheduler_bizzow_grid.sql`, so this plan uses **058**. Before applying, re-verify with:

```bash
ls supabase/migrations/ | tail -3
```

If 058 has been claimed by a parallel session, renumber the migration file in Task 1.1 + every "058" reference in this plan + the `SYSTEM_MAP.md` entry in Task 1.10 to the next free number.

---

### Task 1.1: Migration 058 — add `leads.next_followup_at`

**Files:**
- Create: `supabase/migrations/058_lead_followup_at.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Migration 058 — add per-lead followup reminder timestamp.
-- Used by the mobile Sales Rep app's Followup picker on LeadDetailScreen.
-- No automatic notification triggered by this column; push notifications
-- are sub-project 2.

BEGIN;

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS next_followup_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_leads_next_followup_at_active
  ON leads(next_followup_at)
  WHERE status NOT IN ('won', 'lost', 'bad_lead')
    AND next_followup_at IS NOT NULL;

COMMENT ON COLUMN leads.next_followup_at IS
  'When the rep wants to be reminded about this lead. Set via mobile Followup picker. Display-only in Phase 2 sub-project 1; push reminder is sub-project 2.';

COMMIT;
```

- [ ] **Step 2: Sanity-check on a preview branch**

```bash
# Use Supabase MCP or psql against preview project rgifivtzmjvanzqwgadq
# Apply the migration. Verify with:
psql -h <preview-host> -U postgres -d postgres -c "\d leads" | grep next_followup_at
```

Expected: `next_followup_at | timestamp with time zone | |`

- [ ] **Step 3: Verify index exists**

```sql
SELECT indexname FROM pg_indexes WHERE tablename = 'leads' AND indexname = 'idx_leads_next_followup_at_active';
```

Expected: 1 row.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/058_lead_followup_at.sql
git commit -m "feat(migration 058): add leads.next_followup_at for mobile Followup picker"
```

---

### Task 1.2: Extend `requireSalesRep()` for Bearer auth

**Files:**
- Modify: `src/lib/sales-auth.ts`

The current implementation reads only the SSR cookie session. We extend it to ALSO accept `Authorization: Bearer <jwt>` from a request header. The cookie path stays unchanged for the web portal.

- [ ] **Step 1: Read the existing file**

Read `src/lib/sales-auth.ts` (44 lines). Note the function signature: it takes no arguments and uses `createClient()` from `@/lib/supabase/server`.

- [ ] **Step 2: Refactor signature to accept the Request**

Replace `src/lib/sales-auth.ts` with:

```ts
import { createClient, createAdminClient } from '@/lib/supabase/server'

export interface SalesRepRow {
  id: string
  user_id: string
  full_name: string
  email: string
  phone: string | null
  team_id: string | null
  status: 'active' | 'inactive'
  commission_policy_version: string
  policy_acknowledged_at: string | null
  contract_signed_at: string | null
  onboarded_via: 'manual' | 'contractor_flow' | null
  contractor_id: string | null
  notification_email: string | null
}

type RequireSalesRepResult =
  | { ok: true; user: { id: string; email?: string | null }; rep: SalesRepRow }
  | { ok: false; status: number; error: string }

// Shared sales-rep gate for /api/sales/* routes.
//
// Accepts EITHER:
//   - the SSR cookie session (web portal flow, default), OR
//   - Authorization: Bearer <supabase-access-jwt> header (mobile app, opt-in
//     by passing the Request object).
//
// The Bearer path verifies the JWT via supabase.auth.getUser(jwt) using the
// service-role client, which checks the JWT signature against Supabase's
// signing keys. NEVER trust the Bearer header without that round-trip.
export async function requireSalesRep(req?: Request): Promise<RequireSalesRepResult> {
  let userId: string | null = null
  let userEmail: string | null = null

  // Path A — Bearer token (mobile)
  if (req) {
    const authHeader = req.headers.get('authorization') ?? req.headers.get('Authorization')
    if (authHeader && authHeader.toLowerCase().startsWith('bearer ')) {
      const jwt = authHeader.slice(7).trim()
      if (jwt) {
        const admin = createAdminClient()
        const { data, error } = await admin.auth.getUser(jwt)
        if (error || !data?.user) {
          return { ok: false, status: 401, error: 'Invalid or expired token' }
        }
        userId = data.user.id
        userEmail = data.user.email ?? null
      }
    }
  }

  // Path B — SSR cookie (web)
  if (!userId) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { ok: false, status: 401, error: 'Unauthorized' }
    userId = user.id
    userEmail = user.email ?? null
  }

  const admin = createAdminClient()
  const { data: rep } = await admin
    .from('sales_reps')
    .select('id, user_id, full_name, email, phone, team_id, status, commission_policy_version, policy_acknowledged_at, contract_signed_at, onboarded_via, contractor_id, notification_email')
    .eq('user_id', userId)
    .maybeSingle()

  if (!rep) {
    return { ok: false, status: 403, error: 'Sales rep account required' }
  }
  if (rep.status !== 'active') {
    return { ok: false, status: 403, error: 'Your sales rep account has been deactivated' }
  }

  return { ok: true, user: { id: userId, email: userEmail }, rep: rep as SalesRepRow }
}
```

Notes on the refactor:
- The `sales_reps` lookup now uses `createAdminClient()` instead of the cookie-backed `createClient()`. This is safe and necessary: in the Bearer path we don't have a cookie session at all, and in both paths we want to bypass RLS for the rep lookup.
- The `req` parameter is OPTIONAL so existing callers (web portal) continue to compile unchanged.

- [ ] **Step 3: Verify TypeScript still compiles**

```bash
npx tsc --noEmit
```

Expected: clean exit. If the `createAdminClient` import was missing, add it (it's exported from `src/lib/supabase/server.ts`).

- [ ] **Step 4: Find existing callers and pass `req` where we have it**

```bash
grep -rn "requireSalesRep" src/app/api/sales/
```

Each call site looks like `const auth = await requireSalesRep()`. We want each `/api/sales/*` route handler to pass its Request so mobile can authenticate. Edit each call site to `const auth = await requireSalesRep(req)`. Routes that take `(req: Request, ctx: ...)` already have `req` in scope. For the one or two that don't, the cookie path still works — but we should still pass `req` for consistency. Add `req` to handler signatures that lack it.

List of files to update with `requireSalesRep(req)` (one-line edit each):
- `src/app/api/sales/leads/route.ts`
- `src/app/api/sales/leads/[id]/route.ts`
- `src/app/api/sales/leads/[id]/won/route.ts`
- `src/app/api/sales/leads/[id]/lost/route.ts`
- `src/app/api/sales/leads/[id]/bad-lead/route.ts`
- `src/app/api/sales/leads/[id]/activities/route.ts` (both GET and POST)
- `src/app/api/sales/leads/[id]/followups/route.ts`
- `src/app/api/sales/followups/[id]/dismiss/route.ts`
- `src/app/api/sales/launch-demo/route.ts`
- `src/app/api/sales/send-proposal/route.ts`
- `src/app/api/sales/platform-stats/route.ts`
- `src/app/api/sales/profile/route.ts`
- `src/app/api/sales/sign-contract/route.ts`
- `src/app/api/sales/onboard/route.ts`
- `src/app/api/sales/acknowledge-policy/route.ts`
- `src/app/api/sales/storage/contract-url/route.ts`

For each: open the file, find the `requireSalesRep()` call (one per file), change to `requireSalesRep(req)`. If the handler signature doesn't accept `req`, add it: change `export async function GET()` to `export async function GET(req: Request)`.

- [ ] **Step 5: Run tsc**

```bash
npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 6: Smoke-test the web flow still works**

Start the dev server:
```bash
npm run dev
```

Open `http://localhost:3000/login`, sign in as a sales rep, navigate to `/sales/dashboard`. Verify it loads and shows the rep's leads. If it 401s or 500s, the cookie path broke — diagnose before continuing.

- [ ] **Step 7: Commit**

```bash
git add src/lib/sales-auth.ts src/app/api/sales/
git commit -m "feat(sales-auth): accept Bearer JWT alongside SSR cookie for mobile clients"
```

---

### Task 1.3: GET `/api/sales/me`

**Files:**
- Create: `src/app/api/sales/me/route.ts`
- Reference: `src/lib/commission.ts` (existing — has COMMISSION_MAP)

- [ ] **Step 1: Confirm `commission.ts` shape**

```bash
grep -n "COMMISSION_MAP\|commissionRateFor\|bonusRateFor" src/lib/commission.ts
```

You should see exports that yield a commission rate and bonus rate per rep. If the exact API differs from what's below, adapt the route accordingly.

- [ ] **Step 2: Write the route**

```ts
// src/app/api/sales/me/route.ts
import { NextResponse } from 'next/server'
import { requireSalesRep } from '@/lib/sales-auth'
import { createAdminClient } from '@/lib/supabase/server'

function initialsFrom(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return ''
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export async function GET(req: Request) {
  const auth = await requireSalesRep(req)
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status })

  // Fetch the rep's created_at separately — requireSalesRep doesn't include it
  // in its SELECT (kept minimal there for the hot path).
  const admin = createAdminClient()
  const { data: meta } = await admin
    .from('sales_reps')
    .select('created_at')
    .eq('id', auth.rep.id)
    .maybeSingle()

  // Commission rates: hardcoded contractor-flow defaults match the existing
  // mobile mock and the portal's contractor-onboarding flow. If you have
  // per-rep overrides on the row, prefer those.
  const isContractorFlow = auth.rep.onboarded_via === 'contractor_flow'
  const commission_rate = 0.50   // 50% first-month MRR
  const bonus_rate = 0.025       // 2.5% annual close bonus

  return NextResponse.json({
    ok: true,
    rep: {
      id: auth.rep.id,
      name: auth.rep.full_name,
      email: auth.rep.email,
      sales_team_id: auth.rep.team_id,
      is_legacy: !isContractorFlow,
      contractor_id: auth.rep.contractor_id,
      commission_rate,
      bonus_rate,
      joinedDate: meta?.created_at ?? null,
      initials: initialsFrom(auth.rep.full_name),
      notification_email: auth.rep.notification_email,
      phone: auth.rep.phone,
      status: auth.rep.status,
    },
  })
}
```

- [ ] **Step 3: Smoke test with curl**

Generate a rep JWT in the browser console of the web portal while signed in as a sales rep:

```js
// Run in browser DevTools console at app.talkmate.com.au/sales/dashboard
(await window.supabase.auth.getSession()).data.session.access_token
```

(If `window.supabase` isn't exposed, adapt: `JSON.parse(localStorage.getItem('sb-mdsfdaefsxwrakgkyflr-auth-token')).access_token` reads it directly.)

Copy the JWT. Then:

```bash
JWT="<paste here>"
curl -s -H "Authorization: Bearer $JWT" http://localhost:3000/api/sales/me | jq
```

Expected output shape:
```json
{
  "ok": true,
  "rep": {
    "id": "...",
    "name": "Jade Eleanor",
    "email": "jade@talkmate.com.au",
    "sales_team_id": "...",
    "is_legacy": false,
    "contractor_id": "...",
    "commission_rate": 0.5,
    "bonus_rate": 0.025,
    "joinedDate": "2026-04-22T...",
    "initials": "JE",
    "notification_email": null,
    "phone": null,
    "status": "active"
  }
}
```

- [ ] **Step 4: Commit**

```bash
git add src/app/api/sales/me/route.ts
git commit -m "feat(api): add GET /api/sales/me for mobile rep identity"
```

---

### Task 1.4: GET `/api/sales/leads`

**Files:**
- Create: `src/app/api/sales/leads/route.ts` (modify — already exists with POST only, add GET)

- [ ] **Step 1: Open the existing file and add GET**

The file currently exports only `POST`. Add an `export async function GET(req)` at the top of the file, ABOVE the POST. Final structure:

```ts
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireSalesRep } from '@/lib/sales-auth'

const ALLOWED_SOURCES = new Set(['cold_call', 'referral', 'walk_in', 'online', 'other'])

// Lead columns mobile + web both consume. Kept narrow to minimise payload.
const LEAD_SELECT = `
  id, business_name, contact_name, phone, email, industry, suburb, state,
  website, source, notes, status, approval_status,
  won_plan, won_billing_cycle, won_at, won_mrr,
  lost_reason, bad_lead_reason, business_id,
  next_followup_at, created_at, updated_at, assigned_to
`

export async function GET(req: Request) {
  const auth = await requireSalesRep(req)
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status })

  const url = new URL(req.url)
  const includeBadLead = url.searchParams.get('include') === 'bad_lead'
  const stage = url.searchParams.get('status') // optional filter

  const admin = createAdminClient()
  let query = admin
    .from('leads')
    .select(LEAD_SELECT)
    .eq('assigned_to', auth.rep.id)
    .order('updated_at', { ascending: false })
    .limit(500)

  if (!includeBadLead) {
    query = query.neq('status', 'bad_lead')
  }
  if (stage) {
    query = query.eq('status', stage)
  }

  const { data: leads, error } = await query
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, leads: leads ?? [] })
}

// === existing POST below — DO NOT TOUCH ===

export async function POST(req: Request) {
  // ... existing body unchanged ...
}
```

(Preserve the existing POST body exactly as it was.)

- [ ] **Step 2: Confirm `won_billing_cycle` and `won_mrr` are real columns**

```bash
grep -n "won_billing_cycle\|won_mrr" supabase/migrations/*.sql
```

If either is missing from the schema, drop it from the SELECT. Migration 037 added `won_billing_cycle`; verify `won_mrr` exists too. If not present, mobile derives MRR from `won_plan` via the pricing table.

- [ ] **Step 3: Smoke test**

```bash
curl -s -H "Authorization: Bearer $JWT" http://localhost:3000/api/sales/leads | jq '.leads | length'
```

Expected: a number ≥ 0. Spot-check the shape with `| jq '.leads[0]'`.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/sales/leads/route.ts
git commit -m "feat(api): add GET /api/sales/leads for mobile lead list"
```

---

### Task 1.5: GET `/api/sales/activity`

**Files:**
- Create: `src/app/api/sales/activity/route.ts`

- [ ] **Step 1: Write the route**

```ts
// src/app/api/sales/activity/route.ts
import { NextResponse } from 'next/server'
import { requireSalesRep } from '@/lib/sales-auth'
import { createAdminClient } from '@/lib/supabase/server'

export async function GET(req: Request) {
  const auth = await requireSalesRep(req)
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status })

  const url = new URL(req.url)
  const since = url.searchParams.get('since') ?? 'week' // 'today' | 'week' | 'month'

  const now = new Date()
  let sinceDate: Date
  switch (since) {
    case 'today':
      sinceDate = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      break
    case 'month':
      sinceDate = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate())
      break
    case 'week':
    default:
      sinceDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
      break
  }

  const admin = createAdminClient()
  const { data: activities, error } = await admin
    .from('lead_activities')
    .select(`
      id, lead_id, activity_type, title, body, old_status, new_status, created_at,
      leads:lead_id ( business_name, contact_name )
    `)
    .eq('rep_id', auth.rep.id)
    .gte('created_at', sinceDate.toISOString())
    .order('created_at', { ascending: false })
    .limit(500)

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  // Flatten the embedded leads join into top-level fields for the mobile consumer.
  const flattened = (activities ?? []).map((a: any) => ({
    id: a.id,
    lead_id: a.lead_id,
    activity_type: a.activity_type,
    title: a.title,
    body: a.body,
    old_status: a.old_status,
    new_status: a.new_status,
    created_at: a.created_at,
    business_name: a.leads?.business_name ?? null,
    contact_name: a.leads?.contact_name ?? null,
  }))

  return NextResponse.json({ ok: true, activities: flattened })
}
```

- [ ] **Step 2: Verify the join works**

The `lead_activities` table has `rep_id` (per Task 1.2's audit trail INSERT). The relationship to `leads` should exist. Verify with:

```bash
curl -s -H "Authorization: Bearer $JWT" "http://localhost:3000/api/sales/activity?since=week" | jq '.activities[0]'
```

Expected fields: `id, lead_id, activity_type, title, body, created_at, business_name, contact_name`.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/sales/activity/route.ts
git commit -m "feat(api): add GET /api/sales/activity for mobile activity feed"
```

---

### Task 1.6: GET `/api/sales/commissions`

**Files:**
- Create: `src/app/api/sales/commissions/route.ts`
- Reference: existing portal commissions reader (likely in `/sales/commissions/page.tsx`)

- [ ] **Step 1: Find the existing commission query**

```bash
grep -rn "from('commissions')" src/app/sales/
```

Open the file that loads commissions for the web `/sales/commissions` page. Mirror its select clauses + joins so mobile gets the same shape.

- [ ] **Step 2: Write the route**

```ts
// src/app/api/sales/commissions/route.ts
import { NextResponse } from 'next/server'
import { requireSalesRep } from '@/lib/sales-auth'
import { createAdminClient } from '@/lib/supabase/server'

export async function GET(req: Request) {
  const auth = await requireSalesRep(req)
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status })

  const admin = createAdminClient()
  const { data: rows, error } = await admin
    .from('commissions')
    .select(`
      id, lead_id, business_id, status,
      base_amount, bonus_amount, total_amount,
      plan, billing_cycle, won_at,
      approved_at, paid_at, clawback_period_ends_at,
      leads:lead_id ( business_name ),
      businesses:business_id ( name )
    `)
    .eq('sales_rep_id', auth.rep.id)
    .order('won_at', { ascending: false })
    .limit(500)

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  // Flatten joined fields for the mobile consumer.
  const flattened = (rows ?? []).map((c: any) => ({
    id: c.id,
    lead_id: c.lead_id,
    business_id: c.business_id,
    business_name: c.businesses?.name ?? c.leads?.business_name ?? '(unknown)',
    plan: c.plan,
    billing_cycle: c.billing_cycle,
    base_amount: c.base_amount,
    bonus_amount: c.bonus_amount,
    total: c.total_amount ?? (c.base_amount ?? 0) + (c.bonus_amount ?? 0),
    status: c.status,
    won_at: c.won_at,
    approved_at: c.approved_at,
    paid_at: c.paid_at,
    clawback_period_ends_at: c.clawback_period_ends_at,
  }))

  return NextResponse.json({ ok: true, commissions: flattened })
}
```

- [ ] **Step 3: Verify column names match your schema**

```bash
grep -n "base_amount\|bonus_amount\|total_amount" supabase/migrations/*.sql
```

If your `commissions` table uses different column names (e.g. `amount_base` vs `base_amount`), adapt the SELECT.

- [ ] **Step 4: Smoke test**

```bash
curl -s -H "Authorization: Bearer $JWT" http://localhost:3000/api/sales/commissions | jq '.commissions | length, .commissions[0]'
```

- [ ] **Step 5: Commit**

```bash
git add src/app/api/sales/commissions/route.ts
git commit -m "feat(api): add GET /api/sales/commissions for mobile ledger"
```

---

### Task 1.7: GET `/api/sales/pipeline`

**Files:**
- Create: `src/app/api/sales/pipeline/route.ts`

- [ ] **Step 1: Write the route**

```ts
// src/app/api/sales/pipeline/route.ts
import { NextResponse } from 'next/server'
import { requireSalesRep } from '@/lib/sales-auth'
import { createAdminClient } from '@/lib/supabase/server'

// In-flight stages shown on the kanban (in display order).
// 'lost' and 'bad_lead' deliberately omitted — reachable via filter chip / Mark Lost / admin only.
const KANBAN_STAGES: Array<{ id: string; label: string }> = [
  { id: 'new',          label: 'New' },
  { id: 'contacted',    label: 'Contacted' },
  { id: 'demo_booked',  label: 'Demo Booked' },
  { id: 'demo_done',    label: 'Demo Done' },
  { id: 'proposal_sent', label: 'Proposal Sent' },
  { id: 'nurture',      label: 'Nurture' },
  { id: 'won',          label: 'Won' },
]

export async function GET(req: Request) {
  const auth = await requireSalesRep(req)
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status })

  const admin = createAdminClient()
  const { data: leads, error } = await admin
    .from('leads')
    .select('id, business_name, contact_name, status, won_plan, won_mrr, updated_at')
    .eq('assigned_to', auth.rep.id)
    .neq('status', 'lost')
    .neq('status', 'bad_lead')
    .order('updated_at', { ascending: false })

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  const grouped = KANBAN_STAGES.map(stage => ({
    id: stage.id,
    label: stage.label,
    count: leads?.filter(l => l.status === stage.id).length ?? 0,
    leads: leads?.filter(l => l.status === stage.id) ?? [],
  }))

  return NextResponse.json({ ok: true, stages: grouped })
}
```

- [ ] **Step 2: Smoke test**

```bash
curl -s -H "Authorization: Bearer $JWT" http://localhost:3000/api/sales/pipeline | jq '.stages | map({id, count})'
```

Expected: array of 7 `{id, count}` objects.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/sales/pipeline/route.ts
git commit -m "feat(api): add GET /api/sales/pipeline for mobile kanban"
```

---

### Task 1.8: Extend PATCH `/api/sales/leads/[id]` to accept `next_followup_at`

**Files:**
- Modify: `src/app/api/sales/leads/[id]/route.ts`

- [ ] **Step 1: Update EDITABLE_FIELDS**

In `src/app/api/sales/leads/[id]/route.ts`, change:

```ts
const EDITABLE_FIELDS = new Set([
  'contact_name', 'phone', 'email', 'website', 'notes', 'industry', 'suburb', 'state',
])
```

to:

```ts
const EDITABLE_FIELDS = new Set([
  'contact_name', 'phone', 'email', 'website', 'notes', 'industry', 'suburb', 'state',
  'next_followup_at',
])
```

- [ ] **Step 2: Validate `next_followup_at` shape**

Before the existing `if (body.status !== undefined)` block, add a `next_followup_at` validator:

```ts
if (body.next_followup_at !== undefined && body.next_followup_at !== null) {
  if (typeof body.next_followup_at !== 'string') {
    return NextResponse.json({ ok: false, error: 'next_followup_at must be an ISO timestamp string or null' }, { status: 400 })
  }
  const d = new Date(body.next_followup_at)
  if (isNaN(d.getTime())) {
    return NextResponse.json({ ok: false, error: 'next_followup_at is not a valid timestamp' }, { status: 400 })
  }
}
```

- [ ] **Step 3: Smoke test**

```bash
LEAD_ID="<id-of-one-of-the-rep's-leads>"
curl -s -X PATCH -H "Authorization: Bearer $JWT" -H "Content-Type: application/json" \
  -d '{"next_followup_at":"2026-06-01T10:00:00Z"}' \
  http://localhost:3000/api/sales/leads/$LEAD_ID | jq
```

Expected: `{ ok: true, lead: { ..., next_followup_at: "2026-06-01T10:00:00+00:00" } }`.

Try setting it back to null:
```bash
curl -s -X PATCH -H "Authorization: Bearer $JWT" -H "Content-Type: application/json" \
  -d '{"next_followup_at":null}' \
  http://localhost:3000/api/sales/leads/$LEAD_ID | jq
```

Try an invalid value:
```bash
curl -s -X PATCH -H "Authorization: Bearer $JWT" -H "Content-Type: application/json" \
  -d '{"next_followup_at":"not-a-date"}' \
  http://localhost:3000/api/sales/leads/$LEAD_ID
```
Expected: 400 with `"next_followup_at is not a valid timestamp"`.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/sales/leads/[id]/route.ts
git commit -m "feat(api): extend PATCH /api/sales/leads/[id] to accept next_followup_at"
```

---

### Task 1.9: Security audit — five failure-mode tests

**Files:** none (testing only)

- [ ] **Step 1: No auth header → 401**

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/sales/me
```
Expected: `401`.

- [ ] **Step 2: Garbage Bearer → 401**

```bash
curl -s -o /dev/null -w "%{http_code}\n" -H "Authorization: Bearer garbage" http://localhost:3000/api/sales/me
```
Expected: `401`.

- [ ] **Step 3: Valid JWT for a non-rep user → 403**

Sign in to the web portal as a client (e.g. Glen-equivalent test account), grab their JWT from the browser console, then:

```bash
CLIENT_JWT="<paste client jwt>"
curl -s -o /dev/null -w "%{http_code}\n" -H "Authorization: Bearer $CLIENT_JWT" http://localhost:3000/api/sales/me
```
Expected: `403` (the JWT is valid but the user has no `sales_reps` row).

- [ ] **Step 4: Expired JWT → 401**

Wait for a JWT to expire (default 1h), or manually decode and mangle the expiry. Easiest: sign out and sign back in to invalidate the old token.

```bash
OLD_JWT="<old expired jwt>"
curl -s -o /dev/null -w "%{http_code}\n" -H "Authorization: Bearer $OLD_JWT" http://localhost:3000/api/sales/me
```
Expected: `401`.

- [ ] **Step 5: Valid rep JWT → 200**

```bash
curl -s -o /dev/null -w "%{http_code}\n" -H "Authorization: Bearer $JWT" http://localhost:3000/api/sales/me
```
Expected: `200`.

- [ ] **Step 6: Web portal still works**

Open `http://localhost:3000/sales/dashboard` in a browser signed in as the rep. Confirm the dashboard loads. If it returns 401/500, the SSR cookie path broke — debug before continuing.

If any of these tests fail, FIX the cause before committing or pushing.

---

### Task 1.10: Update SYSTEM_MAP.md

**Files:**
- Modify: `SYSTEM_MAP.md`

- [ ] **Step 1: Add a session row to the Session Log table**

Append to the Session Log table:

```
| 53 | 2026-05-XX | feature/mobile-phase2-portal-api | <sha> | 058 | Mobile Phase 2 sub-project 1 (backend) — `requireSalesRep()` extended to accept Bearer JWT, 5 new GET endpoints (/api/sales/me, /api/sales/leads, /api/sales/activity, /api/sales/commissions, /api/sales/pipeline), PATCH /api/sales/leads/[id] gains next_followup_at, migration 058 adds leads.next_followup_at column |
```

Use the session number that's next in your sequence (52, 53, whatever — check the last row of the Session Log).

- [ ] **Step 2: Update header**

Change the top of `SYSTEM_MAP.md`:

```
**Last updated:** 2026-05-XX
**Last session:** 53 (or whatever)
**Next migration number:** 051
```

- [ ] **Step 3: Add the 5 new routes to "Key API Routes"**

Insert under the Sales section:

```
| GET | /api/sales/me | sales rep (cookie OR Bearer) | Rep identity for mobile app |
| GET | /api/sales/leads | sales rep (cookie OR Bearer) | Mobile lead list |
| GET | /api/sales/activity?since=today\|week\|month | sales rep (cookie OR Bearer) | Mobile activity feed |
| GET | /api/sales/commissions | sales rep (cookie OR Bearer) | Mobile commission ledger |
| GET | /api/sales/pipeline | sales rep (cookie OR Bearer) | Mobile kanban counts |
```

- [ ] **Step 4: Add migration 058 to the Migration Registry**

```
| 058 | 058_lead_followup_at.sql | Add leads.next_followup_at timestamptz + partial index — per-lead reminder timestamp for mobile Followup picker |
```

- [ ] **Step 5: Commit**

```bash
git add SYSTEM_MAP.md
git commit -m "docs(system-map): record mobile Phase 2 sub-project 1 (backend portion)"
```

---

### Task 1.11: Open portal PR, run pipeline, ship to prod

- [ ] **Step 1: Push the branch**

```bash
git push -u origin feature/mobile-phase2-portal-api
```

- [ ] **Step 2: Open the PR via gh**

```bash
gh pr create --base dev --title "Mobile Phase 2 sub-project 1 — portal backend" --body "$(cat <<'EOF'
## Summary
- Migration 058 adds leads.next_followup_at
- requireSalesRep() extended to accept Bearer JWT (mobile clients)
- 5 new GET endpoints: /api/sales/me, /leads, /activity, /commissions, /pipeline
- PATCH /api/sales/leads/[id] accepts next_followup_at

## Test plan
- [ ] tsc clean
- [ ] All 5 GETs return 200 with a valid rep JWT
- [ ] All 5 GETs return 401 without auth, 403 with non-rep JWT
- [ ] Web portal /sales/dashboard still loads (cookie path unchanged)
- [ ] PATCH next_followup_at sets the column; null clears it; invalid values 400

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 3: Run the full local pipeline before requesting review**

Per `~/.claude/CLAUDE.md`: Builder → Validator → QA → Reviewer → Report.

```bash
npm run build
npx tsc --noEmit
```

Both must pass. If either fails, fix in the branch and force-push (or amend + push) before requesting review.

- [ ] **Step 4: Reviewer GREEN, merge dev**

```bash
gh pr merge --merge --delete-branch
```

- [ ] **Step 5: Apply migration to PROD Supabase**

This is the production-changing step — announce in chat first per `~/.claude/CLAUDE.md`. Then apply migration 058 to prod (via Supabase MCP `apply_migration` or `psql` against the prod connection string).

- [ ] **Step 6: Promote dev → main**

```bash
git checkout main
git pull origin main
git merge dev
git push origin main
```

Vercel auto-deploys main. Wait for the deploy to reach READY.

- [ ] **Step 7: Smoke prod**

```bash
PROD_JWT="<prod rep jwt>"
curl -s -H "Authorization: Bearer $PROD_JWT" https://app.talkmate.com.au/api/sales/me | jq .ok
```
Expected: `true`.

- [ ] **Step 8: Stage 1 done**

Stage 1 is complete. Move to Stage 2.

---

## Stage 2: Mobile

**Working directory:** `C:\Users\info\.claude\WEBSITE BUILD\talkmate-mobile`

### Task 2.0: Push talkmate-mobile to GitHub

**Files:** git operations only

- [ ] **Step 1: Confirm current state**

```bash
git status
git log --oneline -5
```

You should be on `main` at commit `ebbede8` (or a successor if you've committed locally since Phase 1).

- [ ] **Step 2: Create the GitHub repo**

```bash
gh repo create irfanhanif89-art/talkmate-mobile --private --description "TalkMate mobile app (Expo / React Native) — Sales Rep + future client modes"
```

- [ ] **Step 3: Add the remote and push**

```bash
git remote add origin https://github.com/irfanhanif89-art/talkmate-mobile.git
git push -u origin main
```

- [ ] **Step 4: Create the feature branch for Phase 2**

```bash
git checkout -b feature/phase2-live-api
```

---

### Task 2.1: Add Phase 2 dependencies (already in package.json — verify only)

**Files:** verify `package.json`

- [ ] **Step 1: Verify Supabase SDK + AsyncStorage + URL polyfill are present**

```bash
grep -E "supabase-js|async-storage|url-polyfill" package.json
```

Expected: all three (these were already added in Phase 1's setup; the package.json shows them). If any are missing:

```bash
npx expo install @supabase/supabase-js @react-native-async-storage/async-storage react-native-url-polyfill
```

No commit needed if nothing changed.

---

### Task 2.2: Environment variable plumbing

**Files:**
- Create: `app.config.js` (Expo config that overrides app.json with env-var reads)
- Modify: `.gitignore` (add `.env.local`)
- Create: `.env.example` (committed) and `.env.local` (NOT committed)

- [ ] **Step 1: Convert app.json to app.config.js**

Expo reads `app.config.js` over `app.json` when both exist. Move runtime config to a JS file so env vars can be injected.

Create `app.config.js`:

```js
// Reads env vars at config-resolution time. EAS Build resolves these from
// the project's EAS env config; local dev resolves from .env.local via expo-dotenv.
//
// Required vars:
//   EXPO_PUBLIC_API_URL              — portal base URL (no trailing slash)
//   EXPO_PUBLIC_SUPABASE_URL         — Supabase project URL
//   EXPO_PUBLIC_SUPABASE_ANON_KEY    — Supabase anon key

module.exports = ({ config }) => ({
  ...config,
  name: 'TalkMate',
  slug: 'talkmate-mobile',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'dark',
  scheme: 'talkmate',
  ios: { supportsTablet: false, bundleIdentifier: 'com.talkmate.mobile' },
  android: {
    adaptiveIcon: { foregroundImage: './assets/icon.png', backgroundColor: '#061322' },
    package: 'com.talkmate.mobile',
  },
  assetBundlePatterns: ['**/*'],
  plugins: [
    ['expo-notifications', { icon: './assets/icon.png', color: '#E8622A' }],
    'expo-font',
  ],
  extra: {
    apiUrl: process.env.EXPO_PUBLIC_API_URL,
    supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
    supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  },
})
```

- [ ] **Step 2: Delete app.json**

```bash
rm app.json
```

(Expo will use app.config.js now. If you want belt-and-braces, keep app.json as a fallback but app.config.js wins.)

- [ ] **Step 3: Create .env.example**

```bash
cat > .env.example <<'EOF'
# Copy to .env.local and fill with real values.
EXPO_PUBLIC_API_URL=https://app.talkmate.com.au
EXPO_PUBLIC_SUPABASE_URL=https://mdsfdaefsxwrakgkyflr.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=<paste prod anon key>
EOF
```

- [ ] **Step 4: Create .env.local**

```bash
cat > .env.local <<'EOF'
EXPO_PUBLIC_API_URL=https://app.talkmate.com.au
EXPO_PUBLIC_SUPABASE_URL=https://mdsfdaefsxwrakgkyflr.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=<paste real key from portal .env or Supabase dashboard>
EOF
```

(Use prod values for now since the preview portal flow is optional. Switch to preview when needed.)

- [ ] **Step 5: Update .gitignore**

Add (if missing):
```
.env.local
.env.*.local
```

- [ ] **Step 6: Smoke check**

```bash
npx expo start
```

The Metro bundler should start without errors. Press `i` to open iOS simulator (or scan QR with Expo Go on phone). The app should boot the existing Phase 1 mock screens — no live data wired yet.

- [ ] **Step 7: Commit**

```bash
git add app.config.js .env.example .gitignore
git rm app.json
git commit -m "chore(config): switch to app.config.js for env-var injection"
```

---

### Task 2.3: Create `src/lib/supabase.js`

**Files:**
- Create: `src/lib/supabase.js`

- [ ] **Step 1: Make the directory**

```bash
mkdir -p src/lib
```

- [ ] **Step 2: Write the client**

```js
// src/lib/supabase.js
import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import Constants from 'expo-constants';

const supabaseUrl = Constants.expoConfig?.extra?.supabaseUrl;
const supabaseAnonKey = Constants.expoConfig?.extra?.supabaseAnonKey;

if (!supabaseUrl || !supabaseAnonKey) {
  // Fail loud — the app cannot function without these.
  throw new Error(
    'Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY. ' +
    'Check .env.local locally or EAS env vars in CI.'
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false, // RN — no URL session detection
  },
});
```

Note: `expo-constants` is already a transitive dependency of Expo SDK 54; no `expo install` needed.

- [ ] **Step 3: Commit**

```bash
git add src/lib/supabase.js
git commit -m "feat(mobile): Supabase client with AsyncStorage session persistence"
```

---

### Task 2.4: Create `src/lib/api.js`

**Files:**
- Create: `src/lib/api.js`

The fetch layer: gets the current JWT from the Supabase session, adds it as Bearer, handles retries with backoff.

- [ ] **Step 1: Write the API wrapper**

```js
// src/lib/api.js
import Constants from 'expo-constants';
import { supabase } from './supabase';

const API_URL = Constants.expoConfig?.extra?.apiUrl;

if (!API_URL) {
  throw new Error('Missing EXPO_PUBLIC_API_URL');
}

class ApiError extends Error {
  constructor(message, status, body) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

export { ApiError };

async function getAccessToken() {
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error) throw new Error('Could not load session: ' + error.message);
  if (!session) throw new ApiError('Not authenticated', 401, null);
  return session.access_token;
}

const BACKOFF_MS = [500, 1000, 2000]; // 3 retries

async function withRetry(fn) {
  let lastError;
  for (let attempt = 0; attempt < BACKOFF_MS.length + 1; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      // Don't retry 4xx — those are deterministic.
      if (err instanceof ApiError && err.status >= 400 && err.status < 500) throw err;
      if (attempt < BACKOFF_MS.length) {
        await new Promise(r => setTimeout(r, BACKOFF_MS[attempt]));
      }
    }
  }
  throw lastError;
}

async function request(path, options = {}) {
  return withRetry(async () => {
    const token = await getAccessToken();
    const res = await fetch(API_URL + path, {
      ...options,
      headers: {
        ...options.headers,
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    let body = null;
    const text = await res.text();
    if (text) {
      try { body = JSON.parse(text); } catch { body = text; }
    }

    if (!res.ok) {
      const msg = (body && typeof body === 'object' && body.error) ? body.error : `HTTP ${res.status}`;
      throw new ApiError(msg, res.status, body);
    }
    return body;
  });
}

export const apiGet   = (path)          => request(path, { method: 'GET' });
export const apiPost  = (path, body)    => request(path, { method: 'POST',  body: JSON.stringify(body ?? {}) });
export const apiPatch = (path, body)    => request(path, { method: 'PATCH', body: JSON.stringify(body ?? {}) });
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/api.js
git commit -m "feat(mobile): API wrapper with Bearer auth and 3x retry"
```

---

### Task 2.5: Create `src/data/types.js` — canonical stage list

**Files:**
- Create: `src/data/types.js`

- [ ] **Step 1: Write the constants**

```js
// src/data/types.js
// Source of truth for lead stages. Mirrors the portal's
// EDITABLE_FIELDS / ALLOWED_STATUSES on /api/sales/leads/[id].
//
// Note: portal also has 'bad_lead' status but mobile never sets it
// (admin-only). 'lost' is terminal — set via Mark Lost modal which
// calls POST /api/sales/leads/[id]/lost, NOT PATCH.

export const LEAD_STATUSES = [
  'new',
  'contacted',
  'demo_booked',
  'demo_done',
  'proposal_sent',
  'nurture',
  'won',
  'lost',
];

export const KANBAN_STAGES = [
  'new',
  'contacted',
  'demo_booked',
  'demo_done',
  'proposal_sent',
  'nurture',
  'won',
];

// In-flight statuses (rep can PATCH to these via the stage selector).
// 'won' and 'lost' use dedicated POST endpoints.
export const PATCHABLE_STATUSES = [
  'new', 'contacted', 'demo_booked', 'demo_done', 'proposal_sent', 'nurture',
];

export const STATUS_LABELS = {
  new:           'New',
  contacted:     'Contacted',
  demo_booked:   'Demo Booked',
  demo_done:     'Demo Done',
  proposal_sent: 'Proposal Sent',
  nurture:       'Nurture',
  won:           'Won',
  lost:          'Lost',
};

export const LOST_REASONS = [
  { id: 'not_interested', label: 'Not interested' },
  { id: 'wrong_fit',      label: 'Wrong fit' },
  { id: 'no_budget',      label: 'No budget' },
  { id: 'too_late',       label: 'Too late' },
  { id: 'unreachable',    label: 'Unreachable' },
  { id: 'other',          label: 'Other' },
];

export const LEAD_SOURCES = [
  { id: 'cold_call', label: 'Cold call' },
  { id: 'referral',  label: 'Referral' },
  { id: 'walk_in',   label: 'Walk-in' },
  { id: 'online',    label: 'Online' },
  { id: 'other',     label: 'Other' },
];
```

- [ ] **Step 2: Commit**

```bash
git add src/data/types.js
git commit -m "feat(mobile): canonical LEAD_STATUSES + STATUS_LABELS aligned with portal"
```

---

### Task 2.6: Rewrite `AuthContext.js` to use Supabase

**Files:**
- Modify: `src/context/AuthContext.js` (full rewrite)

- [ ] **Step 1: Replace the file contents**

```js
// src/context/AuthContext.js
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { apiGet, ApiError } from '../lib/api';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);    // Supabase auth user
  const [rep, setRep] = useState(null);      // The /api/sales/me rep object
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState(null);

  // Boot — restore session from AsyncStorage and try to fetch /me.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (cancelled) return;
        if (session) {
          await loadRep(session.user);
        }
      } catch (err) {
        console.warn('Auth boot failed:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    // Listen for sign-in / sign-out events.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session?.user) {
        await loadRep(session.user);
      } else {
        setUser(null);
        setRep(null);
      }
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadRep(authUser) {
    try {
      const res = await apiGet('/api/sales/me');
      if (res?.ok && res.rep) {
        setUser(authUser);
        setRep(res.rep);
        setAuthError(null);
      } else {
        // No rep record — sign out and surface a clear message.
        await supabase.auth.signOut();
        setUser(null);
        setRep(null);
        setAuthError('Not a sales rep — use the portal at app.talkmate.com.au');
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        await supabase.auth.signOut();
        setUser(null);
        setRep(null);
        setAuthError('Not a sales rep — use the portal at app.talkmate.com.au');
      } else if (err instanceof ApiError && err.status === 401) {
        // Session was rejected — sign out.
        await supabase.auth.signOut();
        setUser(null);
        setRep(null);
      } else {
        // Network error — leave the cached state alone.
        console.warn('loadRep failed:', err);
      }
    }
  }

  const login = async (email, password) => {
    setAuthError(null);
    if (!email || !password) {
      throw new Error('Please enter email and password.');
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) throw new Error(error.message);
      // onAuthStateChange handles loadRep().
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setRep(null);
    setAuthError(null);
  };

  const value = useMemo(() => ({
    user,
    rep,
    loading,
    authError,
    isAuthenticated: !!user && !!rep,
    isSalesRep: !!rep,
    // Kept for backwards compatibility with the existing screen code:
    business: null,
    isAdmin: false,
    canUseCommand: false, // CommandBar hidden in sales rep mode per spec
    canSeeDispatch: false,
    canSeePipeline: true,
    login,
    logout,
  }), [user, rep, loading, authError]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
};
```

- [ ] **Step 2: Hand-verify the existing call sites still compile**

```bash
grep -rn "useAuth\|loginAsDemoClient\|updateAgentStatus" src/
```

Look for any caller of the old `loginAsDemoClient` or `updateAgentStatus` — those are removed. The most likely caller is `OnboardingSuccessScreen.js`. Since mobile is now sales-rep-only, that screen is dead code; remove the call if it's there (or leave the file untouched if the navigator never reaches it — see Task 2.7).

- [ ] **Step 3: Commit**

```bash
git add src/context/AuthContext.js
git commit -m "feat(mobile): AuthContext uses Supabase for real sign-in + /api/sales/me"
```

---

### Task 2.7: Simplify `AppNavigator.js`

**Files:**
- Modify: `src/navigation/AppNavigator.js`

- [ ] **Step 1: Read the existing file**

```bash
wc -l src/navigation/AppNavigator.js
```

Note the existing branching logic (admin / client / sales rep / unauthenticated).

- [ ] **Step 2: Replace with sales-rep-only branching**

Inside the navigator's render, the current `isAdmin → AdminTabs : isSalesRep → SalesRepTabs : ClientTabs` three-way branch becomes:

```js
// Pseudo-shape — apply to your existing component structure
if (loading) return <SplashScreen />;
if (!isAuthenticated) return <AuthStack />;        // login, etc.
return <SalesRepTabs />;                            // sales rep tabs only
```

Concrete edit: find the `isAdmin ?` ternary in the navigator, simplify to:

```js
return (
  <NavigationContainer>
    {loading
      ? <SplashScreen />
      : !isAuthenticated
        ? <AuthStack />
        : <SalesRepTabs />}
  </NavigationContainer>
);
```

(Keep `AdminTabs` and `ClientTabs` imported so the files don't get accidentally tree-shaken away; just don't render them.)

- [ ] **Step 3: Smoke test**

```bash
npx expo start
```

Sign in as Jade (rep@talkmate.com.au will no longer work — use her real password). The navigator should land on Sales Rep tabs. Sign out should bounce to login.

- [ ] **Step 4: Commit**

```bash
git add src/navigation/AppNavigator.js
git commit -m "feat(mobile): simplify navigator to sales-rep-only flow"
```

---

### Task 2.8: Wire LoginScreen to real auth

**Files:**
- Modify: `src/screens/auth/LoginScreen.js`

- [ ] **Step 1: Inspect the existing LoginScreen**

```bash
head -60 src/screens/auth/LoginScreen.js
```

The Phase 1 LoginScreen called `login(email, password)` from AuthContext, which mock-returned a user. The shape stays the same — only the failure UX changes (real Supabase errors now).

- [ ] **Step 2: Show `authError` if present**

Above the email input, render:

```js
const { authError } = useAuth();
// ...
{authError && (
  <View style={styles.errorBanner}>
    <Text style={styles.errorText}>{authError}</Text>
  </View>
)}
```

Style:
```js
errorBanner: {
  backgroundColor: colors.error || '#7c1d1d',
  padding: spacing.md,
  borderRadius: radius.sm,
  marginBottom: spacing.md,
},
errorText: { color: colors.bg, fontFamily: fonts.medium },
```

- [ ] **Step 3: Catch errors from `login()`**

Wrap the existing submit handler:

```js
async function onSubmit() {
  setSubmitting(true);
  try {
    await login(email, password);
    // Navigation handled by AuthContext + AppNavigator.
  } catch (err) {
    Alert.alert('Sign in failed', err.message || 'Please check your email and password.');
  } finally {
    setSubmitting(false);
  }
}
```

- [ ] **Step 4: Smoke test**

Run on Expo Go. Try:
- Empty fields → "Please enter email and password" alert
- Wrong password → Supabase's "Invalid login credentials"
- Non-rep account → bounces to login with `authError` banner showing
- Valid rep credentials → LeadsScreen

- [ ] **Step 5: Commit**

```bash
git add src/screens/auth/LoginScreen.js
git commit -m "feat(mobile): real Supabase login with proper error surfacing"
```

---

### Task 2.9: Wire LeadsScreen to GET /api/sales/leads

**Files:**
- Modify: `src/screens/sales/LeadsScreen.js`

- [ ] **Step 1: Add fetch hook above the component**

At the top of the file (after the imports), replace `import { mockLeads } from '../../data/mockData';` with:

```js
import { useEffect, useState, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { apiGet } from '../../lib/api';

function useLeads() {
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const reload = useCallback(async () => {
    setError(null);
    try {
      const res = await apiGet('/api/sales/leads');
      setLeads(res?.leads ?? []);
    } catch (err) {
      setError(err.message || 'Could not load leads');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { reload(); }, [reload]);
  useFocusEffect(useCallback(() => { reload(); }, [reload]));

  return { leads, loading, error, reload };
}
```

(Note: the existing file already imports useCallback and useState etc.; collapse any duplicate imports.)

- [ ] **Step 2: Replace the mock data reference**

Inside the component:

```js
export default function LeadsScreen({ navigation }) {
  const { rep } = useAuth();
  const partner = usePartner();
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const { leads, loading, error, reload } = useLeads();

  const onRefresh = useCallback(() => {
    reload();
  }, [reload]);
  // ... rest unchanged, but rename every `mockLeads` to `leads`
```

Then in the filtering logic (currently `mockLeads.filter(...)`), change to `leads.filter(...)`.

- [ ] **Step 3: Add loading + error UI**

Above the FlatList:

```js
{loading && leads.length === 0 && (
  <View style={{padding: spacing.lg}}><Text style={{color: colors.textMuted}}>Loading…</Text></View>
)}
{error && (
  <View style={{padding: spacing.md, backgroundColor: '#7c1d1d', margin: spacing.md, borderRadius: radius.sm}}>
    <Text style={{color: colors.bg}}>{error} — pull down to retry.</Text>
  </View>
)}
```

- [ ] **Step 4: Map status field**

Phase 1 mock had `lead.stage` — portal returns `lead.status`. Search the file for `lead.stage` and replace with `lead.status`. Also: the mock had `lead.temperature` ('hot'/'warm'/'cold') which the portal doesn't return; for now derive temperature client-side:

```js
function deriveTemperature(lead) {
  // Cheap heuristic: connected + recent = hot, voicemail/no answer + recent = warm, else cold.
  // Replace with portal-side enrichment when sub-project 7 (rep insights) ships.
  if (!lead.last_call_at) return 'cold';
  const daysAgo = (Date.now() - new Date(lead.last_call_at).getTime()) / 86400000;
  if (daysAgo > 14) return 'cold';
  if (lead.last_call_outcome === 'connected' || lead.last_call_outcome === 'connected_qualified') return 'hot';
  return 'warm';
}
```

Replace every read of `lead.temperature` with `deriveTemperature(lead)`. Caveat: `leads.last_call_at` / `last_call_outcome` ARE NOT in the portal response schema (Stage 1 didn't add them). For now, derive from the most recent lead_activity OR treat all as 'warm'. Quick fix: default to `'warm'` and patch when Stage 2.10 wires LeadDetail (which loads activities anyway).

- [ ] **Step 5: Smoke test**

```bash
npx expo start
```

Sign in. LeadsScreen should show Jade's real prod leads. Pull-to-refresh should re-fetch. Backgrounding the app then returning should trigger `useFocusEffect`.

- [ ] **Step 6: Commit**

```bash
git add src/screens/sales/LeadsScreen.js
git commit -m "feat(mobile): wire LeadsScreen to live /api/sales/leads"
```

---

### Task 2.10: Wire LeadDetailScreen mutations

**Files:**
- Modify: `src/screens/sales/LeadDetailScreen.js`

The biggest screen. Five mutations (mark won, mark lost, change stage, add note, set followup) plus loading an activities list.

- [ ] **Step 1: Add fetch hook for the lead + activities**

Top of file, after imports:

```js
import { apiGet, apiPost, apiPatch, ApiError } from '../../lib/api';
import { PATCHABLE_STATUSES, STATUS_LABELS, LOST_REASONS } from '../../data/types';

function useLeadDetail(leadId) {
  const [lead, setLead] = useState(null);
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const reload = useCallback(async () => {
    setError(null);
    try {
      const [leadsRes, actsRes] = await Promise.all([
        apiGet('/api/sales/leads'),
        apiGet(`/api/sales/leads/${leadId}/activities`),
      ]);
      const found = (leadsRes?.leads ?? []).find(l => l.id === leadId);
      setLead(found ?? null);
      setActivities(actsRes?.activities ?? []);
    } catch (err) {
      setError(err.message || 'Could not load lead');
    } finally {
      setLoading(false);
    }
  }, [leadId]);

  useEffect(() => { reload(); }, [reload]);

  return { lead, setLead, activities, setActivities, loading, error, reload };
}
```

Optimisation later: a dedicated `GET /api/sales/leads/[id]` endpoint avoids fetching all leads. For now, the existing GET /api/sales/leads list is fine.

- [ ] **Step 2: Wire stage selector to PATCH**

Find the existing "stage selector" UI. The onPress handler currently mutates local mock. Change to:

```js
async function setStage(newStatus) {
  if (!PATCHABLE_STATUSES.includes(newStatus)) {
    // Won / Lost go through dedicated modals, not the stage selector tap.
    return;
  }
  const prev = lead.status;
  setLead({ ...lead, status: newStatus }); // optimistic
  try {
    await apiPatch(`/api/sales/leads/${leadId}`, { status: newStatus });
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      showReassignmentToast();
      navigation.goBack();
      return;
    }
    setLead({ ...lead, status: prev }); // revert
    showRetryBanner(`Couldn't change stage: ${err.message}`);
  }
}

function showReassignmentToast() {
  // Use a simple Alert for v1; replace with a proper toast later.
  Alert.alert('Reassigned', 'This lead is no longer assigned to you.');
}

function showRetryBanner(msg) {
  Alert.alert('Sync failed', msg);
}
```

- [ ] **Step 3: Wire Mark Won modal submit**

```js
async function submitWon({ plan, billing_cycle, setup_fee_waived }) {
  try {
    await apiPost(`/api/sales/leads/${leadId}/won`, { plan, billing_cycle, setup_fee_waived });
    setLead({ ...lead, status: 'won', won_plan: plan, won_billing_cycle: billing_cycle });
    setWonModalOpen(false);
    Alert.alert('Won', 'Commission has been recorded.');
    reload();
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      showReassignmentToast();
      navigation.goBack();
      return;
    }
    Alert.alert('Couldn't mark won', err.message);
  }
}
```

- [ ] **Step 4: Wire Mark Lost modal submit**

```js
async function submitLost({ reason }) {
  try {
    await apiPost(`/api/sales/leads/${leadId}/lost`, { reason });
    setLead({ ...lead, status: 'lost', lost_reason: reason });
    setLostModalOpen(false);
    reload();
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      showReassignmentToast();
      navigation.goBack();
      return;
    }
    Alert.alert('Couldn't mark lost', err.message);
  }
}
```

- [ ] **Step 5: Wire Add Note submit**

```js
async function submitNote(body) {
  if (!body || !body.trim()) return;
  // Optimistic activity entry
  const tempId = `temp-${Date.now()}`;
  const optimistic = {
    id: tempId,
    lead_id: leadId,
    activity_type: 'note',
    title: 'Note',
    body: body.trim(),
    created_at: new Date().toISOString(),
  };
  setActivities([optimistic, ...activities]);
  setNoteInput('');
  try {
    const res = await apiPost(`/api/sales/leads/${leadId}/activities`, {
      activity_type: 'note',
      body: body.trim(),
    });
    // Swap temp with server row
    if (res?.activity) {
      setActivities(curr => [res.activity, ...curr.filter(a => a.id !== tempId)]);
    }
  } catch (err) {
    setActivities(curr => curr.filter(a => a.id !== tempId)); // revert
    Alert.alert('Couldn't save note', err.message);
  }
}
```

(Note: `POST /api/sales/leads/[id]/activities` returns the inserted row in `res.activity` — verify by opening the existing route and confirming. If not, change to `reload()` instead of the optimistic swap.)

- [ ] **Step 6: Wire Followup date picker**

```js
async function setFollowup(isoDate) {
  const prev = lead.next_followup_at;
  setLead({ ...lead, next_followup_at: isoDate });
  try {
    await apiPatch(`/api/sales/leads/${leadId}`, { next_followup_at: isoDate });
  } catch (err) {
    setLead({ ...lead, next_followup_at: prev });
    Alert.alert('Couldn't save followup', err.message);
  }
}
```

- [ ] **Step 7: Use `STATUS_LABELS` for display**

Wherever the file renders `lead.stage` or hardcoded stage labels, use `STATUS_LABELS[lead.status]`.

- [ ] **Step 8: Smoke test**

Run on Expo Go. For one of Jade's leads:
- Change stage via selector → verify in Supabase: `SELECT status FROM leads WHERE id = '<lead-id>'`
- Add a note → verify in Supabase: `SELECT * FROM lead_activities WHERE lead_id = '<lead-id>' ORDER BY created_at DESC LIMIT 1`
- Set a followup date → verify: `SELECT next_followup_at FROM leads WHERE id = '<lead-id>'`
- Mark Won → verify a commission row exists

- [ ] **Step 9: Commit**

```bash
git add src/screens/sales/LeadDetailScreen.js
git commit -m "feat(mobile): wire LeadDetailScreen mutations to live portal endpoints"
```

---

### Task 2.11: Wire PipelineScreen

**Files:**
- Modify: `src/screens/sales/PipelineScreen.js`

- [ ] **Step 1: Replace `getMockPipelineCounts()` with a fetch**

```js
import { apiGet } from '../../lib/api';
import { useFocusEffect } from '@react-navigation/native';

function usePipeline() {
  const [stages, setStages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const reload = useCallback(async () => {
    setError(null);
    try {
      const res = await apiGet('/api/sales/pipeline');
      setStages(res?.stages ?? []);
    } catch (err) {
      setError(err.message || 'Could not load pipeline');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { reload(); }, [reload]);
  useFocusEffect(useCallback(() => { reload(); }, [reload]));

  return { stages, loading, error, reload };
}
```

Replace any reference to `getMockPipelineCounts()` with `stages` from this hook. Each kanban column reads `stages[i].label, stages[i].count, stages[i].leads`.

- [ ] **Step 2: Wire card taps**

`onPress` of each lead card already navigates to LeadDetail. No change needed — same `navigation.navigate('LeadDetail', { leadId: lead.id })`.

- [ ] **Step 3: Smoke test**

Pipeline should show 7 columns with real counts. Tap a card → LeadDetailScreen loads.

- [ ] **Step 4: Commit**

```bash
git add src/screens/sales/PipelineScreen.js
git commit -m "feat(mobile): wire PipelineScreen to live /api/sales/pipeline"
```

---

### Task 2.12: Wire ActivityScreen

**Files:**
- Modify: `src/screens/sales/ActivityScreen.js`

- [ ] **Step 1: Replace `mockLeadActivities` with a fetch**

```js
import { apiGet } from '../../lib/api';
import { useFocusEffect } from '@react-navigation/native';

function useActivity() {
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const reload = useCallback(async () => {
    setError(null);
    try {
      const res = await apiGet('/api/sales/activity?since=week');
      setActivities(res?.activities ?? []);
    } catch (err) {
      setError(err.message || 'Could not load activity');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { reload(); }, [reload]);
  useFocusEffect(useCallback(() => { reload(); }, [reload]));

  return { activities, loading, error, reload };
}
```

Replace `mockLeadActivities` with `activities` from the hook. The sectioning (Today / Yesterday / This week) logic stays — it works off `created_at`.

- [ ] **Step 2: Wire row tap → LeadDetail**

Each activity row already has `lead_id`. Tap navigates to LeadDetail with the lead id.

- [ ] **Step 3: Smoke test**

ActivityScreen should show Jade's real activity for the last 7 days.

- [ ] **Step 4: Commit**

```bash
git add src/screens/sales/ActivityScreen.js
git commit -m "feat(mobile): wire ActivityScreen to live /api/sales/activity"
```

---

### Task 2.13: Wire CommissionsScreen

**Files:**
- Modify: `src/screens/sales/CommissionsScreen.js`

- [ ] **Step 1: Replace `mockCommissionsForRep` with a fetch**

```js
import { apiGet } from '../../lib/api';
import { useFocusEffect } from '@react-navigation/native';

function useCommissions() {
  const [commissions, setCommissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const reload = useCallback(async () => {
    setError(null);
    try {
      const res = await apiGet('/api/sales/commissions');
      setCommissions(res?.commissions ?? []);
    } catch (err) {
      setError(err.message || 'Could not load commissions');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { reload(); }, [reload]);
  useFocusEffect(useCallback(() => { reload(); }, [reload]));

  return { commissions, loading, error, reload };
}
```

Tab grouping (Pending / Approved / Paid) stays — filter by `commission.status`.

- [ ] **Step 2: Hero total**

`This month total = sum of total where status IN ('pending', 'approved')`. Compute client-side from the loaded array.

- [ ] **Step 3: Smoke test**

CommissionsScreen shows real commission rows. Tab switching works. Hero total matches sum.

- [ ] **Step 4: Commit**

```bash
git add src/screens/sales/CommissionsScreen.js
git commit -m "feat(mobile): wire CommissionsScreen to live /api/sales/commissions"
```

---

### Task 2.14: Build AddLeadModal

**Files:**
- Create: `src/components/sales/AddLeadModal.js`
- Modify: `src/screens/sales/LeadsScreen.js` (wire the +Add button)

- [ ] **Step 1: Create the directory + file**

```bash
mkdir -p src/components/sales
```

- [ ] **Step 2: Write the modal**

```js
// src/components/sales/AddLeadModal.js
import React, { useState } from 'react';
import { Modal, View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { colors, spacing, radius, fonts } from '../../theme';
import { apiPost, ApiError } from '../../lib/api';
import { LEAD_SOURCES } from '../../data/types';

export default function AddLeadModal({ visible, onClose, onCreated }) {
  const [businessName, setBusinessName] = useState('');
  const [contactName, setContactName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [industry, setIndustry] = useState('');
  const [suburb, setSuburb] = useState('');
  const [state, setState] = useState('');
  const [source, setSource] = useState('cold_call');
  const [submitting, setSubmitting] = useState(false);

  function reset() {
    setBusinessName(''); setContactName(''); setPhone(''); setEmail('');
    setIndustry(''); setSuburb(''); setState(''); setSource('cold_call');
  }

  async function submit() {
    if (!businessName.trim()) return Alert.alert('Missing', 'Business name is required.');
    if (!contactName.trim()) return Alert.alert('Missing', 'Contact name is required.');
    if (!phone.trim()) return Alert.alert('Missing', 'Phone is required.');

    setSubmitting(true);
    try {
      const res = await apiPost('/api/sales/leads', {
        business_name: businessName.trim(),
        contact_name: contactName.trim(),
        phone: phone.trim(),
        email: email.trim() || undefined,
        industry: industry.trim() || undefined,
        suburb: suburb.trim() || undefined,
        state: state.trim() || undefined,
        source,
      });
      if (res?.lead) {
        onCreated(res.lead);
        reset();
        onClose();
      }
    } catch (err) {
      Alert.alert('Couldn't add lead', err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose}><Text style={styles.cancel}>Cancel</Text></TouchableOpacity>
          <Text style={styles.title}>Add lead</Text>
          <TouchableOpacity onPress={submit} disabled={submitting}>
            {submitting ? <ActivityIndicator /> : <Text style={styles.save}>Save</Text>}
          </TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <Field label="Business name *"  value={businessName} onChange={setBusinessName} />
          <Field label="Contact name *"   value={contactName}  onChange={setContactName} />
          <Field label="Phone *"          value={phone}        onChange={setPhone} keyboardType="phone-pad" />
          <Field label="Email"            value={email}        onChange={setEmail}        keyboardType="email-address" autoCapitalize="none" />
          <Field label="Industry"         value={industry}     onChange={setIndustry} />
          <Field label="Suburb"           value={suburb}       onChange={setSuburb} />
          <Field label="State"            value={state}        onChange={setState} />
          <Text style={styles.label}>Source</Text>
          <View style={styles.chips}>
            {LEAD_SOURCES.map(s => (
              <TouchableOpacity key={s.id} onPress={() => setSource(s.id)}
                style={[styles.chip, source === s.id && styles.chipActive]}>
                <Text style={[styles.chipText, source === s.id && styles.chipTextActive]}>{s.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

function Field({ label, value, onChange, ...rest }) {
  return (
    <View style={{ marginBottom: spacing.md }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput value={value} onChangeText={onChange} style={styles.input}
        placeholderTextColor={colors.textMuted} {...rest} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, paddingTop: spacing.xl },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
            padding: spacing.md, borderBottomWidth: 1, borderColor: colors.border },
  title: { color: colors.text, fontFamily: fonts.semibold, fontSize: 17 },
  cancel: { color: colors.textMuted, fontFamily: fonts.medium },
  save: { color: colors.accent, fontFamily: fonts.semibold },
  body: { padding: spacing.md },
  label: { color: colors.textMuted, fontFamily: fonts.medium, fontSize: 13,
           marginBottom: spacing.xs, marginTop: spacing.sm },
  input: { backgroundColor: colors.surface, color: colors.text, padding: spacing.md,
           borderRadius: radius.sm, fontFamily: fonts.regular, fontSize: 15 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  chip: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
          backgroundColor: colors.surface, borderRadius: radius.sm },
  chipActive: { backgroundColor: colors.accent },
  chipText: { color: colors.text, fontFamily: fonts.medium },
  chipTextActive: { color: colors.bg, fontFamily: fonts.semibold },
});
```

- [ ] **Step 3: Wire LeadsScreen's "+ Add" button to open the modal**

In LeadsScreen.js, replace the existing Alert handler with:

```js
import AddLeadModal from '../../components/sales/AddLeadModal';

// inside the component:
const [addOpen, setAddOpen] = useState(false);

// Replace the existing onPress for the + Add header button:
onPress={() => setAddOpen(true)}

// And render the modal somewhere inside the screen:
<AddLeadModal
  visible={addOpen}
  onClose={() => setAddOpen(false)}
  onCreated={(newLead) => {
    reload(); // refetch the list
    navigation.navigate('LeadDetail', { leadId: newLead.id });
  }}
/>
```

- [ ] **Step 4: Smoke test**

Tap +Add. Fill business_name, contact_name, phone. Tap Save. Verify the lead appears in Supabase and the app navigates to LeadDetail.

- [ ] **Step 5: Commit**

```bash
git add src/components/sales/AddLeadModal.js src/screens/sales/LeadsScreen.js
git commit -m "feat(mobile): in-app Add Lead modal wired to POST /api/sales/leads"
```

---

### Task 2.15: Hide CommandBar in sales-rep mode

**Files:**
- Modify: `src/components/CommandBar.js` (gate render) OR per-screen import

- [ ] **Step 1: Read the existing CommandBar usage**

```bash
grep -n "CommandBar" src/screens/sales/*.js
```

Each sales screen probably imports + renders CommandBar.

- [ ] **Step 2: Add an early-return inside CommandBar**

In `src/components/CommandBar.js`, at the top of the component:

```js
import { useAuth } from '../context/AuthContext';

export default function CommandBar(props) {
  const { isSalesRep } = useAuth();
  if (isSalesRep) return null; // hidden in sales-rep mode per Phase 2 spec
  // ... existing implementation
}
```

This is cleaner than removing the JSX from every screen.

- [ ] **Step 3: Smoke test**

CommandBar should not appear on LeadsScreen, PipelineScreen, ActivityScreen, CommissionsScreen, LeadDetailScreen. Sign out and back in as a different role (if you set up a client account locally) — CommandBar should still appear there.

- [ ] **Step 4: Commit**

```bash
git add src/components/CommandBar.js
git commit -m "feat(mobile): hide CommandBar in sales-rep mode per Phase 2 spec"
```

---

### Task 2.16: Update mockData.js — keep only what's still needed

**Files:**
- Modify: `src/data/mockData.js`

- [ ] **Step 1: Delete the sales-rep mock exports**

Remove `mockSalesRep`, `mockLeads`, `mockLeadActivities`, `mockCommissionsForRep`, and `getMockPipelineCounts`. Keep the client/admin mocks (`mockUser`, `mockBusiness`, `mockAdminUser`) — they're not used at runtime anymore but are useful reference data if future client mode comes back.

Add a comment at the top:

```js
// NOTE: as of 2026-05-XX (Phase 2 sub-project 1), mobile is sales-rep-only
// and the sales rep mocks below have been REMOVED. Only client/admin mocks
// remain as reference. The sales rep data is now fetched live via /api/sales/*.
```

- [ ] **Step 2: Verify nothing imports the deleted exports**

```bash
grep -rn "mockSalesRep\|mockLeads\|mockLeadActivities\|mockCommissionsForRep\|getMockPipelineCounts" src/
```

Expected: zero matches. If any remain, fix those imports (probably leftover from a missed screen).

- [ ] **Step 3: Commit**

```bash
git add src/data/mockData.js
git commit -m "chore(mobile): remove sales rep mock exports — now fetched live"
```

---

### Task 2.17: Update DECISIONS-sales-rep.md + README

**Files:**
- Modify: `DECISIONS-sales-rep.md`
- Modify: `README.md`

- [ ] **Step 1: Append a Phase 2 section to DECISIONS-sales-rep.md**

```md
## Phase 2 sub-project 1 — Live API (2026-05-XX)

Mock data swapped for live calls to talkmate-portal `/api/sales/*` endpoints.
AuthContext now uses `@supabase/supabase-js` with AsyncStorage session persistence.
Fetch layer at `src/lib/api.js` adds 3× retry with backoff and surfaces ApiError.
Stage selector uses canonical `LEAD_STATUSES` from `src/data/types.js` (portal-aligned: dropped `qualified`, added `demo_done` and `nurture`).
Followup picker writes `leads.next_followup_at` via PATCH (no push reminder yet — sub-project 2).
CommandBar hidden in sales-rep mode (re-introduced as its own sub-project).
Add Lead modal wired to POST /api/sales/leads.
Reassignment edge case: 404 on a mutation → Alert "This lead is no longer assigned to you" → goBack.

Mobile is now sales-rep-only. Admin/client screen files survive as dead code for a possible future client mobile build.
```

- [ ] **Step 2: Write a short README**

```bash
cat > README.md <<'EOF'
# talkmate-mobile

TalkMate's React Native (Expo SDK 54) mobile app. Currently sales-rep-only — companion to the [talkmate-portal](https://github.com/irfanhanif89-art/talkmate-portal) web app.

## Quick start

```bash
npm install
cp .env.example .env.local   # fill in real values
npx expo start --tunnel       # tunnel mode avoids Windows firewall issues
```

Scan the QR with Expo Go (iOS / Android) to run on a real phone.

## Environment vars

| Var | Purpose |
|-----|---------|
| `EXPO_PUBLIC_API_URL`           | Portal base URL (e.g. https://app.talkmate.com.au) |
| `EXPO_PUBLIC_SUPABASE_URL`      | Supabase project URL |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key |

EAS builds resolve these from the EAS env config per channel (production / preview).

## Build for TestFlight / Play internal

```bash
npx eas-cli build -p ios --profile production
npx eas-cli submit -p ios --profile production
```

## Spec

See `docs/specs/2026-05-28-mobile-sales-rep-phase2-live-api-design.md` in the portal repo.
EOF
```

- [ ] **Step 3: Commit**

```bash
git add DECISIONS-sales-rep.md README.md
git commit -m "docs(mobile): record Phase 2 sub-project 1 decisions + README"
```

---

### Task 2.18: Push mobile branch + open PR

- [ ] **Step 1: Push the branch**

```bash
git push -u origin feature/phase2-live-api
```

- [ ] **Step 2: Open the PR**

```bash
gh pr create --base main --title "Phase 2 sub-project 1 — Live API integration" --body "$(cat <<'EOF'
## Summary
- AuthContext rewritten to use Supabase SDK + AsyncStorage
- Five screens (Leads/LeadDetail/Pipeline/Activity/Commissions) wired to live /api/sales/* endpoints
- AddLeadModal built
- CommandBar hidden in sales-rep mode
- Stage values aligned to portal (status field; dropped `qualified`, added `demo_done` + `nurture`)
- Reassignment 404 edge case handled

## Test plan
- [ ] Sign in as Jade on Expo Go → LeadsScreen loads real prod leads
- [ ] Change stage on a lead → verify in Supabase
- [ ] Mark Won → commission row created
- [ ] Add note → activity row created
- [ ] Set followup date → leads.next_followup_at populated
- [ ] Add Lead modal → new lead in Supabase
- [ ] Sign out → returns to login

Depends on portal PR (Stage 1) being merged to main.
EOF
)"
```

- [ ] **Step 3: Smoke + manual QA**

Run `npx expo start --tunnel` and walk through the full sales flow on Jade's phone (or a test phone). Confirm everything in the test plan above.

- [ ] **Step 4: Merge to main**

```bash
gh pr merge --merge --delete-branch
```

Mobile is now ready for EAS build in Stage 3.

---

## Stage 3: Distribution

### Task 3.0: Prerequisite check — confirm accounts exist

**Hard blocker until Irfan has these.**

- [ ] **Step 1: Confirm Apple Developer Program enrollment**

Visit developer.apple.com/account. Confirm membership status is "Active" and the Apple ID matches the one you'll use for TalkMate. Note the Team ID (10-character alphanumeric).

- [ ] **Step 2: Confirm Google Play Console enrollment**

Visit play.google.com/console. Confirm the developer account exists. Note the account name + email.

- [ ] **Step 3: Create Expo account**

Visit expo.dev. Sign up (free). Save credentials to your password manager. Note the username — needed for `eas login`.

- [ ] **Step 4: Install eas-cli**

```bash
npm install -g eas-cli
eas login
```

- [ ] **Step 5: Link the project to EAS**

```bash
cd talkmate-mobile
eas init
```

This creates `eas.json` (replace contents in next task) and prompts for an EAS project ID. Pick the suggested default.

---

### Task 3.1: Write `eas.json`

**Files:**
- Modify: `eas.json` (replace whatever `eas init` generated)

- [ ] **Step 1: Write the file**

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
    },
    "development": {
      "channel": "development",
      "developmentClient": true,
      "distribution": "internal"
    }
  },
  "submit": {
    "production": {
      "ios": {
        "appleId": "<YOUR APPLE ID EMAIL>",
        "ascAppId": "REPLACE_AFTER_FIRST_SUBMIT",
        "appleTeamId": "<YOUR 10-CHAR TEAM ID>"
      },
      "android": {
        "serviceAccountKeyPath": "./play-service-account.json",
        "track": "internal"
      }
    }
  }
}
```

Fill in the placeholders with your real Apple ID, Team ID, and (after first submit) the App Store Connect app ID.

- [ ] **Step 2: Commit**

```bash
git add eas.json
git commit -m "chore(eas): EAS Build profiles for production / preview / development"
```

---

### Task 3.2: Set EAS env vars

- [ ] **Step 1: Production channel env vars**

```bash
eas env:create --environment production --name EXPO_PUBLIC_API_URL --value https://app.talkmate.com.au --visibility plaintext
eas env:create --environment production --name EXPO_PUBLIC_SUPABASE_URL --value https://mdsfdaefsxwrakgkyflr.supabase.co --visibility plaintext
eas env:create --environment production --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value "<paste prod anon key>" --visibility secret
```

- [ ] **Step 2: Preview channel env vars** (optional — skip if going Expo-Go-only for preview)

```bash
eas env:create --environment preview --name EXPO_PUBLIC_API_URL --value "<latest dev branch vercel preview url>" --visibility plaintext
eas env:create --environment preview --name EXPO_PUBLIC_SUPABASE_URL --value https://rgifivtzmjvanzqwgadq.supabase.co --visibility plaintext
eas env:create --environment preview --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value "<paste preview anon key>" --visibility secret
```

- [ ] **Step 3: Verify**

```bash
eas env:list --environment production
```

Expected: three rows.

---

### Task 3.3: Asset audit

- [ ] **Step 1: Verify icon dimensions**

```bash
ls -la assets/icon.png
# Should be 1024×1024 PNG, no transparency, no rounded corners (iOS applies its own)
```

If the existing icon is the wrong size, regenerate using any tool that produces a 1024×1024 PNG. The current `assets/icon.png` should already be correct from Phase 1.

- [ ] **Step 2: Configure expo-splash-screen**

```bash
npx expo install expo-splash-screen
```

Add to `app.config.js` plugins array:

```js
['expo-splash-screen', {
  image: './assets/icon.png',
  backgroundColor: '#061322',
  imageWidth: 200,
}],
```

- [ ] **Step 3: Commit**

```bash
git add app.config.js package.json
git commit -m "chore(mobile): configure splash screen"
```

---

### Task 3.4: First iOS production build

- [ ] **Step 1: Build**

```bash
eas build -p ios --profile production
```

This will:
1. Prompt for Apple ID + password (one-time login).
2. Generate provisioning profiles + signing cert automatically (default).
3. Upload + build on EAS servers. Takes ~20 minutes.

- [ ] **Step 2: Wait for the build to finish**

You get an email when it does. Or:

```bash
eas build:list -p ios --limit 1
```

- [ ] **Step 3: If build fails, diagnose**

Common failures:
- Missing `expo-splash-screen` config → fix in app.config.js, rebuild
- Bundle ID conflict → ensure `com.talkmate.mobile` is unique in your Apple Developer team
- Provisioning profile issue → re-run with `--clear-cache`

---

### Task 3.5: Submit to TestFlight

- [ ] **Step 1: Submit**

```bash
eas submit -p ios --profile production --latest
```

This uploads the .ipa to App Store Connect. The first submission creates the App Store Connect app record.

- [ ] **Step 2: Fill in App Store Connect metadata**

Visit appstoreconnect.apple.com → My Apps → TalkMate. Fill in:
- App description (~250 words — see spec section 6 for template)
- Privacy policy URL: `https://app.talkmate.com.au/privacy` (verify this exists; create a stub if not)
- Support URL: `https://talkmate.com.au/support` or `mailto:hello@talkmate.com.au`
- Category: Business
- Age rating: 4+
- Pricing: Free (internal tool)
- TestFlight test info: "Internal sales rep tool. Test login: <Jade's email>"

- [ ] **Step 3: Submit for TestFlight review**

In App Store Connect → TestFlight, submit the build for beta review. Apple's first review can take 24-48 hours.

- [ ] **Step 4: After TestFlight review approves, invite Jade**

In App Store Connect → TestFlight → Internal Testing → add Jade's Apple ID email.

- [ ] **Step 5: Jade installs TestFlight on her phone, accepts the invite, installs the app**

She gets an email. App appears on her home screen. Verify she can sign in with her real prod credentials.

---

### Task 3.6: First Android build + Play internal track (in parallel with iOS)

- [ ] **Step 1: Create Play Console app**

Visit play.google.com/console → Create app. Fill in:
- App name: TalkMate Sales Rep
- Default language: English (Australia)
- App type: App
- Category: Business

- [ ] **Step 2: Create a service account for submission**

In Google Cloud Console (linked to the same Google account):
- Create a new service account
- Grant it the "Service Account User" role
- Download the JSON key as `play-service-account.json` and put it in the `talkmate-mobile` directory root
- Add `play-service-account.json` to `.gitignore` (NEVER commit this)
- In Play Console → Setup → API access, link the service account and grant "Release manager" permission

- [ ] **Step 3: Build**

```bash
eas build -p android --profile production
```

~20 minutes.

- [ ] **Step 4: Submit to internal track**

```bash
eas submit -p android --profile production --latest
```

Internal track propagates in ~30 minutes. No review wait.

- [ ] **Step 5: Add Jade to the internal testers list**

Play Console → Testing → Internal testing → manage testers → add Jade's Google account email.

---

## Stage 4: End-to-end audit

**Pre-authorized by Irfan 2026-05-28: bugs found are fixed inline without additional approval.**

### Task 4.1: Install + sign in

**Files:** none — pure verification

- [ ] **Step 1: Install TestFlight build on a real iPhone (Jade's or yours)**

- [ ] **Step 2: Sign in with Jade's real prod credentials**

Expected: lands on LeadsScreen with Jade's real leads visible.

Fail mode → if it 401s, check JWT is being sent correctly. If LeadsScreen is empty but Jade has assigned leads in prod, check the GET endpoint filter.

- [ ] **Step 3: Sign out**

Expected: returns to login screen. Re-signing in succeeds.

- [ ] **Step 4: Force-quit + reopen**

Expected: still signed in (session persisted in AsyncStorage).

---

### Task 4.2: Leads tab audit

For each item, run the check. If it fails, fix inline and re-test.

- [ ] **Step 1: LeadsScreen lead count matches Supabase**

In Supabase SQL editor:
```sql
SELECT count(*) FROM leads
WHERE assigned_to = (SELECT id FROM sales_reps WHERE email = 'jade@talkmate.com.au')
AND status != 'bad_lead'
AND status NOT IN ('won', 'lost'); -- mobile filters these out by default
```

Compare to count shown on mobile LeadsScreen.

- [ ] **Step 2: All five filter chips work**

- [ ] **Step 3: Search by business name + contact name + phone works**

- [ ] **Step 4: Pull-to-refresh re-fetches** (use airplane mode briefly to confirm it actually round-trips)

- [ ] **Step 5: Background → foreground re-fetches**

- [ ] **Step 6: Tap-to-call opens device dialer**

- [ ] **Step 7: Tap-to-SMS opens composer with prefill text**

---

### Task 4.3: LeadDetail audit

- [ ] **Step 1: Tap a lead → LeadDetailScreen renders with real data**

- [ ] **Step 2: Stage selector reflects current status**

- [ ] **Step 3: Tap a new stage → optimistic UI → verify in Supabase**

```sql
SELECT status FROM leads WHERE id = '<lead-id>';
```

- [ ] **Step 4: Mark Won modal → submit → commission row exists**

```sql
SELECT * FROM commissions
WHERE lead_id = '<lead-id>' ORDER BY created_at DESC LIMIT 1;
```

- [ ] **Step 5: Mark Lost modal → submit → leads.status = 'lost' + lost_reason set**

- [ ] **Step 6: Add Note → POST lands → activity row exists**

```sql
SELECT * FROM lead_activities WHERE lead_id = '<lead-id>'
ORDER BY created_at DESC LIMIT 3;
```

- [ ] **Step 7: Followup picker → leads.next_followup_at populated**

```sql
SELECT next_followup_at FROM leads WHERE id = '<lead-id>';
```

---

### Task 4.4: Pipeline / Activity / Commissions audit

- [ ] **Step 1: PipelineScreen shows 7 columns with correct counts**

Verify each count against `SELECT status, count(*) FROM leads WHERE assigned_to = '<jade-id>' GROUP BY status`.

- [ ] **Step 2: Tap a kanban card → LeadDetail**

- [ ] **Step 3: Activity tab shows today/yesterday/this-week sections**

- [ ] **Step 4: Activity row taps → corresponding LeadDetail**

- [ ] **Step 5: Commissions tab shows Pending/Approved/Paid groupings**

- [ ] **Step 6: Hero total matches `SUM(total_amount) FROM commissions WHERE sales_rep_id = '<jade-id>' AND status IN ('pending', 'approved')`**

---

### Task 4.5: Add Lead audit

- [ ] **Step 1: Required field validation fires on missing business_name / contact_name / phone**

- [ ] **Step 2: Source dropdown shows all 5 options**

- [ ] **Step 3: Submit → lead appears in Jade's list + in Supabase**

```sql
SELECT * FROM leads
WHERE assigned_to = '<jade-id>' AND business_name = '<the test name>';
```

---

### Task 4.6: Security audit

- [ ] **Step 1: Pick a lead assigned to a different rep (admin reassigns or insert one)**

```sql
SELECT id FROM leads WHERE assigned_to <> '<jade-id>' LIMIT 1;
```

Confirm mobile LeadsScreen does NOT show this lead.

- [ ] **Step 2: Reassign one of Jade's leads to a different rep**

```sql
UPDATE leads SET assigned_to = '<some-other-rep-id>' WHERE id = '<lead-id>';
```

On Jade's mobile, pull to refresh — confirm the lead disappears.

- [ ] **Step 3: Mid-mutation reassignment 404**

Open the (now reassigned) lead in LeadDetail on Jade's mobile (it's still in her local state from before reassignment). Tap to change stage → should 404 → toast "This lead is no longer assigned to you" → bounces back to LeadsScreen.

- [ ] **Step 4: Reset the lead back to Jade**

```sql
UPDATE leads SET assigned_to = '<jade-id>' WHERE id = '<lead-id>';
```

---

### Task 4.7: Network resilience audit

- [ ] **Step 1: Airplane mode mid-mutation**

Open LeadDetail. Turn on airplane mode. Tap "Change stage to Demo Booked". Expected: optimistic UI shows change, but server doesn't get it. After ~5 seconds (3 retries × ~1s each), Alert "Couldn't change stage: …" appears.

- [ ] **Step 2: Retry success after re-enabling network**

Turn off airplane mode. Pull to refresh. Lead should still be in its OLD state (because the change was reverted on retry exhaustion). Tap the new stage again — succeeds.

- [ ] **Step 3: 500 from server**

Temporarily break the PATCH endpoint (insert `throw new Error('test')` at the top of the handler, redeploy to preview). Verify retries kick in. Restore the endpoint.

- [ ] **Step 4: 401 expired token**

Sign in. Wait for the JWT to expire (or manually expire the session by signing out from another device with the same account). Try to do any action. Expected: auth state changes, app prompts re-login.

---

### Task 4.8: Distribution + sundries

- [ ] **Step 1: TestFlight install succeeds on Jade's iPhone**

- [ ] **Step 2: App icon shows the orange TalkMate icon on home screen**

- [ ] **Step 3: Splash screen shows during launch**

- [ ] **Step 4: Background → foreground triggers data refresh** (already tested in 4.2)

- [ ] **Step 5: Android internal track install succeeds** (if Jade or any test rep has Android)

---

### Task 4.9: Final report + system map + memory

- [ ] **Step 1: Update talkmate-portal SYSTEM_MAP.md**

Append a row to Session Log for this work + update header dates.

- [ ] **Step 2: Update talkmate-portal MEMORY.md**

Add a new memory file `talkmate-mobile-phase2-shipped.md` summarising:
- Phase 2 sub-project 1 shipped on YYYY-MM-DD
- Mobile app distributed via TestFlight (iOS) and Play internal (Android)
- All 5 sales tabs now live against prod portal
- Bug-fixes made during the audit (list them)
- What's deferred to next sub-projects (push notifications, voice recording, drag-drop, offline queue, deep links)

- [ ] **Step 3: Commit and push both repos**

```bash
# In talkmate-portal
git checkout main
git add SYSTEM_MAP.md MEMORY.md ~/.claude/projects/.../memory/MEMORY.md ~/.claude/projects/.../memory/talkmate-mobile-phase2-shipped.md
git commit -m "docs: record Phase 2 sub-project 1 shipped"
git push origin main
```

- [ ] **Step 4: Final Telegram alert + report to Irfan in chat**

Report:
- What shipped
- How many bugs were found + fixed during audit
- Anything that needs his attention (e.g. App Store metadata gaps, Jade's TestFlight invitation acceptance)
- Confirmation that all 4 stages are GREEN

---

## Self-review checklist

(Run this after writing the plan — already executed during plan composition.)

**Spec coverage:**
- [x] Migration 058 — Task 1.1
- [x] Bearer auth extension — Task 1.2
- [x] All 5 GET endpoints — Tasks 1.3-1.7
- [x] PATCH next_followup_at — Task 1.8
- [x] Mobile auth + Supabase SDK — Tasks 2.3, 2.6
- [x] Five screens wired — Tasks 2.9-2.13
- [x] Add Lead modal — Task 2.14
- [x] CommandBar hide — Task 2.15
- [x] Stage list reconciliation — Task 2.5 + Task 2.9 step 4
- [x] Reassignment 404 handling — Task 2.10 steps 2-5
- [x] EAS Build profiles — Tasks 3.1-3.4
- [x] TestFlight + Play internal — Tasks 3.5-3.6
- [x] End-to-end audit (all checklist items from spec section 7) — Tasks 4.1-4.9

**Placeholder scan:**
- The plan references "<paste prod anon key>" in env-var values — these are intentional fill-ins at apply time, not vague requirements
- Apple Team ID + App Store Connect ID placeholders in eas.json are filled after first build/submit — intentional
- Session number placeholder in SYSTEM_MAP entry — filled at write time based on actual count

**Type consistency:**
- `LEAD_STATUSES` defined in Task 2.5 used in Tasks 2.9, 2.10
- `apiGet / apiPost / apiPatch` defined in Task 2.4 used in 2.6, 2.9-2.14
- `requireSalesRep(req)` signature defined in Task 1.2 used in Tasks 1.3-1.8
- `useFocusEffect` consistently imported from `@react-navigation/native` in 2.9, 2.11, 2.12, 2.13
- Lead response shape consistent across all tasks (id, business_name, contact_name, phone, email, status, etc.)

No issues found. Plan is internally consistent.
