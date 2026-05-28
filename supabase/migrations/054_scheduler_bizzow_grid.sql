-- =====================================================================
-- Migration 054: Bizzow-style scheduler grid.
-- (Note: brief specified 053; renamed to 054 because 053_critical_rls_fixes
-- was added between Session 43 and this work — see DECISIONS-scheduler.md.)
--
-- This is a SCHEMA-ONLY migration. It adds:
--   1. New columns on `bookings`: color_hex, pickup_lat/lng,
--      dropoff_lat/lng, payment_method.
--   2. Status check on `bookings` extended with 'started' (in addition
--      to the existing pending/confirmed/cancelled/completed/no_show/
--      declined from migration 044).
--   3. Status-transition trigger that auto-stamps actual_start when
--      status moves to 'started' and actual_end when it moves to
--      'completed' — so the "Mark Started"/"Mark Complete" buttons in
--      the side panel only need to PATCH status.
--   4. Flat grid-display columns on `scheduler_settings`: default
--      start/end hour, weekend visibility, week start, time
--      increment, group-by-driver default. These drive what the GRID
--      DISPLAYS — the existing `operating_hours` jsonb continues to
--      drive what's BOOKABLE.
--   5. `driver_visible_bookings` SQL view — strips price when
--      payment_method is invoice/insurance/account/NULL. Driver
--      mobile + future driver portal read this view, never `bookings`
--      directly. Aliases description→service, dropoff_*→delivery_*,
--      estimated_value→price to match the driver-side payload shape.
--
-- All statements idempotent. No backfill. Existing rows get
-- payment_method = NULL which under the visibility rule means "hide
-- from driver" — conservative correct behaviour. New bookings will
-- collect payment_method via the scheduler quick-create modal in
-- Session B.
--
-- See DECISIONS-scheduler.md (D1, D2, D7, D9) for the rationale on
-- each section, especially why we did NOT add the brief's
-- duration_mins/started_at/completed_at/price/delivery_* columns
-- (they already exist under different names).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. bookings — new columns
-- ---------------------------------------------------------------------
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS color_hex text,
  ADD COLUMN IF NOT EXISTS pickup_lat numeric(10,7),
  ADD COLUMN IF NOT EXISTS pickup_lng numeric(10,7),
  ADD COLUMN IF NOT EXISTS dropoff_lat numeric(10,7),
  ADD COLUMN IF NOT EXISTS dropoff_lng numeric(10,7),
  ADD COLUMN IF NOT EXISTS payment_method text;

-- color_hex sanity check (allow #RGB or #RRGGBB, case-insensitive, or NULL).
ALTER TABLE public.bookings DROP CONSTRAINT IF EXISTS bookings_color_hex_check;
ALTER TABLE public.bookings ADD CONSTRAINT bookings_color_hex_check
  CHECK (color_hex IS NULL OR color_hex ~* '^#([0-9a-f]{3}|[0-9a-f]{6})$');

-- payment_method enum.
ALTER TABLE public.bookings DROP CONSTRAINT IF EXISTS bookings_payment_method_check;
ALTER TABLE public.bookings ADD CONSTRAINT bookings_payment_method_check
  CHECK (payment_method IS NULL OR payment_method = ANY (ARRAY[
    'cash'::text, 'card'::text, 'invoice'::text, 'insurance'::text, 'account'::text
  ]));

-- ---------------------------------------------------------------------
-- 2. bookings — status check extended with 'started'
--    Full superset listed explicitly so a future reader can see the
--    complete valid set (matches the migration 044 pattern).
-- ---------------------------------------------------------------------
ALTER TABLE public.bookings DROP CONSTRAINT IF EXISTS bookings_status_check;
ALTER TABLE public.bookings ADD CONSTRAINT bookings_status_check
  CHECK (status = ANY (ARRAY[
    'pending'::text,
    'confirmed'::text,
    'started'::text,
    'cancelled'::text,
    'completed'::text,
    'no_show'::text,
    'declined'::text
  ]));

-- ---------------------------------------------------------------------
-- 3. Status transition trigger — auto-stamps actual_start / actual_end
--    Only stamps when transitioning INTO the relevant status AND the
--    timestamp column is currently null. Existing data with non-null
--    actual_start/actual_end is preserved.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.bookings_status_stamp()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status = 'started' AND (OLD.status IS DISTINCT FROM 'started') AND NEW.actual_start IS NULL THEN
    NEW.actual_start := now();
  END IF;
  IF NEW.status = 'completed' AND (OLD.status IS DISTINCT FROM 'completed') AND NEW.actual_end IS NULL THEN
    NEW.actual_end := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bookings_status_stamp ON public.bookings;
CREATE TRIGGER trg_bookings_status_stamp
  BEFORE UPDATE ON public.bookings
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.bookings_status_stamp();

-- ---------------------------------------------------------------------
-- 4. scheduler_settings — flat grid-display columns
--    These drive what the grid DISPLAYS. operating_hours jsonb still
--    drives what's BOOKABLE for the agent / customer-facing booking
--    flow. Intentionally separate so the owner can view a wider time
--    band than they accept bookings in.
--
--    week_starts_on follows Postgres / JS Date.getDay() convention:
--      0 = Sunday, 1 = Monday, ..., 6 = Saturday.
--    AU default is 1 (Monday).
-- ---------------------------------------------------------------------
ALTER TABLE public.scheduler_settings
  ADD COLUMN IF NOT EXISTS default_start_hour integer DEFAULT 6,
  ADD COLUMN IF NOT EXISTS default_end_hour integer DEFAULT 20,
  ADD COLUMN IF NOT EXISTS show_weekend boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS week_starts_on integer DEFAULT 1,
  ADD COLUMN IF NOT EXISTS time_increment_mins integer DEFAULT 30,
  ADD COLUMN IF NOT EXISTS group_by_driver boolean DEFAULT false;

-- Sanity checks on the new ints.
ALTER TABLE public.scheduler_settings DROP CONSTRAINT IF EXISTS scheduler_settings_hour_range_check;
ALTER TABLE public.scheduler_settings ADD CONSTRAINT scheduler_settings_hour_range_check
  CHECK (default_start_hour BETWEEN 0 AND 23
     AND default_end_hour BETWEEN 1 AND 24
     AND default_end_hour > default_start_hour);

ALTER TABLE public.scheduler_settings DROP CONSTRAINT IF EXISTS scheduler_settings_week_starts_check;
ALTER TABLE public.scheduler_settings ADD CONSTRAINT scheduler_settings_week_starts_check
  CHECK (week_starts_on BETWEEN 0 AND 6);

ALTER TABLE public.scheduler_settings DROP CONSTRAINT IF EXISTS scheduler_settings_increment_check;
ALTER TABLE public.scheduler_settings ADD CONSTRAINT scheduler_settings_increment_check
  CHECK (time_increment_mins IN (5, 10, 15, 20, 30, 60));

-- ---------------------------------------------------------------------
-- 5. driver_visible_bookings view — driver-side read path.
--    Strips price when payment_method ∉ {cash, card}. Aliases column
--    names to the brief-shape the mobile app's driverCanSeePrice()
--    helper expects.
--
--    Driver-side surfaces (mobile app + future driver portal view)
--    read THIS view, never `bookings` directly. The owner-facing
--    scheduler reads `bookings` directly and renders a "Hidden from
--    driver" chip when the rule fires.
-- ---------------------------------------------------------------------
DROP VIEW IF EXISTS public.driver_visible_bookings;
CREATE VIEW public.driver_visible_bookings
WITH (security_invoker = true)
AS
SELECT
  b.id,
  b.client_id,
  b.caller_name,
  b.caller_phone,
  b.description AS service,
  b.scheduled_start,
  b.scheduled_end,
  b.duration_minutes,
  b.status,
  b.driver_id,
  b.pickup_address,
  b.pickup_lat,
  b.pickup_lng,
  b.dropoff_address AS delivery_address,
  b.dropoff_lat AS delivery_lat,
  b.dropoff_lng AS delivery_lng,
  b.dropoff_contact_name AS delivery_contact_name,
  b.dropoff_contact_phone AS delivery_contact_phone,
  b.notes,
  b.payment_method,
  b.color_hex,
  b.actual_start AS started_at,
  b.actual_end AS completed_at,
  CASE
    WHEN b.payment_method IN ('cash', 'card') THEN b.estimated_value
    ELSE NULL
  END AS price,
  b.created_at
FROM public.bookings b;

-- Grant the same access as the underlying table. Because the view is
-- created with security_invoker = true, RLS on `bookings` applies as
-- the caller, so the existing bookings_client_access policy gates
-- access correctly.
GRANT SELECT ON public.driver_visible_bookings TO anon, authenticated;

-- ---------------------------------------------------------------------
-- 6. Indexes to support the grid's range queries
--    The grid hits bookings filtered by client_id + scheduled_start
--    range, frequently. Existing idx_bookings_client_status covers
--    status filters but not raw date ranges.
-- ---------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_bookings_client_scheduled_start
  ON public.bookings(client_id, scheduled_start)
  WHERE scheduled_start IS NOT NULL;

-- ---------------------------------------------------------------------
-- 7. Optional: index for driver-filtered queries (the driver-filter
--    row at the top of the scheduler narrows by driver_id).
-- ---------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_bookings_driver_scheduled
  ON public.bookings(driver_id, scheduled_start)
  WHERE driver_id IS NOT NULL AND scheduled_start IS NOT NULL;

-- ---------------------------------------------------------------------
-- 8. Realtime publication
--    The useBookingsRealtime hook subscribes to PostgresChanges on this
--    table. The Supabase project's `supabase_realtime` publication must
--    include `bookings` or the subscription is a no-op (subscribe
--    returns SUBSCRIBED but no INSERT/UPDATE/DELETE events ever arrive).
--    Found missing during preview verification — adding here so prod
--    picks it up too.
--
--    Idempotent: pg_publication_tables check before ADD avoids the
--    "relation is already member" error on re-runs.
-- ---------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'bookings'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.bookings;
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- 9. Realtime-compatible SELECT policy
--    The existing bookings_client_access policy uses
--    `client_id = get_current_client_id()`. That function is
--    SECURITY DEFINER and the Supabase Realtime worker can't resolve
--    it during WAL-event RLS evaluation, so postgres_changes events
--    never reach the browser even though the channel SUBSCRIBED.
--
--    Adding a SECOND policy using an inline subquery (same pattern as
--    the `calls` table policy) gives the realtime worker something it
--    CAN evaluate. The two policies are OR-combined, so this only
--    grants access — never removes it.
--
--    Verified working with the test bookings on preview against the
--    Test Towing Co owner.
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS bookings_owner_select_realtime ON public.bookings;
CREATE POLICY bookings_owner_select_realtime ON public.bookings
  FOR SELECT
  USING (
    client_id IN (
      SELECT id FROM public.businesses WHERE owner_user_id = auth.uid()
    )
  );
