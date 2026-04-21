-- Add missing columns to businesses table
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS greeting text DEFAULT 'Thank you for calling. How can I help you today?';
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS make_webhook_url text;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS booking_url text;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS voice text DEFAULT 'sarah';
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS tone text DEFAULT 'Professional';

-- Add full_name to users
ALTER TABLE users ADD COLUMN IF NOT EXISTS full_name text;
