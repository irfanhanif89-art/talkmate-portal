-- ============================================================
-- MIGRATION: NNN_[feature_name].sql   CREATED: [YYYY-MM-DD]
-- PURPOSE:   [what this migration does]
-- Claim the TRUE next number at build time (check supabase/migrations/ +
-- SYSTEM_MAP.md "Next migration number"). Never copy an old number.
-- ============================================================

-- Step 1: Create the table
CREATE TABLE IF NOT EXISTS [table_name] (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  -- [add your columns here]
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Step 2: REQUIRED — enable RLS (never skip this).
-- `npm run rls-audit` runs the live Supabase advisor and FAILS the build if any
-- public table is RLS-disabled or RLS-enabled-with-no-policy.
ALTER TABLE [table_name] ENABLE ROW LEVEL SECURITY;

-- Step 3: Add a policy. The RLS helper lives in the PRIVATE schema — ALWAYS
-- qualify it as private.get_current_client_id(). An unqualified get_current_client_id()
-- resolves in `private`, not `public`, and throws for anon/authenticated → it locks
-- legitimate users out. Pick the ownership column that actually exists on this table
-- (client_id vs business_id vs user_id — there is NO universal column).

-- Pattern A: Client-owned (most common)
CREATE POLICY "[table_name]_client_policy"
ON [table_name]
FOR ALL
USING (client_id = private.get_current_client_id());

-- Pattern A2: ownership column is business_id (e.g. calls)
-- CREATE POLICY "[table_name]_client_policy" ON [table_name]
--   FOR ALL USING (business_id = private.get_current_client_id());

-- Pattern B: User-owned
-- CREATE POLICY "[table_name]_user_policy" ON [table_name]
--   FOR ALL USING (user_id = auth.uid());

-- Pattern C: Admin/system/debug — service-role-only (deny anon + authenticated).
-- service_role bypasses RLS automatically. This is the explicit-deny form used
-- across migrations 054/055/082.
-- CREATE POLICY "service_role_only" ON [table_name]
--   AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

-- Pattern D: Public read, no write
-- CREATE POLICY "[table_name]_public_read" ON [table_name] FOR SELECT USING (true);

-- Step 4: Indexes (add as needed)
-- CREATE INDEX IF NOT EXISTS [table_name]_client_id_idx ON [table_name](client_id);
-- CREATE INDEX IF NOT EXISTS [table_name]_created_at_idx ON [table_name](created_at DESC);

-- Step 5: updated_at trigger (if the table has updated_at)
-- CREATE TRIGGER update_[table_name]_updated_at
--   BEFORE UPDATE ON [table_name]
--   FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
