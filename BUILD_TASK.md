# Talkmate Portal — Build Task for Claude Code

Build the COMPLETE Talkmate Client Portal. No stubs. No placeholders.

## Brand
- Font: Outfit (300/400/600/700/800)
- Primary bg: #061322, Secondary bg: #0A1E38
- Brand orange (CTA): #E8622A hover #C04A0F
- Accent blue: #1565C0, Accent blue light: #4A9FE8
- Muted: #4A7FBB, Light bg: #F2F6FB
- Logo: orange rounded square + white T + "talk" (Outfit 800 -2px) + "mate" (Outfit 300 +4px #4A9FE8)

## Tech Stack
Next.js 14 App Router, Tailwind + shadcn/ui, Supabase (auth+db+realtime+RLS), TanStack Query, Zustand, Recharts, Stripe, Resend, Vapi

## Step 1 — Scaffold
```
npx create-next-app@latest . --typescript --tailwind --app --src-dir --import-alias "@/*" --yes
npx shadcn@latest init -y -d
npm install @supabase/supabase-js @supabase/ssr @tanstack/react-query zustand recharts stripe @stripe/stripe-js resend react-email @react-email/components lucide-react date-fns clsx tailwind-merge @dnd-kit/core @dnd-kit/sortable
```

## Step 2 — /src/lib/business-types.ts
Single source of truth. NEVER hardcode "menu" or "order" in UI — always reference this config.

```typescript
export type BusinessType = 'hospitality' | 'trades' | 'medical' | 'beauty' | 'fitness' | 'real_estate' | 'automotive' | 'professional' | 'retail' | 'other'

export interface BusinessTypeConfig {
  catalogLabel: string
  catalogItemLabel: string
  catalogCategories: string[]
  hasUpsells: boolean
  hasPricing: boolean
  hasAppointments: boolean
  hasJobDispatch: boolean
  callOutcomeTypes: string[]
  primaryMetric: string
  dashboardMetricLabel: string
  escalationTemplate: string
  complianceRule?: string
}

export const BUSINESS_TYPE_CONFIG: Record<BusinessType, BusinessTypeConfig> = {
  hospitality: { catalogLabel: 'Menu', catalogItemLabel: 'Menu Item', catalogCategories: ['Mains','Sides','Drinks','Desserts','Specials'], hasUpsells: true, hasPricing: true, hasAppointments: false, hasJobDispatch: false, callOutcomeTypes: ['Order Taken','Reservation Made','FAQ Answered','Transferred','Missed'], primaryMetric: 'Revenue Recovered', dashboardMetricLabel: 'Orders Taken Today', escalationTemplate: 'If caller has a complaint → Transfer immediately' },
  trades: { catalogLabel: 'Services', catalogItemLabel: 'Service', catalogCategories: ['Emergency','Scheduled','Quotes','Maintenance'], hasUpsells: false, hasPricing: true, hasAppointments: true, hasJobDispatch: true, callOutcomeTypes: ['Job Booked','Quote Requested','FAQ Answered','Transferred','Missed'], primaryMetric: 'Jobs Booked', dashboardMetricLabel: 'Jobs Booked Today', escalationTemplate: 'If caller mentions burst pipe, flooding, no power → Transfer immediately' },
  medical: { catalogLabel: 'Services', catalogItemLabel: 'Appointment Type', catalogCategories: ['GP','Specialist','Procedure','Telehealth'], hasUpsells: false, hasPricing: false, hasAppointments: true, hasJobDispatch: false, callOutcomeTypes: ['Appointment Booked','Rx Enquiry','FAQ Answered','Transferred','Urgent'], primaryMetric: 'Appointments Booked', dashboardMetricLabel: 'Appointments Booked Today', escalationTemplate: 'If caller describes chest pain or emergency → Transfer immediately', complianceRule: 'Never provide medical advice. Always recommend the patient speak with a doctor.' },
  beauty: { catalogLabel: 'Services', catalogItemLabel: 'Service', catalogCategories: ['Hair','Nails','Skin','Beauty','Packages'], hasUpsells: true, hasPricing: true, hasAppointments: true, hasJobDispatch: false, callOutcomeTypes: ['Appointment Booked','FAQ Answered','Transferred','Missed'], primaryMetric: 'Appointments Booked', dashboardMetricLabel: 'Bookings Today', escalationTemplate: 'If caller wants to speak with a stylist → Transfer immediately' },
  fitness: { catalogLabel: 'Programs', catalogItemLabel: 'Program / Class', catalogCategories: ['Classes','Personal Training','Memberships','Packages'], hasUpsells: true, hasPricing: true, hasAppointments: true, hasJobDispatch: false, callOutcomeTypes: ['Trial Booked','Membership Enquiry','Class Booked','FAQ Answered','Transferred','Missed'], primaryMetric: 'Trials Booked', dashboardMetricLabel: 'Trials & Bookings Today', escalationTemplate: 'If caller has a medical condition or injury → Transfer immediately' },
  real_estate: { catalogLabel: 'Listings', catalogItemLabel: 'Property / Service', catalogCategories: ['For Sale','For Rent','Property Management','Appraisals'], hasUpsells: false, hasPricing: false, hasAppointments: true, hasJobDispatch: false, callOutcomeTypes: ['Inspection Booked','Appraisal Booked','Enquiry Logged','FAQ Answered','Transferred','Missed'], primaryMetric: 'Inspections Booked', dashboardMetricLabel: 'Inspections & Appraisals Today', escalationTemplate: 'If caller wants to make an offer → Transfer immediately' },
  automotive: { catalogLabel: 'Services', catalogItemLabel: 'Service', catalogCategories: ['Repairs','Towing','Servicing','Quotes','Emergency'], hasUpsells: false, hasPricing: true, hasAppointments: true, hasJobDispatch: true, callOutcomeTypes: ['Job Dispatched','Booking Made','Quote Requested','FAQ Answered','Transferred','Missed'], primaryMetric: 'Jobs Dispatched', dashboardMetricLabel: 'Jobs Dispatched Today', escalationTemplate: 'If caller is stranded or in danger → Transfer immediately' },
  professional: { catalogLabel: 'Services', catalogItemLabel: 'Service', catalogCategories: ['Consultations','Fixed Fee','Retainer','Packages'], hasUpsells: false, hasPricing: false, hasAppointments: true, hasJobDispatch: false, callOutcomeTypes: ['Consultation Booked','Enquiry Logged','FAQ Answered','Transferred','Missed'], primaryMetric: 'Consultations Booked', dashboardMetricLabel: 'Consultations Booked Today', escalationTemplate: 'If caller has an urgent legal or financial matter → Transfer immediately' },
  retail: { catalogLabel: 'Products', catalogItemLabel: 'Product', catalogCategories: ['Products','Bundles','Services','Specials'], hasUpsells: true, hasPricing: true, hasAppointments: false, hasJobDispatch: false, callOutcomeTypes: ['Order Taken','Stock Enquiry','FAQ Answered','Transferred','Missed'], primaryMetric: 'Revenue Recovered', dashboardMetricLabel: 'Orders Taken Today', escalationTemplate: 'If caller has a complaint or return request → Transfer immediately' },
  other: { catalogLabel: 'Services', catalogItemLabel: 'Service', catalogCategories: ['Services','Packages','Other'], hasUpsells: false, hasPricing: true, hasAppointments: true, hasJobDispatch: false, callOutcomeTypes: ['Enquiry Logged','Booking Made','FAQ Answered','Transferred','Missed'], primaryMetric: 'Enquiries Captured', dashboardMetricLabel: 'Enquiries Today', escalationTemplate: 'If caller needs urgent assistance → Transfer immediately' },
}
```

## Step 3 — /supabase/migrations/001_initial.sql
Enable UUID extension. Create all tables with RLS:
- businesses (id uuid PK default gen_random_uuid(), name text NOT NULL, phone_number text, address text, business_type text NOT NULL, plan text DEFAULT 'starter', vapi_agent_id text, owner_user_id uuid REFERENCES auth.users NOT NULL, abn text, website text, timezone text DEFAULT 'Australia/Brisbane', onboarding_completed boolean DEFAULT false, created_at timestamptz DEFAULT now())
- calls (id uuid PK default gen_random_uuid(), business_id uuid REFERENCES businesses NOT NULL, started_at timestamptz, ended_at timestamptz, duration_seconds int, transcript text, recording_url text, outcome text, transferred boolean DEFAULT false, caller_number text, created_at timestamptz DEFAULT now())
- catalog_items (id uuid PK default gen_random_uuid(), business_id uuid REFERENCES businesses NOT NULL, name text NOT NULL, description text, price numeric, category text, active boolean DEFAULT true, upsell_prompt text, duration_minutes int, is_featured boolean DEFAULT false, sort_order int DEFAULT 0, created_at timestamptz DEFAULT now())
- appointments (id uuid PK default gen_random_uuid(), business_id uuid REFERENCES businesses NOT NULL, call_id uuid REFERENCES calls, customer_name text, customer_phone text, service_type text, scheduled_at timestamptz, status text DEFAULT 'enquired', notes text, is_new_customer boolean, created_at timestamptz DEFAULT now())
- orders (id uuid PK default gen_random_uuid(), business_id uuid REFERENCES businesses NOT NULL, call_id uuid REFERENCES calls, items jsonb, total_amount numeric, status text DEFAULT 'received', created_at timestamptz DEFAULT now())
- jobs (id uuid PK default gen_random_uuid(), business_id uuid REFERENCES businesses NOT NULL, call_id uuid REFERENCES calls, customer_name text, customer_phone text, job_type text, address text, urgency text, status text DEFAULT 'new', notes text, created_at timestamptz DEFAULT now())
- users (id uuid PK REFERENCES auth.users NOT NULL, business_id uuid REFERENCES businesses, email text, role text DEFAULT 'owner', created_at timestamptz DEFAULT now())
- subscriptions (id uuid PK default gen_random_uuid(), business_id uuid REFERENCES businesses NOT NULL, stripe_subscription_id text UNIQUE, stripe_customer_id text, plan text, status text, current_period_end timestamptz)
- notifications (id uuid PK default gen_random_uuid(), business_id uuid REFERENCES businesses NOT NULL, type text, message text, read boolean DEFAULT false, created_at timestamptz DEFAULT now())
- onboarding_responses (id uuid PK default gen_random_uuid(), business_id uuid REFERENCES businesses NOT NULL UNIQUE, current_step int DEFAULT 1, responses jsonb DEFAULT '{}', completed_at timestamptz)

RLS policies: each table gets SELECT/INSERT/UPDATE/DELETE where auth.uid() matches owner_user_id (via businesses join for child tables).

## Step 4 — Supabase client /src/lib/supabase/
- client.ts: createBrowserClient
- server.ts: createServerClient with cookie handling
- middleware.ts: session refresh

## Step 5 — All Pages (build completely, no stubs)

### Layout /src/app/(portal)/layout.tsx
Left sidebar with:
- Logo (orange T tile + "talkmate" wordmark)
- Nav links with icons (lucide-react): Dashboard, Phone (Calls), config.catalogLabel, Calendar (Appointments/Jobs — conditional), BarChart2 (Analytics), Settings, CreditCard (Billing), Shield (Admin — role=admin only)
- Bottom: avatar circle with initials, business name, Logout button
- Mobile: bottom tab bar (icons only, 5 max)
- Read business from Supabase, provide BusinessTypeContext via React Context

### /src/app/(portal)/dashboard/page.tsx
- 4 stat cards: calls_today count, config.dashboardMetricLabel count, answer_rate %, transferred_today count
- Line chart: call volume last 30 days grouped by day
- Live feed: Supabase Realtime channel on calls table, shows last 5 calls in real time
- Onboarding banner: if business.onboarding_completed = false, show progress bar → /onboarding

### /src/app/(portal)/calls/page.tsx
- Server-side paginated table (20/page)
- Columns: Time, Duration, Caller, Outcome (badge), Transferred
- Side sheet on row click: full transcript, recording audio player, extracted data, Flag button
- Filters: date range (shadcn DateRangePicker), outcome select, transferred toggle
- Export CSV button (client-side, uses current filter state)

### /src/app/(portal)/catalog/page.tsx
- Header: config.catalogLabel + "Add {config.catalogItemLabel}" button
- Grid of catalog item cards with drag-to-reorder (@dnd-kit)
- Each card: name, category badge, price (if hasPricing), active toggle, featured star, edit/delete
- Add/Edit sheet form: name, description, category (select from config.catalogCategories), price (if hasPricing), duration (if hasAppointments), upsell_prompt (if hasUpsells), is_featured toggle, active toggle
- "Save & Sync to AI" button: PATCH /api/vapi/sync — updates Vapi agent system prompt with catalog

### /src/app/(portal)/appointments/page.tsx
- Guard: redirect if !hasAppointments && !hasJobDispatch
- For appointments (hasAppointments): Kanban with columns Enquired/Confirmed/Completed/Cancelled
- For jobs (hasJobDispatch): Kanban with columns New/Assigned/In Progress/Completed/Cancelled
- If both: show separate tabs
- Cards: customer name, phone, service/job type, time, urgency badge (trades/auto), new-patient badge (medical)
- Edit sheet: status dropdown, notes textarea, reschedule datetime, SMS reminder button

### /src/app/(portal)/analytics/page.tsx
- Date range selector tabs: 7D / 30D / 90D / Custom
- KPI row: total calls, primary outcome count, answer rate, avg duration
- Line chart: call volume by day
- Bar chart: outcomes breakdown (labels from config.callOutcomeTypes)
- Heatmap: 7 rows (days) × 24 cols (hours) — colour intensity = call count
- Pie chart: outcome distribution
- Table: top 10 callers by frequency

### /src/app/(portal)/settings/page.tsx
Tabs component with 5 tabs:

Tab 1 Business Info:
- Form: name, ABN, address, website, phone, timezone (select AU timezones), business type (with warning modal on change)
- Opening hours: 7 rows (Mon-Sun), each with open/close time pickers and open/closed toggle
- Save button → PATCH businesses row

Tab 2 AI Voice:
- Greeting textarea (500 char limit with counter)
- Voice selector: dropdown with ElevenLabs voices (fetch from ElevenLabs API GET /voices) + Preview button (POST /api/elevenlabs/preview)
- Tone: radio buttons Professional / Friendly / Casual
- FAQs: repeatable list of {question, answer} pairs, Add/Remove
- Escalation rules: repeatable list of {trigger, action}, pre-filled from config.escalationTemplate
- Medical: locked compliance card (cannot delete) — "Never provide medical advice"
- Save & Sync button

Tab 3 Notifications:
- Toggles + email/phone fields: email on transfer, daily summary, weekly report, SMS on transfer, alert at 80% limit
- Save → update businesses row (notifications_config jsonb column — add to schema)

Tab 4 Integrations:
- Vapi: status pill + agent ID display
- Make.com: webhook URL input + test button
- Stripe: status + "Manage Billing" button
- Booking page URL (if hasAppointments)
- API key: masked display + copy button + regenerate
- Add api_key column to businesses table

Tab 5 Team:
- Table: email, role badge, last login, Remove button (with confirm dialog)
- Invite form: email input + role select (owner/staff) → sends invite email via Resend

### /src/app/(portal)/billing/page.tsx
- Plan card: current plan name, calls included, calls used (progress bar), renewal date
- Plan comparison: Starter $299/mo (300 calls), Growth $499/mo (800 calls), Enterprise (custom)
- Each plan: feature bullets + CTA (upgrade/current/contact)
- Stripe Customer Portal button → POST /api/stripe/portal → redirect
- Invoice history: table from Stripe API (date, amount, status, PDF link)
- Cancel subscription: button → modal with reason selector. If "too expensive" → show 20% discount offer. If "not using it" → show actual call count

### /src/app/(portal)/onboarding/page.tsx
8-step wizard. Zustand store for step/responses. Save to onboarding_responses on each Next click.

Step 1: Business details form
Step 2: Opening hours (7-day grid)
Step 3: Catalog — pre-populated templates per business type (e.g. for medical: "GP Consultation - 15min", "Telehealth - 20min"; for trades: "Emergency Callout", "Scheduled Service", "Free Quote")
Step 4: Greeting + voice selector + live preview button
Step 5: FAQs — 5 pre-filled type-specific questions, all editable
Step 6: Escalation rules — pre-filled from config, editable
Step 7: Notification preferences
Step 8: "You're live!" — button triggers: POST /api/onboarding/complete which: creates Vapi agent via Vapi API, sends welcome email via Resend, sets businesses.onboarding_completed = true

Progress bar at top. Back button on all steps except 1.

### /src/app/(portal)/admin/page.tsx
Role guard at top (redirect if users.role != 'admin').
- Stats row: total clients, MRR, new this month, churn this month
- Businesses table: name, type badge, plan badge, calls/month, MRR contribution, last_active, Impersonate button
- Impersonate: sets a session cookie, reloads portal as that business
- System health: fetch Vapi /health, Supabase ping, Stripe /health → green/red pills
- Bulk email: textarea + send button → Resend batch
- Export all data: CSV download button

### /src/app/(auth)/login/page.tsx
Full-page dark layout matching brand. Email + password form. "Send magic link" tab. Supabase signInWithPassword / signInWithOtp. Error handling. "Don't have an account? Sign up" link.

### /src/app/(auth)/register/page.tsx
Business signup: first name, email, password, business name, business type selector (with icons/descriptions for each type). Creates: auth user, businesses row, users row. Redirect to /onboarding.

## Step 6 — API Routes

### POST /src/app/api/webhooks/vapi/route.ts
Validate HMAC signature from VAPI_WEBHOOK_SECRET.
Handle call.started → insert calls row with started_at.
Handle call.ended → update calls row (ended_at, duration, transcript, recording_url, outcome, transferred), then based on business_type: if hasJobDispatch → insert jobs row; if hasAppointments → insert appointments row; if retail/hospitality → insert orders row. Then POST to MAKE_WEBHOOK_URL.
Handle call.transferred → update calls.transferred = true, insert notifications row.

### POST /src/app/api/webhooks/stripe/route.ts
Validate Stripe-Signature header.
checkout.session.completed → insert/update subscriptions row.
customer.subscription.updated → update subscriptions.
customer.subscription.deleted → update subscriptions.status = 'cancelled'.
invoice.payment_succeeded → insert notifications row.
invoice.payment_failed → insert notifications row, update subscriptions.status = 'past_due'.

### POST /src/app/api/stripe/portal/route.ts
Create Stripe billing portal session for current user's stripe_customer_id. Return URL.

### POST /src/app/api/onboarding/complete/route.ts
Auth guard. Create Vapi assistant via POST https://api.vapi.ai/assistant with system prompt built from business data + catalog. Send welcome email via Resend. Set businesses.onboarding_completed = true. Return assistant ID → save to businesses.vapi_agent_id.

### POST /src/app/api/vapi/sync/route.ts
Auth guard. Fetch catalog_items for business. Build updated system prompt. PATCH https://api.vapi.ai/assistant/{vapi_agent_id}. Return success.

### GET /src/app/api/elevenlabs/voices/route.ts
Proxy to ElevenLabs GET /voices with API key. Return voice list.

### POST /src/app/api/elevenlabs/preview/route.ts
POST to ElevenLabs TTS with selected voice + sample text. Return audio blob.

## Step 7 — Email templates /src/emails/
Using React Email + Resend:
- welcome.tsx: "You're live on Talkmate 🎉" — brand colours, next steps
- call-transferred.tsx: caller number, transcript snippet, timestamp
- new-booking.tsx: customer name, service, time, call notes
- daily-summary.tsx: date, call count, outcome breakdown, estimated value
- weekly-report.tsx: richer version with chart placeholder
- team-invite.tsx: inviter name, role, accept link

## Step 8 — Tailwind config
```typescript
// tailwind.config.ts
colors: {
  'brand-orange': '#E8622A',
  'brand-blue': '#1565C0',
  'brand-blue-light': '#4A9FE8',
  'brand-dark': '#061322',
  'brand-navy': '#0A1E38',
  'brand-muted': '#4A7FBB',
}
```

## Step 9 — .env.local.example
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
RESEND_API_KEY=RESEND_API_KEY_REDACTED
VAPI_API_KEY=VAPI_API_KEY_REDACTED
VAPI_WEBHOOK_SECRET=
ELEVENLABS_API_KEY=ELEVENLABS_API_KEY_REDACTED
MAKE_WEBHOOK_URL=
NEXT_PUBLIC_APP_URL=https://app.talkmate.com.au
NEXT_PUBLIC_SITE_URL=https://www.talkmate.com.au
ADMIN_USER_ID=
```

## Step 10 — README.md
Full instructions: clone, npm install, copy .env.local.example, Supabase setup (create project, run migrations, get keys), Vercel deploy, Stripe webhook setup, Vapi webhook setup.

## Step 11 — GitHub push
```bash
git remote add origin https://GITHUB_TOKEN_REDACTED@github.com/irfanhanif89-art/talkmate-portal.git
git add -A
git commit -m "Initial build: Talkmate client portal — complete production build"
git branch -M main
git push -u origin main
```

## Final check
Run `npx tsc --noEmit` to confirm no TypeScript errors. Fix any before pushing.

When completely finished, run: openclaw system event --text "Done: Talkmate portal build complete — all pages built and pushed to GitHub at irfanhanif89-art/talkmate-portal" --mode now
