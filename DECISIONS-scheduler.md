# DECISIONS — Scheduler Build (Bizzow-style kanban-of-time)

**Brief**: `C:\Users\info\Downloads\talkmate-portal-scheduler-brief.md`
**Authored**: 2026-05-28 (Claude, auto mode)
**Status**: Session A shipped to local. Awaiting Irfan deploy approval.

The brief is comprehensive but was written without reference to the
current `bookings`, `scheduler_settings`, and `/api/portal/bookings`
state shipped in Sessions 15, 16, 28, 29, 30, 31, 44. Building it
literally would have created parallel columns, parallel API routes,
and overwritten 1460 lines of working `scheduler-view.tsx`.

Below: the deltas, and how Session A bridged them.

---

## D0. Migration number — 054, not 053

Brief said "As of Session 43, next migration number is 053." Reality:
`053_critical_rls_fixes.sql` already exists in the migrations tree
(Supabase advisor email 2026-05-28). Renamed mine to
`054_scheduler_bizzow_grid.sql`.

---

## D1. Bookings column naming — REUSE existing, add only what's new

The brief proposed `ALTER TABLE bookings ADD COLUMN` for 11 columns.
Most already exist under different names:

| Brief column           | Already exists as         | Action                                  |
|------------------------|---------------------------|-----------------------------------------|
| `duration_mins`        | `duration_minutes`        | Use existing                            |
| `started_at`           | `actual_start`            | Use existing                            |
| `completed_at`         | `actual_end`              | Use existing                            |
| `pickup_address`       | `pickup_address`          | Use existing                            |
| `delivery_address`     | `dropoff_address`         | Use existing — UI label "Delivery"      |
| `delivery_contact_name`| `dropoff_contact_name`    | Use existing                            |
| `delivery_contact_phone`| `dropoff_contact_phone`  | Use existing                            |
| `price`                | `estimated_value`         | Use existing                            |
| `driver_id`            | `driver_id`               | Use existing                            |
| `recurrence_rule`      | —                         | **Skipped — Phase 2 per brief**         |
| `color_hex`            | —                         | **Added in 054**                        |
| `pickup_lat`           | —                         | **Added in 054**                        |
| `pickup_lng`           | —                         | **Added in 054**                        |
| `delivery_lat`         | —                         | **Added as `dropoff_lat` in 054**       |
| `delivery_lng`         | —                         | **Added as `dropoff_lng` in 054**       |
| `payment_method`       | —                         | **Added in 054 (cash/card/invoice/insurance/account)** |

Renaming would have broken the existing 1460-line `scheduler-view.tsx`,
the `/api/cron/sms-reminders` cron, Vapi function handlers, and the
Hayden SMS confirmation loop (Session 29). Duplicating would have
created two-source-of-truth.

---

## D2. Status enum — added `started`

Before: `pending | confirmed | cancelled | completed | no_show | declined`
After:  `pending | confirmed | started | cancelled | completed | no_show | declined`

Migration 054 drops + re-adds the CHECK constraint with `started`
included. Also adds a `bookings_status_stamp` trigger: when status
transitions INTO `started`, `actual_start := now()` if null; when
INTO `completed`, `actual_end := now()` if null.

Existing data preserved — trigger only fires on transitions and only
stamps when the timestamp is null.

---

## D3. Tenant FK — `client_id`, not `business_id`

Brief consistently wrote `business_id`. Reality: `client_id`
(references `businesses(id)`). Realtime channel name became
`bookings:client:{client_id}` (the new `useBookingsRealtime` hook
filters by `client_id=eq.{clientId}`).

---

## D4. Date + time vs scheduled_start timestamp

Brief expected `{ date: 'YYYY-MM-DD', time: 'HH:MM' }` in the API.
Reality: `bookings.scheduled_start TIMESTAMPTZ`.

New `src/lib/scheduler-time.ts` has `wallClockToIso(date, time, tz)`
and `isoToWallClock(iso, tz)` using `Intl.DateTimeFormat` to handle
DST. The `/reschedule` endpoint accepts `{date, time, duration_mins}`
and composes the timestamps. Reads still return raw ISO; the grid
components do the tz rendering client-side via `renderInTz`.

---

## D5. API namespace — extended `/api/portal/bookings`, did NOT fork

Brief proposed `/api/scheduler/bookings`. Existing surface lives at
`/api/portal/bookings`. Session A added:

- `GET /api/portal/scheduler-feed?from&to` — aggregate (bookings +
  drivers + holidays + settings) in one round-trip.
- `PATCH /api/portal/bookings/[id]/reschedule` — date/time/duration
  with conflict detection.
- `PATCH /api/portal/bookings/[id]/reassign` — driver change with
  conflict detection.

Extended existing `PATCH /api/portal/bookings/[id]` allowlist to
include the new 054 columns (color_hex, payment_method, lat/lng,
duration_minutes, notes).

Both `/api/portal/scheduler-config` and the admin twin
`/api/admin/businesses/[id]/scheduler-config` had their SCALAR_FIELDS
extended with the new flat settings columns.

---

## D6. Existing `scheduler-view.tsx` — extended, did NOT replace

The current 1460-line component handles Week + Day views with driver
lanes, plus List and Settings tabs, plus the booking confirmation
loop, plus the agent sync button. Load-bearing.

Session A approach:
- Added 9 new components in `src/components/portal/scheduler/`:
  `WeekGrid.tsx`, `DayGrid.tsx`, `MonthGrid.tsx`, `JobBlock.tsx`,
  `JobSidePanel.tsx`, `NowIndicator.tsx`, `AllDayRow.tsx`,
  `DriverFilterRow.tsx`, plus `types.ts` and `layout.ts`.
- Imported them into `scheduler-view.tsx` under `Bizzow*` aliases.
- Swapped the JSX in `CalendarTab` to render the new grids.
- Swapped `<JobDetailModal>` for `<JobSidePanel>`.
- Added Month button to the view toggle.
- Added `<DriverFilterRow>` above the grid.
- Added `useBookingsRealtime` hook.

The legacy inner `WeekGrid`, `DayGrid`, `JobDetailModal` functions
remain as dead code in `scheduler-view.tsx` for now — a follow-up
cleanup PR will delete them once the new grid is verified in prod.
Keeping them avoids touching ~700 lines of working code in a single
session.

---

## D7. scheduler_settings — flat columns (chosen)

Migration 054 added (per your selection):
- `default_start_hour INT DEFAULT 6`
- `default_end_hour INT DEFAULT 20`
- `show_weekend BOOLEAN DEFAULT true`
- `week_starts_on INT DEFAULT 1`
- `time_increment_mins INT DEFAULT 30`
- `group_by_driver BOOLEAN DEFAULT false`

Plus CHECK constraints on each (hour range, week_starts_on 0..6,
increment 5/10/15/20/30/60).

The existing `operating_hours` jsonb stays untouched — it drives
what the **booking engine** considers bookable. The new flat columns
drive what the **grid displays**. Intentionally separate; an owner
can display 6 AM–8 PM but only accept bookings 8 AM–6 PM.

---

## D8. Google Places autocomplete — Session B

`AddressAutocompleteInput.tsx` + the click-empty-slot quick-create
flow are Session B scope. Session A renders the empty-slot click
through the existing `AddJobModal` (which doesn't have Places
autocomplete yet). Lat/lng columns exist in 054, ready to be
populated.

`NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` needs to be verified in prod env
before Session B. The server-side `GOOGLE_MAPS_API_KEY` (used by
`/api/maps/distance`) is already wired.

---

## D9. Driver price visibility — `driver_visible_bookings` view added

Migration 054 creates:
```sql
CREATE VIEW driver_visible_bookings WITH (security_invoker = true) AS
SELECT ..., CASE WHEN b.payment_method IN ('cash', 'card')
                 THEN b.estimated_value ELSE NULL END AS price, ...
FROM bookings b;
```

Aliases `description → service`, `dropoff_* → delivery_*`,
`estimated_value → price`, `actual_start → started_at`,
`actual_end → completed_at`. Driver-side surfaces (mobile +
future driver portal view) read this view, never `bookings`
directly.

`security_invoker = true` means RLS on `bookings` applies as the
caller, so the existing `bookings_client_access` policy gates
access correctly through the view.

Owner-facing scheduler reads `bookings` directly. `JobSidePanel`
renders a "Hidden from driver" / "Driver sees price" chip next to
the price based on the `priceHiddenFromDriver()` helper in
`scheduler/types.ts`.

---

## D10. Admin parity — Session B

The new components accept an optional `clientId`-via-prop shape but
the page at `/admin/clients/[id]/portal/scheduler` is Session B.
Existing admin reads via `/api/admin/businesses/[id]/bookings` and
`/api/admin/businesses/[id]/scheduler-config` already work; Session A
just hasn't added the admin page wrapper yet.

Realtime is gated off in admin context for now — the channel filter
`client_id=eq.{adminClientId}` would work but the admin session
context needs a different driver-lookup path. Defer.

---

## D11. Driver filter row vs swimlanes

Both built in Session A:
- **Filter row** at the top of the grid — `DriverFilterRow.tsx`.
  Cards for All / Unassigned (hidden when zero) / each active driver.
  Filters the visible bookings to one driver.
- **Swimlanes** = the `group_by_driver` flat column in
  `scheduler_settings`. The DayGrid signature accepts it but Session A
  only renders the plain (non-swimlanes) mode. Swimlanes layout is
  Session B.

---

## D12. Realtime — portal shipped, mobile Phase 2

`src/hooks/useBookingsRealtime.ts` subscribes to PostgresChanges on
`bookings` filtered by `client_id`. The reducer handles INSERT (only
if not already present), UPDATE (merge into existing row), DELETE.
Wired into `scheduler-view.tsx` after the initial fetch resolves the
`clientId` off the first booking row.

Mobile-side hooks (`useBookings(businessId)`,
`useDrivers(businessId)`) and `AddBookingModal` API swap stay in
the mobile project's Phase 2 backlog. Not touched.

---

## D13. dispatch_jobs — left alone

`dispatch_jobs` (migration 024) has its own lifecycle and powers the
`/admin/dispatch` admin page. Brief explicitly says non-goal: "Don't
replace the existing /admin/dispatch page". Confirmed. No data merge,
no migration touching it.

---

## What shipped in Session A

**Migration `054_scheduler_bizzow_grid.sql`** — additive, idempotent.
- Bookings columns: `color_hex`, `pickup_lat/lng`, `dropoff_lat/lng`,
  `payment_method`.
- Status enum extended with `started`.
- `bookings_status_stamp` trigger.
- Scheduler_settings flat columns + CHECK constraints.
- `driver_visible_bookings` view.
- 2 supporting indexes.

**3 new API routes**:
- `GET /api/portal/scheduler-feed?from&to`
- `PATCH /api/portal/bookings/[id]/reschedule`
- `PATCH /api/portal/bookings/[id]/reassign`

**2 modified API routes** (allowlist extension only):
- `PATCH /api/portal/bookings/[id]` — new column fields
- `GET/PATCH /api/portal/scheduler-config` — new flat columns
- `GET/PATCH /api/admin/businesses/[id]/scheduler-config` — same

**9 new components** in `src/components/portal/scheduler/`:
- `types.ts` — shared types + design tokens + `blockColors`,
  `priceHiddenFromDriver`
- `layout.ts` — `layoutOverlapping`, `minutesToPx`
- `WeekGrid.tsx` — Bizzow-style time-on-Y, days-as-columns
- `DayGrid.tsx` — single-column variant
- `MonthGrid.tsx` — standard month grid
- `JobBlock.tsx` — the colored block with status palette + pulse for
  in-progress + dashed border for unassigned
- `JobSidePanel.tsx` — right-rail panel with Customer / Service /
  Schedule / Money / Driver (with reassign dropdown) / Status (with
  Mark Started / Mark Complete) / Notes sections
- `NowIndicator.tsx` — red line, updates every 60s
- `AllDayRow.tsx` — thin lane for public holidays / closures
- `DriverFilterRow.tsx` — cards at the top for All / Unassigned /
  per-driver

**2 new helpers**:
- `src/lib/scheduler-time.ts` — `wallClockToIso`, `renderInTz`,
  `isoToWallClock`, `startOfWeek`, `addDays`, etc.
- `src/hooks/useBookingsRealtime.ts` — Supabase Realtime subscription.

**`scheduler-view.tsx`**:
- View toggle gained Month.
- Booking interface gained the new 054 fields (optional).
- `SchedulerSettings` interface gained the new flat columns.
- `loadEffect` fetches public holidays alongside bookings/drivers/settings.
- `CalendarTab` accepts new props for allDayEvents, driverFilter,
  selectedId, onJumpToDate.
- JSX swapped from legacy `WeekGrid`/`DayGrid`/`JobDetailModal` to
  `BizzowWeekGrid`/`BizzowDayGrid`/`BizzowMonthGrid`/`JobSidePanel`.
- Driver filter row above the grid (week + day views).
- Legacy inner components left in place as dead code (cleanup PR
  later).

**Build pipeline**:
- `npx tsc --noEmit` — clean
- `npm run build` — `✓ Compiled successfully in 14.1s` (178 routes
  generated). No new warnings.

---

## What's deferred to Session B

- `@dnd-kit/core` drag-to-reschedule + edge-resize.
- Driver swimlanes layout when `group_by_driver = true`.
- Click-empty-slot quick-create modal with Google Places autocomplete
  + the additional fields (payment_method, color_hex, lat/lng capture).
- Admin parity page at `/admin/clients/[id]/portal/scheduler`.
- Keyboard shortcuts (T/D/W/M/←/→/Esc/?).
- Playwright E2E for drag-to-reschedule.
- Mobile <768px redirect page.
- Delete the legacy inner `WeekGrid` / `DayGrid` / `JobDetailModal`
  functions from `scheduler-view.tsx`.
- DEPLOYMENT.md entry.

---

## Pre-deploy checklist for Irfan

1. Run migration 054 on preview Supabase
   (`rgifivtzmjvanzqwgadq`) first.
2. Smoke-test `/scheduler` on preview:
   - Day view loads, click a block opens the side panel
   - Week view loads, hour gridlines render correctly
   - Month view loads, click a day jumps to Day view
   - DriverFilterRow appears with the right counts
   - Realtime: open two tabs, change status in one, see it in the other
3. Run migration 054 on production after preview verifies.
4. Merge to `main` → Vercel auto-deploys.
5. Verify on `app.talkmate.com.au/scheduler` for Glen (towing).

If anything looks off, the legacy inner components are still in
`scheduler-view.tsx` — a 3-line revert of the JSX swap and the
imports gets you back to the Session 31 / 44 scheduler.

---

## Sign-off

Build verdict: **GREEN**. Migration is additive + idempotent.
Build is clean. All brief Phase 1 items shipped except the four
deferred to Session B (drag/drop, Places, admin page, swimlanes).
