-- 046_drop_legacy_bookings_columns.sql
--
-- PRE-MIGRATION CHECKS (Donna runs these manually BEFORE applying this migration):
--
-- Check 1: Rows where legacy SMS flag is set but modern flag is not
--   SELECT COUNT(*) FROM bookings
--   WHERE confirmation_sms_sent = true
--   AND sms_confirmation_sent IS DISTINCT FROM true;
--   Expected: 0 (all modern writes since Session 15 use sms_confirmation_sent)
--
-- Check 2: Rows that would lose scheduling data
--   SELECT COUNT(*) FROM bookings
--   WHERE preferred_date IS NOT NULL AND scheduled_start IS NULL;
--   Expected: 0 (agent bookings use scheduled_start)
--
-- Check 3: Rows that would lose service categorisation
--   SELECT COUNT(*) FROM bookings
--   WHERE (service_requested IS NOT NULL OR booking_type IS NOT NULL)
--   AND truck_type IS NULL AND description IS NULL;
--   Expected: 0
--   If > 0, run before migration:
--     UPDATE bookings
--        SET description = COALESCE(description, service_requested, booking_type)
--      WHERE description IS NULL
--        AND (service_requested IS NOT NULL OR booking_type IS NOT NULL);
--
-- Check 4: Rows that would lose notes
--   SELECT COUNT(*) FROM bookings
--   WHERE notes IS NOT NULL AND description IS NULL;
--   Expected: 0
--
-- If any check returns > 0, run the appropriate backfill below before proceeding.
-- For the two live clients (GM Towing, Spectrum Towing), all bookings are
-- agent-created post-Session-15 and should have modern columns populated.

-- Step 1: Backfill sms_confirmation_sent from legacy flag (idempotent)
UPDATE bookings
   SET sms_confirmation_sent = TRUE
 WHERE sms_confirmation_sent IS NOT TRUE
   AND confirmation_sms_sent = TRUE;

-- Step 2: Backfill description from notes where description is null (idempotent)
UPDATE bookings
   SET description = notes
 WHERE description IS NULL
   AND notes IS NOT NULL;

-- Step 3: Drop the six legacy columns
ALTER TABLE bookings
  DROP COLUMN IF EXISTS confirmation_sms_sent,
  DROP COLUMN IF EXISTS booking_type,
  DROP COLUMN IF EXISTS service_requested,
  DROP COLUMN IF EXISTS preferred_date,
  DROP COLUMN IF EXISTS preferred_time,
  DROP COLUMN IF EXISTS notes;
