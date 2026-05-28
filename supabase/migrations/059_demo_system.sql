-- Migration 059: Session 56 demo system
-- Adds demo_industry + demo_calendly_url to sales_reps
-- Adds is_demo flag to businesses
-- Repurposes existing business ad380eb3 (currently "Towing" owned by hello@talkmate.com.au)
--   as the towing demo business, sets is_demo=true, seeds calls/bookings/services
-- Sets demo_industry='towing' for Navya and Jade
-- Extends rep_notifications type CHECK to include 'demo_booked'

BEGIN;

-- 1. sales_reps additions
ALTER TABLE sales_reps
  ADD COLUMN IF NOT EXISTS demo_industry text,
  ADD COLUMN IF NOT EXISTS demo_calendly_url text;

-- 2. businesses demo flag
ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;

-- Partial index for fast filtering of demo accounts out of admin queries
CREATE INDEX IF NOT EXISTS idx_businesses_is_demo
  ON businesses (is_demo)
  WHERE is_demo = true;

-- 3. Set demo_industry for existing reps
UPDATE sales_reps SET demo_industry = 'towing' WHERE email = 'navya.baiyer@gmail.com';
UPDATE sales_reps SET demo_industry = 'towing' WHERE email = 'jadebarber2812@gmail.com';

-- 4. Repurpose existing business ad380eb3 as the towing demo
-- The hello@talkmate.com.au user (d77d49a8-fc4a-45d1-b3cb-955591647da6) already owns it.
-- owner_user_id is UNIQUE, so we cannot INSERT a new business with the same owner.
-- We UPDATE the existing row to become the canonical demo.
UPDATE businesses
SET
  name = 'Gold Coast Towing (Demo)',
  business_type = 'towing',
  industry = 'towing',
  phone_number = '+61400000000',
  address = '1 Demo Street, Southport QLD 4215',
  plan = 'growth',
  account_status = 'active',
  is_demo = true,
  greeting = 'Thanks for calling Gold Coast Towing, this is Sarah. How can I help you?',
  services = '[
    {"id":"svc-tow","name":"Tow Truck Dispatch","description":"Standard tow to any location on the Gold Coast and surrounds","price":120,"duration_minutes":60,"active":true},
    {"id":"svc-jump","name":"Battery Jump Start","description":"On-site battery jump start, any location","price":85,"duration_minutes":30,"active":true},
    {"id":"svc-tyre","name":"Tyre Change","description":"Roadside tyre change with your spare","price":95,"duration_minutes":45,"active":true},
    {"id":"svc-lockout","name":"Lockout Service","description":"Vehicle lockout assistance, non-destructive entry","price":110,"duration_minutes":30,"active":true},
    {"id":"svc-fuel","name":"Fuel Delivery","description":"Emergency fuel delivery, up to 10L","price":75,"duration_minutes":20,"active":true}
  ]'::jsonb
WHERE id = 'ad380eb3-a0b5-4566-9107-e0b075ac48e8';

-- 5. Seed 10 demo calls (idempotent -- skip if already present)
INSERT INTO calls (id, business_id, caller_number, caller_name, outcome, duration_seconds, created_at, started_at, ended_at, summary)
SELECT * FROM (VALUES
  ('de0a0c01-0000-0000-0000-000000000001'::uuid, 'ad380eb3-a0b5-4566-9107-e0b075ac48e8'::uuid, '+61412345001', 'Mark Thompson',  'Booking Taken',  187, now() - interval '2 hours',                  now() - interval '2 hours',                  now() - interval '2 hours' + interval '187 seconds', 'Caller requested tow from Pacific Fair to Nerang workshop. Job booked and SMS confirmation sent.'),
  ('de0a0c01-0000-0000-0000-000000000002'::uuid, 'ad380eb3-a0b5-4566-9107-e0b075ac48e8'::uuid, '+61412345002', 'Sarah Jenkins',  'Booking Taken',  143, now() - interval '4 hours',                  now() - interval '4 hours',                  now() - interval '4 hours' + interval '143 seconds', 'Battery jump start requested at Robina Town Centre car park. Job booked.'),
  ('de0a0c01-0000-0000-0000-000000000003'::uuid, 'ad380eb3-a0b5-4566-9107-e0b075ac48e8'::uuid, '+61412345003', 'Chris Nguyen',   'Missed',          0,  now() - interval '6 hours',                  now() - interval '6 hours',                  now() - interval '6 hours',                          NULL),
  ('de0a0c01-0000-0000-0000-000000000004'::uuid, 'ad380eb3-a0b5-4566-9107-e0b075ac48e8'::uuid, '+61412345004', 'Emma Walsh',     'Booking Taken',  201, now() - interval '1 day',                    now() - interval '1 day',                    now() - interval '1 day' + interval '201 seconds',   'Tyre change requested on M1 near Yatala. After hours job, owner notified via SMS.'),
  ('de0a0c01-0000-0000-0000-000000000005'::uuid, 'ad380eb3-a0b5-4566-9107-e0b075ac48e8'::uuid, '+61412345005', 'Dave Kowalski',  'Quote Provided',  95, now() - interval '1 day' - interval '2 hours', now() - interval '1 day' - interval '2 hours', now() - interval '1 day' - interval '2 hours' + interval '95 seconds', 'Caller asked for tow quote from Surfers Paradise to Brisbane CBD. Quote provided: $220.'),
  ('de0a0c01-0000-0000-0000-000000000006'::uuid, 'ad380eb3-a0b5-4566-9107-e0b075ac48e8'::uuid, '+61412345006', 'Priya Sharma',   'Missed',          0,  now() - interval '2 days',                   now() - interval '2 days',                   now() - interval '2 days',                           NULL),
  ('de0a0c01-0000-0000-0000-000000000007'::uuid, 'ad380eb3-a0b5-4566-9107-e0b075ac48e8'::uuid, '+61412345007', 'Tom Fletcher',   'Booking Taken',  167, now() - interval '2 days' - interval '3 hours', now() - interval '2 days' - interval '3 hours', now() - interval '2 days' - interval '3 hours' + interval '167 seconds', 'Lockout service at Broadbeach Waters. Job booked for 20 min ETA.'),
  ('de0a0c01-0000-0000-0000-000000000008'::uuid, 'ad380eb3-a0b5-4566-9107-e0b075ac48e8'::uuid, '+61412345008', 'Lisa Monroe',    'Booking Taken',  220, now() - interval '3 days',                   now() - interval '3 days',                   now() - interval '3 days' + interval '220 seconds',  'Tow from Helensvale to Varsity Lakes. Two-truck job. Booked and confirmed.'),
  ('de0a0c01-0000-0000-0000-000000000009'::uuid, 'ad380eb3-a0b5-4566-9107-e0b075ac48e8'::uuid, '+61412345009', 'Ryan O''Brien',  'Escalated',       78, now() - interval '3 days' - interval '1 hour', now() - interval '3 days' - interval '1 hour', now() - interval '3 days' - interval '1 hour' + interval '78 seconds', 'Caller requested emergency tow after accident on Pacific Highway. Escalated to owner mobile immediately.'),
  ('de0a0c01-0000-0000-0000-000000000010'::uuid, 'ad380eb3-a0b5-4566-9107-e0b075ac48e8'::uuid, '+61412345010', 'Natalie Cross',  'Quote Provided', 112, now() - interval '4 days',                   now() - interval '4 days',                   now() - interval '4 days' + interval '112 seconds',  'Interstate tow quote requested. Gold Coast to Sydney. Quote: $1,450. Caller said they would call back.')
) AS v(id, business_id, caller_number, caller_name, outcome, duration_seconds, created_at, started_at, ended_at, summary)
WHERE NOT EXISTS (SELECT 1 FROM calls WHERE id = v.id);

-- 6. Seed 3 demo bookings (client_id is the FK to businesses; caller_phone NOT NULL)
INSERT INTO bookings (id, client_id, caller_phone, caller_name, truck_type, description, pickup_address, dropoff_address, scheduled_start, status, booking_source, created_at)
SELECT * FROM (VALUES
  ('de0a0b01-0000-0000-0000-000000000001'::uuid, 'ad380eb3-a0b5-4566-9107-e0b075ac48e8'::uuid, '+61412345001', 'Mark Thompson',  'Flat Tray',   'Standard tow - vehicle not starting',         '45 Pacific Fair Drive, Broadbeach QLD 4218', '12 Workshop Lane, Nerang QLD 4211',  now() + interval '45 minutes', 'confirmed', 'agent', now() - interval '2 hours'),
  ('de0a0b01-0000-0000-0000-000000000002'::uuid, 'ad380eb3-a0b5-4566-9107-e0b075ac48e8'::uuid, '+61412345002', 'Sarah Jenkins',  'Service Van', 'Battery jump start',                          'Robina Town Centre, 19 Robina Town Centre Drive, Robina QLD 4226', 'On-site service', now() + interval '20 minutes', 'confirmed', 'agent', now() - interval '4 hours'),
  ('de0a0b01-0000-0000-0000-000000000003'::uuid, 'ad380eb3-a0b5-4566-9107-e0b075ac48e8'::uuid, '+61412345004', 'Emma Walsh',     'Flat Tray',   'Tyre change - blowout on highway',            'M1 Pacific Motorway near Yatala Exit, QLD 4207', 'Roadside service', now() - interval '2 hours', 'completed', 'agent', now() - interval '1 day')
) AS v(id, client_id, caller_phone, caller_name, truck_type, description, pickup_address, dropoff_address, scheduled_start, status, booking_source, created_at)
WHERE NOT EXISTS (SELECT 1 FROM bookings WHERE id = v.id);

-- 7. Extend rep_notifications type CHECK to include 'demo_booked'
ALTER TABLE rep_notifications DROP CONSTRAINT IF EXISTS rep_notifications_type_check;
ALTER TABLE rep_notifications
  ADD CONSTRAINT rep_notifications_type_check
  CHECK (type IN (
    'proposal_opened',
    'followup_due',
    'deal_reassigned',
    'commission_updated',
    'new_lead_assigned',
    'demo_booked'
  ));

COMMIT;
