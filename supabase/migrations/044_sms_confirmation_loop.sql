-- Migration 044: Session 29 — Hayden SMS confirmation loop
--
-- Adds the dispatcher-confirmation loop for booking creation:
-- caller is told "received", dispatcher is texted from a dedicated
-- Twilio number and replies YES/NO, the booking is then either
-- confirmed or declined, and the caller gets a follow-up SMS. A 15-min
-- reminder fires if the dispatcher hasn't replied.
--
-- All statements idempotent so the migration is safe to re-run.

-- ─── Step 1: Extend bookings.status to include 'declined' ───────────
-- MUST run before any code writes 'declined' to the column. The
-- existing constraint allows: pending, confirmed, cancelled,
-- completed, no_show. We re-create with 'declined' added.
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_status_check;
ALTER TABLE bookings ADD CONSTRAINT bookings_status_check
  CHECK (status = ANY (ARRAY[
    'pending'::text,
    'confirmed'::text,
    'cancelled'::text,
    'completed'::text,
    'no_show'::text,
    'declined'::text
  ]));

-- ─── Step 2: Extend sms_log.sms_type with the 5 new types ───────────
-- Full superset of the existing constraint plus the new types this
-- session introduces. Listed explicitly rather than diff-style so a
-- future reader can see the complete valid set.
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
    -- Session 29 (new):
    'dispatcher_job_notification'::text,
    'booking_received'::text,
    'booking_confirmed'::text,
    'booking_declined'::text,
    'dispatcher_reminder'::text
  ]));

-- ─── Step 3: New columns on bookings ────────────────────────────────
-- confirmed_at already exists (Session 15) — do NOT re-add.
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS confirmation_ref TEXT,
  ADD COLUMN IF NOT EXISTS dispatcher_notified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS confirmed_by_phone TEXT;

-- ─── Step 4: Indexes ────────────────────────────────────────────────
-- Unique on confirmation_ref so two bookings can never share a ref
-- (we'd never find the right one in the sms-reply webhook). Partial
-- so existing rows with NULL refs are unaffected.
CREATE UNIQUE INDEX IF NOT EXISTS idx_bookings_confirmation_ref
  ON bookings(confirmation_ref)
  WHERE confirmation_ref IS NOT NULL;

-- Speeds up the 15-min reminder sweep added to the sms-reminders cron
-- in this session. Partial WHERE keeps the index small — once a
-- booking is confirmed/declined/cancelled it never re-enters the
-- pending sweep, so the index can stay scoped to pending rows.
CREATE INDEX IF NOT EXISTS idx_bookings_pending_dispatcher
  ON bookings(dispatcher_notified_at, reminder_sent_at, status)
  WHERE status = 'pending';
