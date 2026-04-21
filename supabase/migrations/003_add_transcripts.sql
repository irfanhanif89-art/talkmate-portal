-- Add transcript and recording fields to calls table
ALTER TABLE calls ADD COLUMN IF NOT EXISTS transcript jsonb;
ALTER TABLE calls ADD COLUMN IF NOT EXISTS summary text;
ALTER TABLE calls ADD COLUMN IF NOT EXISTS recording_url text;
ALTER TABLE calls ADD COLUMN IF NOT EXISTS caller_name text;
ALTER TABLE calls ADD COLUMN IF NOT EXISTS ended_reason text;
