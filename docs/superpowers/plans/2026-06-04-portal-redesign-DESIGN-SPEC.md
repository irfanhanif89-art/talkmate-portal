# TalkMate Portal Redesign — DESIGN SPEC (source of truth for the visual rebuild)

> Companion to `2026-06-04-portal-redesign.md`. Extracted from the Claude Design handoff at
> `_docs/portal-design-handoff/portal-design/project/`. The 12 mockups are self-contained HTML
> files with inline `<style>`/`<script>`. **Read the relevant mockup file alongside this spec when
> building each screen** — this document is the consolidated reference, the HTML is the pixel truth.

---

## 1. Global Design System (canonical "dark" theme)

> Two slightly different `:root` token sets exist across the mockups. **Variant A is canonical**
> (used by 8 of 12 screens incl. the dashboard). Normalize ALL screens to Variant A.

### 1a. Canonical color tokens (Variant A)
```
--bg:          #06101c
--sidebar:     #040c17
--card:        #0d1b2a
--card-2:      #122234
--line:        rgba(255,255,255,.055)
--line-strong: rgba(255,255,255,.10)
--text:        #deeaf8
--dim:         #7a9ab8
--faint:       #4a6882
--orange:      #f07832
--orange-grad: linear-gradient(135deg,#f58a42,#e86526)
--green:       #2ec98a
--green-soft:  rgba(46,201,138,.13)
--red:         #f0625a
--blue:        #4a9fe8
--gold:        #f2b53c
--r:           12px
```
Brand-accent `rgba()` literals throughout the mockups use **`238,106,44`** (= `#ee6a2c`). Treat
`rgba(238,106,44,*)` tints as canonical orange; use the `#f58a42→#e86526` gradient for fills.

### 1b. Body background radial glows (per screen — optional flavor, keep subtle)
- dashboard: `radial-gradient(1200px 700px at 78% -8%,rgba(238,106,44,.10),transparent 60%),radial-gradient(1000px 800px at 12% 110%,rgba(53,201,138,.06),transparent 55%),var(--bg)`
- calls: `radial-gradient(1200px 700px at 80% -10%,rgba(238,106,44,.09),transparent 55%),var(--bg)`
- analytics: `radial-gradient(1000px 600px at 75% -5%,rgba(91,155,217,.10),transparent 55%),var(--bg)`
- sms-activity: `radial-gradient(900px 500px at 75% 10%,rgba(53,201,138,.06),transparent 55%),var(--bg)`
- catalog: `radial-gradient(900px 500px at 80% 10%,rgba(238,106,44,.07),transparent 55%),var(--bg)`
- billing: `radial-gradient(1000px 600px at 80% 0%,rgba(238,106,44,.08),transparent 55%),var(--bg)`
- sales-dashboard: `radial-gradient(1200px 800px at 80% -10%,rgba(74,159,232,.10),transparent 55%),radial-gradient(800px 600px at 10% 110%,rgba(238,106,44,.06),transparent 55%),var(--bg)`
- sales-leads: `radial-gradient(1000px 600px at 85% -5%,rgba(74,159,232,.09),transparent 55%),var(--bg)`
- bookings, receptionist, customers, settings: flat `var(--bg)`

### 1c. Fonts
- **DM Sans** (weights 300,400,500,600,700,800) = all UI/headings/body.
- **DM Mono** (weights 400,500) = the `.mono` class: call times, durations, phone-line pills, invoice numbers, nav count badges.
- App font URL: `https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,600;9..40,700;9..40,800&family=DM+Mono:wght@400;500&display=swap`
- (Hanken Grotesk in the All-Screens file is canvas chrome only — do NOT add it.)

### 1d. "Premium Design System" override block — THIS IS THE FINAL LOOK
Appended identically to every screen's `<style>`. Build these into components, not as afterthoughts:
- Logo: 34×34, no tile/background/shadow — inline SVG only (`linearGradient #f58a42→#e66020`).
- Wordmark: "Talk" 800-weight `--text`, "mate" **300-weight** blue `#4a9fe8`, ls -.5px.
- Active nav: `background:rgba(240,120,50,.09); color:var(--text); box-shadow:inset 2px 0 0 var(--orange); font-weight:600` (left-accent bar, NOT a fill).
- Kill KPI glow blobs: `.kpi .glow{display:none}`.
- Elevation shadows: cards/panels/kpis get `box-shadow:0 1px 4px rgba(0,0,0,.28)`; `.sidefoot` `0 1px 3px rgba(0,0,0,.3)`, radius 12px.
- Tabular numerics: `font-variant-numeric:tabular-nums; font-feature-settings:"tnum"` on every numeric value (KPI vals, stat vals, invoice amounts, prices, big numbers).

### 1e. Typography scale (actual values)
| Element | Size / weight |
|---|---|
| Topbar h1 (title/greeting) | 19–20px / 800, ls -.4px |
| Panel header h2 | 14.5–15px / 700, ls -.2px |
| Section head (settings/receptionist) | 16–19px / 800 |
| KPI value | dashboard 36px/800 ls -1.5px; analytics/sales 30px/800 ls -1px |
| KPI label | 11–11.5px / 600–700 uppercase ls .06–.07em (dim) |
| Rev-strip value | 22px / 800 ls -.5px |
| Stat-bar value | 20–22px / 800 |
| Hero numbers (plan price, eofy, comm) | 26–36px / 800 ls -.5/-1px |
| Nav link | 13.5px / 500 (active 600) |
| Nav section label | 10–11px / 700 uppercase ls .12em (faint) |
| Body / desc | 12–13.5px / 400–500 (dim) |
| Tag/pill | 10.5px / 700 ls .02em |
| AI score badge | 10–10.5px / 700 |
| Table header | 11–11.5px / 700 uppercase ls .06em (faint) |
| Nav count badge | 10–11px / 700 DM Mono |

### 1f. Animations
- `@keyframes pulse{0%{transform:scale(.6);opacity:.5}100%{transform:scale(2.2);opacity:0}}` — live-dot halo, 1.8s.
- `@keyframes upulse{0%,100%{opacity:1}50%{opacity:.35}}` — upsell dot, 2s. (Already in globals.css as `upsell-pulse`.)
- `@keyframes w{0%,100%{height:6px}50%{height:24px}}` — status-card waveform, 1.1s, 40 bars staggered `delay:i*0.06s`.

---

## 2. Light Theme (toggle)

Source: `TalkMate Portal - All Screens.html` (`window._LIGHT_CSS`). Mechanism: localStorage key
**`tm-theme`** (`"light"`/`"dark"`, default dark), body/html class **`tm-light`**.

Light overrides (applied on `.tm-light`):
```
--bg:#f0ebe0  --sidebar:#e6dfd2  --card:#ffffff  --card-2:#f4f0e8
--line:rgba(20,30,45,.10)  --line-strong:rgba(20,30,45,.18)
--text:#15202c  --dim:#4e6070  --faint:#8294a4  --green-soft:rgba(25,140,90,.13)
```
Accent tokens (orange/green/red/blue/gold) are NOT overridden — accents stay identical in light mode.
Per-selector light rules (nav, panels, cards, seg, call/booking rows, plan-hero light gradient
`linear-gradient(120deg,#e4edf8,#edf4fb)`) — see the source file lines 54–71. When tokens are mapped
to CSS variables, most of these resolve automatically; only `.plan-hero` needs an explicit light variant.

---

## 3. Shared Layout Chrome

### 3a. Fluidization (mockups are fixed 1440×1080 — make responsive)
Convert these hard pixels to fluid: sidebar 240px (drawer on mobile); `.main{height:1080px}`→`100vh min-h-0`
scrollable; dashboard `.grid` `calc()` height → flex; `.chart{height:148px}`, analytics `.linechart{160px}`,
bookings `HOUR_H=68px` + calendar `min-height:600px`, `.bottom-grid{240px}` → CSS-var/flex; split columns
(430/320/360/380px right rails, kanban `flex:0 0 220px`) → responsive widths.

### 3b. Sidebar (client portal)
240px, `bg --sidebar`, right border `--line`, flex column, pad `20px 14px`. Brand block (logo SVG +
"Talk<em>mate</em>" wordmark). Nav with icon (17px stroke-2) + label + optional badge. Hover
`rgba(255,255,255,.04)`; active = left-accent bar. `.badge` = orange pill (DM Mono count), `.nbadge` =
blue pill. **Canonical client nav** (use one set, mark active per route):
- (top, no label): Dashboard, Calls `14`, Bookings `6`, Analytics, Services
- **Engage**: SMS Activity `3`, VIP Callers, Callbacks `2`(nbadge)
- **Configure**: AI Receptionist, Billing, Settings, Customers
Sidebar footer (`.sidefoot`): card with avatar (rounded-square gradient initials) + business name + plan sub-line.

**Sales HQ nav** (sales-dashboard/sales-leads): brand gets `.brand-sub` "Sales HQ" (orange). Items:
Dashboard, My Pipeline `12`, Demo Caller, My Clients `3`(nbadge), Hit List → **My Account**: Commissions,
My Contract, Resources, My Profile. Footer avatar "JB" (blue gradient `#1a4a6a→#0d2e50`).

### 3c. Topbar
68px (72px on larger screens), bottom border `--line`, pad `0 28px`.
- Greeting variant (dashboard, sales-dashboard): h1 19px/800 + dim subtitle.
- Title variant (others): h1 20px/800 page name.
- Right cluster: search box (dashboard only, max-w 280), live pill (green-soft + pulsing dot), icon button(s)
  (36px rounded-square, bell, optional orange `.ndot`), avatar (rounded-square gradient initials). Some
  screens add action buttons (Export / Add service / Add lead / Add booking).

---

## 4. Reusable Component Catalogue

(Build as `src/components/portal/ui-v2/*` primitives. Each lists class → description → screens.)

- **KpiCard** `.kpi` (+`.acc`/`.ok` accent): label(icon+uppercase) / value(30–36px/800 tabular) / sub / ctx
  trend (`.ctx-up` green / `.ctx-dn` red / `.ctx-neu`). Glow blob hidden. → dashboard, analytics, sales-dashboard.
- **Panel** `.panel` + `.ph` header (h2 + meta/link). Elevation shadow. → most screens.
- **Card** `.card` — settings/billing containers.
- **SegmentedControl** `.seg`/`button.on` (bg `--bg`, active `--card-2`). → dashboard.
- **Tabs** `.tabs`/`.tab.on`+`.cnt`, `.drtabs` (date range), `.tb` (underline). → calls, analytics, receptionist.
- **Chips** `.chips`/`.chip.on` (orange-tint active). → catalog, customers.
- **Tag** `.tag` base + variants: `.t-book`(green) `.t-quote`(orange) `.t-q`(blue) `.t-emg`/`.t-miss`(red)
  `.t-xfer`(gold). Catalog cats `.cat-emg/sched/quote/maint`. SMS `.type-confirm/missed/booking/reply`.
  Lead `.ltag-tow/med/bty/trade/fit/prof`. Customer `.s-act/new/cold`.
- **AiScoreBadge** `.ai-score` + `.score-hi`(green)/`.score-md`(gold)/`.score-lo`(red). → dashboard, calls.
- **CallRow** (dashboard `.call`; list `.callrow`+`.sel`). **BookingRow** `.bk`+`.now`, `.ddj`.
- **RevenueStrip** `.rev-strip`/`.rev-item`/`.rev-cta-tile`. → dashboard.
- **EofyBanner** `.eofy-strip` (dashboard) / `.eofy-hero` (billing).
- **UpsellBanner** `.upsell`+`.upsell-dot`(upulse).
- **StatusCard** `.status-card` (gradient `150deg #16304a→#0f2236`)/`.wave`/`.status-row`. → dashboard.
- **Charts**: bar `.chart`/`.bar`/`.stack`+`.esc`; line `.linechart`/`.lbar`+`.hi`; outcome bars
  `.outbars`; heatmap `.heatmap`. (Recharts already in repo — prefer it, styled to tokens.)
- **Waveform** audio `.waverow i.on`. **Transcript bubbles** `.bubble.ava/.cal`, `.msg.out/.in`.
- **IntelPanel** `.intel`/`.intel-score`/`.intel-flag`(ok/warn/bad). → calls.
- **Toggle/Switch** (unify into one `<Switch>` with size variants; preserve catalog green / receptionist
  orange / settings check-square looks). **VoiceCard** `.vcard`+`.sel`. **Slider** `.custom-slider`.
  **RadioOption** `.ropt`. **HoursGrid** `.hours-grid`.
- **PlanHero** `.plan-hero`+glow / **Meter** `.meter-track`/`.meter-fill` / **AddonCard** `.addon-card` /
  **InvoiceTable** `.inv-table` (billing).
- **DataTable** `.tbl-head`/`.trow` / **DetailPanel** `.custpanel` (customers).
- **SettingsSubnav** `.snav` / **FormField** `.field` (focus ring `0 0 0 3px rgba(238,106,44,.15)`) /
  **NotifMatrix** `.notif-grid` (settings).
- **SprintHero** `.sprint-hero` / **PipelineMini** / **ActivityFeed** / **CommissionsCard** (green gradient) /
  **QuickActions** (sales-dashboard). **StatsBar** `.statsbar` (sms, sales-leads). **KanbanBoard** `.board`/
  `.col`/`.lcard`+`.hot`/`.warm`/`.won-badge` (sales-leads).
- **Buttons** `.btn-primary` (orange gradient + glow `0 4px 14px rgba(238,106,44,.35)`) / `.btn-secondary`
  (card outline).

---

## 5. Per-Screen Breakdown

> Read the named mockup file for exact markup. Data column = what real source to wire (see ARCH-MAP for
> the existing Supabase calls each page already makes — preserve those, restyle the markup around them).

### 5.1 Dashboard — `dashboard-command-center.html` (CANONICAL)
EOFY strip → Revenue strip (4 metrics + CTA tile) → 4 KPI cards (Calls 312 / Missed 0 / Bookings 6+$4,250 /
AI resolution 89%) → Upsell banner → grid(`1fr 370px`): left = "Call volume today" (segmented + stacked bar
chart + legend) and "Recent calls" (rows w/ score+tag+dur+play); right = "Receptionist on duty" status card
(waveform + 4 rows) and "Today's bookings" (`.bk` rows). Data: calls(month), jobs(revenue), bookings(today).

### 5.2 Calls — `calls.html`
Filter tabs (All/Bookings/Quotes/Questions/Escalated/Missed) + search + date + Export. Grid(`430px 1fr`):
left `.callrow` list (selectable); right detail = header(outcome) + IntelPanel(score/flags/$) + transcript
bubbles + audio player (`.waverow` + Download/Flag). Data: calls + intelligence_status/score/summary/flags.

### 5.3 Bookings — `bookings.html`
View toggle (Week/Month/List) + week nav + Add booking. Grid(`1fr 300px`): left = week calendar (time gutter
+ 5 day columns, absolutely-positioned `.job-block` variants booking/service/inspection, now-line); right
`.daydetail` = day header + `.ddj` rows. Data: scheduled bookings (time/duration/type/value). Fluidize HOUR_H.

### 5.4 Analytics — `analytics.html`
Export + date range (7D/30D/90D/Custom). 5 KPI cards → grid(`1fr 380px`): column chart "Call volume 30 days"
+ "Top callers"; bottom grid: outcome bars + peak-hours heatmap. Data: calls by range (Recharts already used).

### 5.5 SMS Activity — `sms-activity.html`
Stats bar (5). Grid(`320px 1fr 320px`): thread list / conversation (`.msg.out/.in` + compose) / templates
panel (5 `.tpl` w/ merge fields). Data: SMS conversations + templates.

### 5.6 Services/Catalog — `catalog.html`
Chips filter + Add service. Grid(`1fr 320px`): 3-col `.scard` grid (drag, category, ★, name/desc/price/dur,
toggle+edit/delete) / sync panel ("Save & Sync to AI" + toast + chip list). Data: catalog_items.

### 5.7 AI Receptionist — `receptionist.html`
Underline tabs (Voice/Greeting/FAQ/Escalation/Hours). Grid(`1fr 380px`): left = voice cards + tone slider +
response-style radios + answering-hours grid + save bar; right = live-preview chat. Data: businesses agent
config (split across /train KB + /settings voice — see ARCH-MAP).

### 5.8 Customers — `customers.html`
Search + chips + Export. Grid(`1fr 360px`): left data table (8-col, selectable rows, status tags); right
`.custpanel` = customer header + 2×2 stat grid + history list. Data: contacts.

### 5.9 Billing — `billing.html`
EOFY hero → Plan hero (badge/price/renew/features/Upgrade+Manage) → 3 cards (usage meter / payment method /
next invoice) → Add-ons (3 `.addon-card`) → invoice history table. Data: Stripe summary + plan + usage +
add-on entitlements + `isSaleActive()`.

### 5.10 Settings — `settings.html`
Grid(`220px 1fr`): `.snav` (Business Profile/Phone/Team/Notifications/Integrations) / form area (business
profile form + phone rows + notif matrix + save bar). Field focus = orange ring. Data: businesses config.

### 5.11 Sales Dashboard — `sales-dashboard.html`
Sprint hero (target/progress/4 KPIs) → 4 KPI cards → grid(`1fr 340px`): mini-kanban + activity feed /
commissions card (green) + quick actions. Data: leads + commissions by repId (sales shell).

### 5.12 Sales Pipeline — `sales-leads.html`
Stats bar (5) + filters. Board (6 columns New/Contacted/Demo Done/Proposal Sent/Won/Lost): `.lcard` w/
business/contact/plan/industry tag/days + hot/warm borders + won badge + dashed "Add lead" footers.
Data: leads by stage/assigned_to (LeadsBoard already exists — restyle).

---

## 6. React/Tailwind Port Notes
- Theme = CSS variables on `:root` (dark) + `.tm-light` overrides, mapped into Tailwind v4 `@theme` so
  `bg-card`/`text-dim`/`border-line` auto-switch. `next-themes` (already installed) with
  `attribute="class"`, `defaultTheme="dark"`, `storageKey="tm-theme"`, value map `{light:'tm-light', dark:''}`.
- Riskiest pixel details: the Premium override block (glow removal, elevation shadows, inset active-nav,
  300-weight blue "mate"), the exact gradients, `tabular-nums`, primary-button orange glow, settings focus ring.
- Two extra dashboard variants exist (`dashboard-daily-briefing`, `dashboard-live-switchboard`) — IGNORE;
  `dashboard-command-center` is authoritative.
