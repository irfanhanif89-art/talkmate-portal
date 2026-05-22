-- Session 30 — add owner_booking_notification to sms_log.sms_type
-- check constraint. 21 existing types + 1 new = 22 total.
--
-- Owner notification fires from /api/vapi/functions createBooking when
-- notifications_config.alert_owner = true + owner_number is set.
-- Bypasses plan limits (operational alert the owner relies on).

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
    'owner_booking_notification'::text
  ]));
