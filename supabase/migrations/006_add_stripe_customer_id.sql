-- Add stripe_customer_id to businesses table
-- This column is required by the checkout and Stripe webhook flows.
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS stripe_customer_id text;
CREATE UNIQUE INDEX IF NOT EXISTS businesses_stripe_customer_id_idx ON businesses (stripe_customer_id) WHERE stripe_customer_id IS NOT NULL;
