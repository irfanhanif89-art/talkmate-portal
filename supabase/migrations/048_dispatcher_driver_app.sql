-- Migration 048: Dispatcher + Driver App (Sessions 36-37).
--
-- Replaces the v1 dispatcher schema from migration 024 with a full
-- driver-app-ready model. The v1 tables (drivers, dispatch_jobs,
-- vehicles, driver_shifts, driver_availability) were never populated
-- in production — confirmed 0 rows on 2026-05-26 — so we drop and
-- rebuild rather than ALTER in place.
--
-- Conventions:
--   * FK column to businesses is `client_id` (matches every other
--     business-scoped table in the schema since migration 008).
--   * RLS uses `get_current_client_id()` for owners and a separate
--     `drivers.user_id = auth.uid()` lookup for drivers.
--   * Drivers are full Supabase Auth users invited by the business
--     owner; they do not self-register.
--   * Photos and signatures land in Storage bucket `dispatch-media`.
--
-- Brief deviations (with reasons):
--   * `businesses.dispatcher_enabled` proposed by the brief is NOT
--     added — we reuse the existing `businesses.dispatch_enabled`
--     column from migration 024 (single underscore) to avoid two
--     parallel flags.
--   * Brief's `dispatch_job_seq` sequence is omitted — the job
--     number trigger uses `businesses.dispatch_job_counter`.
--   * `driver_locations` RLS uses `WITH CHECK` (not just USING) so
--     drivers can INSERT/UPSERT their own row.
--   * `dispatch_jobs.declined_driver_ids uuid[]` added so the auto-
--     reassign cron does not loop back to a driver who already
--     declined.
--   * `driver_invites` adds `UNIQUE(client_id, email)` to prevent
--     duplicate pending invites.
--   * `payment_collected_type` carries the same CHECK as
--     `payment_type` for symmetry.

----------------------------------------------------------------------
-- 1. Drop the v1 dispatcher tables (empty in production).
----------------------------------------------------------------------

DROP TABLE IF EXISTS driver_availability CASCADE;
DROP TABLE IF EXISTS driver_shifts CASCADE;
DROP TABLE IF EXISTS dispatch_jobs CASCADE;
DROP TABLE IF EXISTS drivers CASCADE;
DROP TABLE IF EXISTS vehicles CASCADE;
DROP SEQUENCE IF EXISTS job_number_seq;

----------------------------------------------------------------------
-- 2. New columns on businesses.
----------------------------------------------------------------------
-- dispatch_enabled / dispatch_config already exist from 024 — keep.

ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS dispatch_response_timeout_mins INTEGER DEFAULT 15,
  ADD COLUMN IF NOT EXISTS customer_sms_on_accept BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS customer_sms_on_enroute BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS customer_sms_on_complete BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS dispatch_job_counter INTEGER DEFAULT 0;

----------------------------------------------------------------------
-- 3. drivers — Supabase Auth users linked to a business.
----------------------------------------------------------------------

CREATE TABLE drivers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  team_member_id uuid REFERENCES team_members(id) ON DELETE SET NULL,
  name text NOT NULL,
  phone text NOT NULL,
  email text,
  truck_type text,
    -- flatbed | hook_chain | wheel_lift | heavy_recovery | other
  truck_rego text,
  licence_number text,
  is_available boolean DEFAULT false,
  is_online boolean DEFAULT false,
  is_active boolean DEFAULT true,
  notes text,
  avatar_url text,
  location_consent_at timestamptz,
  created_at timestamptz DEFAULT NOW(),
  updated_at timestamptz DEFAULT NOW(),
  UNIQUE(client_id, phone)
);

CREATE INDEX idx_drivers_client_active
  ON drivers(client_id) WHERE is_active = true;
CREATE INDEX idx_drivers_user_id ON drivers(user_id);
CREATE INDEX idx_drivers_online
  ON drivers(client_id, is_online, is_available)
  WHERE is_online = true AND is_active = true;

ALTER TABLE drivers ENABLE ROW LEVEL SECURITY;

-- Owners read/write all drivers in their business.
CREATE POLICY "drivers_owner_access" ON drivers
  FOR ALL TO authenticated
  USING (client_id = get_current_client_id())
  WITH CHECK (client_id = get_current_client_id());

-- A driver can read their own row.
CREATE POLICY "drivers_self_read" ON drivers
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- A driver can update their own profile / online state.
CREATE POLICY "drivers_self_update" ON drivers
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Super admin can see everything (admin parity view).
CREATE POLICY "drivers_admin_all" ON drivers
  FOR ALL TO authenticated
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

----------------------------------------------------------------------
-- 4. driver_invites — pending owner-issued invites.
----------------------------------------------------------------------

CREATE TABLE driver_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  email text NOT NULL,
  name text NOT NULL,
  phone text,
  truck_type text,
  truck_rego text,
  token text UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'expired', 'cancelled')),
  invited_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  expires_at timestamptz NOT NULL DEFAULT NOW() + INTERVAL '7 days',
  accepted_at timestamptz,
  created_at timestamptz DEFAULT NOW()
);

-- One pending invite per email per business.
CREATE UNIQUE INDEX idx_driver_invites_unique_pending
  ON driver_invites(client_id, lower(email))
  WHERE status = 'pending';

CREATE INDEX idx_driver_invites_token ON driver_invites(token)
  WHERE status = 'pending';

ALTER TABLE driver_invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "driver_invites_owner_access" ON driver_invites
  FOR ALL TO authenticated
  USING (client_id = get_current_client_id())
  WITH CHECK (client_id = get_current_client_id());

CREATE POLICY "driver_invites_admin_all" ON driver_invites
  FOR ALL TO authenticated
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

-- Note: the GET /api/driver/invite/[token] route reads invites by
-- token for an UNAUTHENTICATED user (they're setting up their
-- account). That endpoint uses the service-role client, which
-- bypasses RLS, so no anon SELECT policy is needed.

----------------------------------------------------------------------
-- 5. dispatch_jobs — the job record.
----------------------------------------------------------------------

CREATE TABLE dispatch_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  booking_id uuid REFERENCES bookings(id) ON DELETE SET NULL,
  driver_id uuid REFERENCES drivers(id) ON DELETE SET NULL,
  call_id uuid REFERENCES calls(id) ON DELETE SET NULL,

  -- Classification.
  job_type text NOT NULL CHECK (job_type IN (
    'tow', 'roadside', 'accident_recovery', 'impound_release',
    'winch', 'battery_jump', 'tyre_change', 'fuel_delivery',
    'lockout', 'other'
  )),
  job_number text UNIQUE,

  -- Pickup.
  pickup_address text NOT NULL,
  pickup_lat decimal(10,8),
  pickup_lng decimal(11,8),
  pickup_notes text,

  -- Dropoff.
  dropoff_address text,
  dropoff_lat decimal(10,8),
  dropoff_lng decimal(11,8),
  dropoff_notes text,

  -- Customer.
  customer_name text,
  customer_phone text,
  customer_email text,

  -- Vehicle.
  vehicle_make text,
  vehicle_model text,
  vehicle_year text,
  vehicle_colour text,
  vehicle_rego text,
  vehicle_condition text,

  -- Requirements / pricing.
  special_instructions text,
  truck_type_required text,
  distance_km decimal(8,2),
  estimated_duration_mins integer,
  payment_type text CHECK (payment_type IN (
    'cash', 'card', 'account', 'insurance', 'motor_club', 'other'
  )),
  insurance_claim_number text,
  motor_club_job_number text,
  quoted_amount decimal(10,2),

  -- Lifecycle status.
  status text NOT NULL DEFAULT 'created' CHECK (status IN (
    'created',
    'driver_notified',
    'accepted',
    'declined',
    'en_route',
    'on_scene',
    'loaded',
    'in_transit',
    'at_dropoff',
    'completed',
    'invoiced',
    'paid',
    'cancelled'
  )),

  dispatch_attempt integer DEFAULT 0,
  -- Drivers who declined this job so far. The auto-reassign cron
  -- excludes them when picking the next driver.
  declined_driver_ids uuid[] NOT NULL DEFAULT '{}',

  notified_at timestamptz,
  response_deadline timestamptz,
  accepted_at timestamptz,
  driver_eta_mins integer,
  en_route_at timestamptz,
  on_scene_at timestamptz,
  loaded_at timestamptz,
  in_transit_at timestamptz,
  at_dropoff_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,

  -- Driver-side completion data.
  driver_completion_notes text,
  actual_distance_km decimal(8,2),
  final_amount decimal(10,2),
  payment_collected boolean DEFAULT false,
  payment_collected_at timestamptz,
  payment_collected_type text CHECK (payment_collected_type IN (
    'cash', 'card', 'account', 'insurance', 'motor_club', 'other'
  )),

  -- Customer SMS audit.
  customer_sms_accepted boolean DEFAULT false,
  customer_sms_en_route boolean DEFAULT false,
  customer_sms_completed boolean DEFAULT false,

  -- Proof of delivery.
  pickup_signature_url text,
  pickup_signature_at timestamptz,
  delivery_signature_url text,
  delivery_signature_at timestamptz,
  pickup_photo_count integer DEFAULT 0,
  delivery_photo_count integer DEFAULT 0,

  created_at timestamptz DEFAULT NOW(),
  updated_at timestamptz DEFAULT NOW(),
  created_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX idx_dispatch_jobs_client_status
  ON dispatch_jobs(client_id, status, created_at DESC);
CREATE INDEX idx_dispatch_jobs_driver_status
  ON dispatch_jobs(driver_id, status)
  WHERE driver_id IS NOT NULL;
CREATE INDEX idx_dispatch_jobs_response_deadline
  ON dispatch_jobs(response_deadline)
  WHERE status = 'driver_notified';
CREATE INDEX idx_dispatch_jobs_booking ON dispatch_jobs(booking_id)
  WHERE booking_id IS NOT NULL;

-- Enforce: a driver can only have ONE active job at a time. Active =
-- any in-progress lifecycle status. Partial unique index so the
-- constraint only kicks in for active rows.
CREATE UNIQUE INDEX idx_dispatch_jobs_one_active_per_driver
  ON dispatch_jobs(driver_id)
  WHERE driver_id IS NOT NULL
    AND status IN ('driver_notified','accepted','en_route','on_scene','loaded','in_transit','at_dropoff');

ALTER TABLE dispatch_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dispatch_jobs_owner_access" ON dispatch_jobs
  FOR ALL TO authenticated
  USING (client_id = get_current_client_id())
  WITH CHECK (client_id = get_current_client_id());

CREATE POLICY "dispatch_jobs_driver_read" ON dispatch_jobs
  FOR SELECT TO authenticated
  USING (driver_id IN (
    SELECT id FROM drivers WHERE user_id = auth.uid()
  ));

CREATE POLICY "dispatch_jobs_driver_update" ON dispatch_jobs
  FOR UPDATE TO authenticated
  USING (driver_id IN (
    SELECT id FROM drivers WHERE user_id = auth.uid()
  ))
  WITH CHECK (driver_id IN (
    SELECT id FROM drivers WHERE user_id = auth.uid()
  ));

CREATE POLICY "dispatch_jobs_admin_all" ON dispatch_jobs
  FOR ALL TO authenticated
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

----------------------------------------------------------------------
-- 6. dispatch_job_photos — pickup / delivery / damage photos.
----------------------------------------------------------------------

CREATE TABLE dispatch_job_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dispatch_job_id uuid NOT NULL REFERENCES dispatch_jobs(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  driver_id uuid REFERENCES drivers(id) ON DELETE SET NULL,
  photo_url text NOT NULL,
  photo_type text NOT NULL CHECK (photo_type IN ('pickup','delivery','damage','other')),
  caption text,
  taken_at timestamptz DEFAULT NOW()
);

CREATE INDEX idx_dispatch_job_photos_job
  ON dispatch_job_photos(dispatch_job_id, photo_type);

ALTER TABLE dispatch_job_photos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "photos_owner_access" ON dispatch_job_photos
  FOR ALL TO authenticated
  USING (client_id = get_current_client_id())
  WITH CHECK (client_id = get_current_client_id());

CREATE POLICY "photos_driver_access" ON dispatch_job_photos
  FOR ALL TO authenticated
  USING (driver_id IN (SELECT id FROM drivers WHERE user_id = auth.uid()))
  WITH CHECK (driver_id IN (SELECT id FROM drivers WHERE user_id = auth.uid()));

CREATE POLICY "photos_admin_all" ON dispatch_job_photos
  FOR ALL TO authenticated
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

----------------------------------------------------------------------
-- 7. driver_availability_log — append-only shift change log.
----------------------------------------------------------------------

CREATE TABLE driver_availability_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id uuid NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  is_online boolean NOT NULL,
  changed_at timestamptz DEFAULT NOW(),
  changed_by text CHECK (changed_by IN ('driver','owner','system'))
);

CREATE INDEX idx_driver_availability_log_driver
  ON driver_availability_log(driver_id, changed_at DESC);

ALTER TABLE driver_availability_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "availability_log_owner_access" ON driver_availability_log
  FOR ALL TO authenticated
  USING (client_id = get_current_client_id())
  WITH CHECK (client_id = get_current_client_id());

CREATE POLICY "availability_log_driver_insert" ON driver_availability_log
  FOR INSERT TO authenticated
  WITH CHECK (driver_id IN (SELECT id FROM drivers WHERE user_id = auth.uid()));

CREATE POLICY "availability_log_driver_read" ON driver_availability_log
  FOR SELECT TO authenticated
  USING (driver_id IN (SELECT id FROM drivers WHERE user_id = auth.uid()));

CREATE POLICY "availability_log_admin_all" ON driver_availability_log
  FOR ALL TO authenticated
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

----------------------------------------------------------------------
-- 8. driver_locations — one row per driver, upserted every 30s.
--    Subject of Realtime broadcasts to the dispatcher map.
----------------------------------------------------------------------

CREATE TABLE driver_locations (
  driver_id uuid PRIMARY KEY REFERENCES drivers(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  lat decimal(10,8) NOT NULL,
  lng decimal(11,8) NOT NULL,
  heading decimal(5,2),
  speed_kmh decimal(6,2),
  accuracy_m integer,
  updated_at timestamptz DEFAULT NOW()
);

CREATE INDEX idx_driver_locations_client
  ON driver_locations(client_id);

ALTER TABLE driver_locations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "driver_locations_owner_read" ON driver_locations
  FOR SELECT TO authenticated
  USING (client_id = get_current_client_id());

-- Driver INSERT/UPDATE/DELETE on own row. WITH CHECK is critical —
-- without it, drivers cannot upsert their own location.
CREATE POLICY "driver_locations_self_write" ON driver_locations
  FOR ALL TO authenticated
  USING (driver_id IN (SELECT id FROM drivers WHERE user_id = auth.uid()))
  WITH CHECK (driver_id IN (SELECT id FROM drivers WHERE user_id = auth.uid()));

CREATE POLICY "driver_locations_admin_all" ON driver_locations
  FOR ALL TO authenticated
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

-- Add to Realtime publication.
ALTER PUBLICATION supabase_realtime ADD TABLE driver_locations;

----------------------------------------------------------------------
-- 9. driver_location_history — append-only per-job route trace.
----------------------------------------------------------------------

CREATE TABLE driver_location_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id uuid NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  dispatch_job_id uuid REFERENCES dispatch_jobs(id) ON DELETE SET NULL,
  lat decimal(10,8) NOT NULL,
  lng decimal(11,8) NOT NULL,
  recorded_at timestamptz DEFAULT NOW()
);

CREATE INDEX idx_driver_location_history_job
  ON driver_location_history(dispatch_job_id, recorded_at DESC)
  WHERE dispatch_job_id IS NOT NULL;
CREATE INDEX idx_driver_location_history_retention
  ON driver_location_history(recorded_at);

ALTER TABLE driver_location_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "location_history_owner_read" ON driver_location_history
  FOR SELECT TO authenticated
  USING (client_id = get_current_client_id());

CREATE POLICY "location_history_driver_insert" ON driver_location_history
  FOR INSERT TO authenticated
  WITH CHECK (driver_id IN (SELECT id FROM drivers WHERE user_id = auth.uid()));

CREATE POLICY "location_history_admin_all" ON driver_location_history
  FOR ALL TO authenticated
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

----------------------------------------------------------------------
-- 10. driver_push_subscriptions — Web Push registration store.
----------------------------------------------------------------------

CREATE TABLE driver_push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id uuid NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  endpoint text NOT NULL,
  subscription_json jsonb NOT NULL,
  user_agent text,
  created_at timestamptz DEFAULT NOW(),
  UNIQUE(driver_id, endpoint)
);

CREATE INDEX idx_push_subscriptions_driver
  ON driver_push_subscriptions(driver_id);

ALTER TABLE driver_push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "push_subs_owner_read" ON driver_push_subscriptions
  FOR SELECT TO authenticated
  USING (client_id = get_current_client_id());

CREATE POLICY "push_subs_driver_write" ON driver_push_subscriptions
  FOR ALL TO authenticated
  USING (driver_id IN (SELECT id FROM drivers WHERE user_id = auth.uid()))
  WITH CHECK (driver_id IN (SELECT id FROM drivers WHERE user_id = auth.uid()));

CREATE POLICY "push_subs_admin_all" ON driver_push_subscriptions
  FOR ALL TO authenticated
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

----------------------------------------------------------------------
-- 11. Triggers.
----------------------------------------------------------------------

-- Shared updated_at helper, reused if other Session 36/37 tables ever
-- need it.
CREATE OR REPLACE FUNCTION update_dispatch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS dispatch_jobs_updated_at ON dispatch_jobs;
CREATE TRIGGER dispatch_jobs_updated_at
  BEFORE UPDATE ON dispatch_jobs
  FOR EACH ROW EXECUTE FUNCTION update_dispatch_updated_at();

DROP TRIGGER IF EXISTS drivers_updated_at ON drivers;
CREATE TRIGGER drivers_updated_at
  BEFORE UPDATE ON drivers
  FOR EACH ROW EXECUTE FUNCTION update_dispatch_updated_at();

-- Auto-generate job_number on insert. Format: TM-YYYY-NNNN where
-- NNNN is a per-business sequential counter (does not reset on year
-- rollover — keeps the counter monotonic across the business's
-- lifetime). Counter increment uses UPDATE...RETURNING for atomicity.
CREATE OR REPLACE FUNCTION generate_dispatch_job_number()
RETURNS TRIGGER AS $$
DECLARE
  counter integer;
BEGIN
  IF NEW.job_number IS NOT NULL THEN
    RETURN NEW;
  END IF;
  UPDATE businesses
     SET dispatch_job_counter = COALESCE(dispatch_job_counter, 0) + 1
   WHERE id = NEW.client_id
   RETURNING dispatch_job_counter INTO counter;
  NEW.job_number := 'TM-' || TO_CHAR(NOW(), 'YYYY') || '-' || LPAD(counter::text, 4, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS dispatch_job_number_trigger ON dispatch_jobs;
CREATE TRIGGER dispatch_job_number_trigger
  BEFORE INSERT ON dispatch_jobs
  FOR EACH ROW EXECUTE FUNCTION generate_dispatch_job_number();

----------------------------------------------------------------------
-- 12. Storage bucket: dispatch-media.
----------------------------------------------------------------------

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'dispatch-media',
  'dispatch-media',
  false,
  10485760, -- 10 MB
  ARRAY['image/jpeg','image/png','image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Storage paths used by the driver app:
--   {client_id}/{job_id}/pickup/{uuid}.jpg
--   {client_id}/{job_id}/delivery/{uuid}.jpg
--   {client_id}/{job_id}/damage/{uuid}.jpg
--   {client_id}/{job_id}/signatures/pickup.png
--   {client_id}/{job_id}/signatures/delivery.png

DROP POLICY IF EXISTS "dispatch_media_owner_all" ON storage.objects;
CREATE POLICY "dispatch_media_owner_all" ON storage.objects
  FOR ALL TO authenticated
  USING (
    bucket_id = 'dispatch-media'
    AND (storage.foldername(name))[1] = get_current_client_id()::text
  )
  WITH CHECK (
    bucket_id = 'dispatch-media'
    AND (storage.foldername(name))[1] = get_current_client_id()::text
  );

-- Drivers can read/write only files for jobs they are assigned to.
-- The job_id is the SECOND folder in the path; we look it up to
-- verify the driver matches.
DROP POLICY IF EXISTS "dispatch_media_driver_rw" ON storage.objects;
CREATE POLICY "dispatch_media_driver_rw" ON storage.objects
  FOR ALL TO authenticated
  USING (
    bucket_id = 'dispatch-media'
    AND EXISTS (
      SELECT 1 FROM dispatch_jobs dj
      JOIN drivers dr ON dr.id = dj.driver_id
      WHERE dr.user_id = auth.uid()
        AND dj.id::text = (storage.foldername(name))[2]
    )
  )
  WITH CHECK (
    bucket_id = 'dispatch-media'
    AND EXISTS (
      SELECT 1 FROM dispatch_jobs dj
      JOIN drivers dr ON dr.id = dj.driver_id
      WHERE dr.user_id = auth.uid()
        AND dj.id::text = (storage.foldername(name))[2]
    )
  );

DROP POLICY IF EXISTS "dispatch_media_admin_all" ON storage.objects;
CREATE POLICY "dispatch_media_admin_all" ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'dispatch-media' AND is_super_admin())
  WITH CHECK (bucket_id = 'dispatch-media' AND is_super_admin());

----------------------------------------------------------------------
-- 13. Extend sms_log.sms_type CHECK with the 5 new dispatch types.
----------------------------------------------------------------------
-- Full superset — listed explicitly so a reader sees the complete
-- valid set in one place.

ALTER TABLE sms_log DROP CONSTRAINT IF EXISTS sms_log_sms_type_check;
ALTER TABLE sms_log ADD CONSTRAINT sms_log_sms_type_check
  CHECK (sms_type = ANY (ARRAY[
    'booking_confirmation'::text,
    'booking_reminder_24h'::text,
    'booking_reminder_2h'::text,
    'booking_cancellation'::text,
    'waitlist_offer'::text,
    'waitlist_claimed'::text,
    'waitlist_expired'::text,
    'callback_reminder'::text,
    'vip_missed_call'::text,
    'call_intelligence_alert'::text,
    'dropped_call_recovery'::text,
    'early_hangup_recovery'::text,
    'missed_lead_recovery'::text,
    'callback_confirmation'::text,
    'dispatcher_callback_alert'::text,
    'other'::text,
    'dispatcher_job_notification'::text,
    'booking_received'::text,
    'booking_confirmed'::text,
    'booking_declined'::text,
    'dispatcher_reminder'::text,
    'owner_booking_notification'::text,
    -- Sessions 36-37 (this migration):
    'dispatch_driver_invite'::text,
    'dispatch_driver_job_notification'::text,
    'dispatch_customer_accepted'::text,
    'dispatch_customer_en_route'::text,
    'dispatch_customer_completed'::text
  ]));
