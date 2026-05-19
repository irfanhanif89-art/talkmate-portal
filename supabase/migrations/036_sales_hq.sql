-- =============================================
-- SALES HQ — MIGRATION 036
-- Adds the sales rep portal: teams, reps, leads, activities,
-- commissions, contracts. Plus the helper functions the RLS
-- policies and API routes rely on.
--
-- Run on PREVIEW Supabase only during development.
-- Production run handled by Donna after merge to main.
--
-- DEVIATIONS FROM ORIGINAL BRIEF (documented in DEPLOYMENT.md):
--   1. Brief references `profiles` table — this codebase uses
--      `users`. We add `sales_rep` as an allowed value for
--      `users.role` (additive, no constraint changes needed
--      since the column has no CHECK).
--   2. Brief references `businesses.owner_id` — actual column
--      is `owner_user_id`. Used correctly in the onboard route.
--   3. RLS admin checks: codebase admin is identified by email
--      allowlist (hello@talkmate.com.au, irfanhanif89@gmail.com)
--      not by a role column. We introduce is_super_admin() and
--      service-role bypass on admin tables, matching migration
--      011's pattern.
-- =============================================

-- =============================================
-- 0a. Extend businesses.onboarded_by to allow 'sales_rep'
--     (migration 011 set the original CHECK).
-- =============================================
ALTER TABLE businesses DROP CONSTRAINT IF EXISTS businesses_onboarded_by_check;
ALTER TABLE businesses ADD CONSTRAINT businesses_onboarded_by_check
  CHECK (onboarded_by IN ('self', 'admin', 'partner', 'sales_rep'));

-- =============================================
-- 0b. Helper functions
-- =============================================

CREATE OR REPLACE FUNCTION is_super_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM auth.users
    WHERE id = auth.uid()
      AND lower(email) IN (
        'hello@talkmate.com.au',
        'irfanhanif89@gmail.com'
      )
  );
$$;

CREATE OR REPLACE FUNCTION current_rep_id()
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT id FROM sales_reps
   WHERE user_id = auth.uid()
     AND status = 'active'
   LIMIT 1;
$$;

-- =============================================
-- 1. Teams
-- =============================================
CREATE TABLE IF NOT EXISTS sales_teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL DEFAULT 'TalkMate Sales',
  organisation_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE sales_teams ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sales_teams_admin_all" ON sales_teams;
CREATE POLICY "sales_teams_admin_all" ON sales_teams
  FOR ALL USING (is_super_admin());

DROP POLICY IF EXISTS "sales_teams_rep_select" ON sales_teams;
CREATE POLICY "sales_teams_rep_select" ON sales_teams
  FOR SELECT USING (
    id IN (SELECT team_id FROM sales_reps WHERE user_id = auth.uid())
  );

INSERT INTO sales_teams (name)
SELECT 'TalkMate Sales'
WHERE NOT EXISTS (SELECT 1 FROM sales_teams);

-- =============================================
-- 2. Sales reps
-- =============================================
CREATE TABLE IF NOT EXISTS sales_reps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  team_id UUID REFERENCES sales_teams(id) ON DELETE SET NULL,
  organisation_id UUID,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'inactive')),
  commission_policy_version TEXT NOT NULL DEFAULT 'v1',
  policy_acknowledged_at TIMESTAMPTZ,
  contract_signed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id)
);

ALTER TABLE sales_reps ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sales_reps_self_select" ON sales_reps;
CREATE POLICY "sales_reps_self_select" ON sales_reps
  FOR SELECT USING (user_id = auth.uid());

-- Rep can update their own row but only via API; policy is needed
-- so the policy_acknowledged_at update from the rep session works.
DROP POLICY IF EXISTS "sales_reps_self_update" ON sales_reps;
CREATE POLICY "sales_reps_self_update" ON sales_reps
  FOR UPDATE USING (user_id = auth.uid());

DROP POLICY IF EXISTS "sales_reps_admin_all" ON sales_reps;
CREATE POLICY "sales_reps_admin_all" ON sales_reps
  FOR ALL USING (is_super_admin());

-- =============================================
-- 3. Leads
-- =============================================
CREATE TABLE IF NOT EXISTS leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assigned_to UUID REFERENCES sales_reps(id) ON DELETE SET NULL,
  assigned_by UUID REFERENCES auth.users(id),
  assigned_at TIMESTAMPTZ DEFAULT NOW(),
  business_name TEXT NOT NULL,
  contact_name TEXT,
  phone TEXT,
  email TEXT,
  industry TEXT,
  suburb TEXT,
  state TEXT DEFAULT 'QLD',
  website TEXT,
  source TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'contacted', 'demo_booked', 'demo_done',
                      'proposal_sent', 'won', 'lost', 'nurture', 'bad_lead')),
  bad_lead_reason TEXT,
  lost_reason TEXT CHECK (lost_reason IN (
    'not_interested', 'too_expensive', 'competitor_chosen', 'bad_timing',
    'no_decision_maker', 'unreachable', 'already_a_client', 'other'
  )),
  won_at TIMESTAMPTZ,
  won_plan TEXT CHECK (won_plan IN ('starter', 'growth', 'pro')),
  business_id UUID REFERENCES businesses(id) ON DELETE SET NULL,
  approval_status TEXT DEFAULT 'pending'
    CHECK (approval_status IN ('pending', 'approved', 'rejected')),
  approval_notes TEXT,
  approved_by UUID REFERENCES auth.users(id),
  approved_at TIMESTAMPTZ,
  organisation_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE leads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "leads_rep_select" ON leads;
CREATE POLICY "leads_rep_select" ON leads
  FOR SELECT USING (assigned_to = current_rep_id());

DROP POLICY IF EXISTS "leads_rep_update" ON leads;
CREATE POLICY "leads_rep_update" ON leads
  FOR UPDATE USING (assigned_to = current_rep_id());

DROP POLICY IF EXISTS "leads_admin_all" ON leads;
CREATE POLICY "leads_admin_all" ON leads
  FOR ALL USING (is_super_admin());

-- =============================================
-- 4. Lead activities (insert-only audit log)
-- =============================================
CREATE TABLE IF NOT EXISTS lead_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  rep_id UUID REFERENCES sales_reps(id) ON DELETE SET NULL,
  activity_type TEXT NOT NULL
    CHECK (activity_type IN ('note', 'call', 'email', 'demo', 'proposal',
                             'status_change', 'system', 'approval')),
  title TEXT NOT NULL,
  body TEXT,
  old_status TEXT,
  new_status TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE lead_activities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "lead_activities_rep_select" ON lead_activities;
CREATE POLICY "lead_activities_rep_select" ON lead_activities
  FOR SELECT USING (
    rep_id = current_rep_id()
    OR lead_id IN (SELECT id FROM leads WHERE assigned_to = current_rep_id())
  );

DROP POLICY IF EXISTS "lead_activities_rep_insert" ON lead_activities;
CREATE POLICY "lead_activities_rep_insert" ON lead_activities
  FOR INSERT WITH CHECK (rep_id = current_rep_id());

DROP POLICY IF EXISTS "lead_activities_admin_all" ON lead_activities;
CREATE POLICY "lead_activities_admin_all" ON lead_activities
  FOR ALL USING (is_super_admin());

-- =============================================
-- 5. Commissions (insert-only for reps; admin manages lifecycle)
-- =============================================
CREATE TABLE IF NOT EXISTS commissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rep_id UUID NOT NULL REFERENCES sales_reps(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  business_id UUID REFERENCES businesses(id) ON DELETE SET NULL,
  plan TEXT NOT NULL CHECK (plan IN ('starter', 'growth', 'pro')),
  commission_amount NUMERIC(10,2) NOT NULL,
  policy_version TEXT NOT NULL DEFAULT 'v1',
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'paid', 'revoked')),
  revoke_reason TEXT,
  approved_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  payment_reference TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE commissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "commissions_rep_select" ON commissions;
CREATE POLICY "commissions_rep_select" ON commissions
  FOR SELECT USING (rep_id = current_rep_id());

DROP POLICY IF EXISTS "commissions_admin_all" ON commissions;
CREATE POLICY "commissions_admin_all" ON commissions
  FOR ALL USING (is_super_admin());

-- =============================================
-- 6. Rep contracts
-- =============================================
CREATE TABLE IF NOT EXISTS rep_contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rep_id UUID NOT NULL REFERENCES sales_reps(id) ON DELETE CASCADE,
  document_name TEXT NOT NULL,
  document_path TEXT NOT NULL,
  policy_version TEXT NOT NULL DEFAULT 'v1',
  status TEXT NOT NULL DEFAULT 'pending_signature'
    CHECK (status IN ('pending_signature', 'signed', 'superseded')),
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  signed_at TIMESTAMPTZ,
  signer_name TEXT,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE rep_contracts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rep_contracts_rep_select" ON rep_contracts;
CREATE POLICY "rep_contracts_rep_select" ON rep_contracts
  FOR SELECT USING (rep_id = current_rep_id());

DROP POLICY IF EXISTS "rep_contracts_admin_all" ON rep_contracts;
CREATE POLICY "rep_contracts_admin_all" ON rep_contracts
  FOR ALL USING (is_super_admin());

-- Note: rep contract signing is API-only (service-role bypass)
-- so reps cannot directly UPDATE the row. This prevents a rep
-- from setting status='signed' without going through the API
-- that captures signer_name, ip_address, user_agent.

-- =============================================
-- 7. Indexes
-- =============================================
CREATE INDEX IF NOT EXISTS idx_leads_assigned_to ON leads(assigned_to);
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_approval_status ON leads(approval_status);
CREATE INDEX IF NOT EXISTS idx_leads_business_id ON leads(business_id);
CREATE INDEX IF NOT EXISTS idx_lead_activities_lead_id ON lead_activities(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_activities_rep_id ON lead_activities(rep_id);
CREATE INDEX IF NOT EXISTS idx_commissions_rep_id ON commissions(rep_id);
CREATE INDEX IF NOT EXISTS idx_commissions_status ON commissions(status);
CREATE INDEX IF NOT EXISTS idx_commissions_lead_id ON commissions(lead_id);
CREATE INDEX IF NOT EXISTS idx_rep_contracts_rep_id ON rep_contracts(rep_id);
CREATE INDEX IF NOT EXISTS idx_sales_reps_user_id ON sales_reps(user_id);
CREATE INDEX IF NOT EXISTS idx_sales_reps_status ON sales_reps(status);

-- =============================================
-- 8. updated_at triggers
-- =============================================
CREATE OR REPLACE FUNCTION update_sales_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sales_reps_updated_at ON sales_reps;
CREATE TRIGGER sales_reps_updated_at
  BEFORE UPDATE ON sales_reps
  FOR EACH ROW EXECUTE FUNCTION update_sales_updated_at();

DROP TRIGGER IF EXISTS leads_updated_at ON leads;
CREATE TRIGGER leads_updated_at
  BEFORE UPDATE ON leads
  FOR EACH ROW EXECUTE FUNCTION update_sales_updated_at();

-- =============================================
-- 9. Storage bucket for rep contracts
-- =============================================
-- Create bucket + policies. Existing buckets are unchanged.
INSERT INTO storage.buckets (id, name, public)
VALUES ('rep-contracts', 'rep-contracts', false)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS: admin (service-role) writes; reps read only their own
-- folder. The bucket is private — clients always go through signed URLs
-- served by /api/sales/storage/contract-url.
DROP POLICY IF EXISTS "rep_contracts_admin_all" ON storage.objects;
CREATE POLICY "rep_contracts_admin_all" ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'rep-contracts' AND is_super_admin())
  WITH CHECK (bucket_id = 'rep-contracts' AND is_super_admin());

DROP POLICY IF EXISTS "rep_contracts_rep_read" ON storage.objects;
CREATE POLICY "rep_contracts_rep_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'rep-contracts'
    AND (storage.foldername(name))[1] = current_rep_id()::text
  );
