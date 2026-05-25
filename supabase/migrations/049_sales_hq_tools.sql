BEGIN;

-- ============================================================
-- Session 41 — Sales HQ Tools (Migration 049)
-- ============================================================
-- 048 is owned by the dispatcher driver app migration from Sessions 36-37.
-- temp_password and welcome_email_sent already exist on businesses (added in 011 and 042);
-- the ADD COLUMN IF NOT EXISTS below is intentionally a no-op for documentation.

-- notification_email on sales_reps
ALTER TABLE public.sales_reps
  ADD COLUMN IF NOT EXISTS notification_email text;

-- ============================================================
-- lead_followups
-- ============================================================
CREATE TABLE IF NOT EXISTS public.lead_followups (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id       uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  rep_id        uuid NOT NULL REFERENCES public.sales_reps(id) ON DELETE CASCADE,
  type          text NOT NULL,
  send_at       timestamptz NOT NULL,
  status        text NOT NULL DEFAULT 'pending',
  email_subject text,
  email_body    text,
  dismissed_at  timestamptz,
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now(),
  CONSTRAINT lead_followups_type_check CHECK (type IN ('email', 'call_reminder')),
  CONSTRAINT lead_followups_status_check CHECK (status IN ('pending','sent','dismissed'))
);
ALTER TABLE public.lead_followups ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "lead_followups_rep_select" ON public.lead_followups;
CREATE POLICY "lead_followups_rep_select" ON public.lead_followups
  FOR SELECT USING (rep_id = current_rep_id());
DROP POLICY IF EXISTS "lead_followups_rep_insert" ON public.lead_followups;
CREATE POLICY "lead_followups_rep_insert" ON public.lead_followups
  FOR INSERT WITH CHECK (rep_id = current_rep_id());
DROP POLICY IF EXISTS "lead_followups_rep_update" ON public.lead_followups;
CREATE POLICY "lead_followups_rep_update" ON public.lead_followups
  FOR UPDATE USING (rep_id = current_rep_id()) WITH CHECK (rep_id = current_rep_id());
DROP POLICY IF EXISTS "lead_followups_admin_all" ON public.lead_followups;
CREATE POLICY "lead_followups_admin_all" ON public.lead_followups
  FOR ALL USING (is_super_admin());

-- ============================================================
-- rep_notifications
-- ============================================================
CREATE TABLE IF NOT EXISTS public.rep_notifications (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rep_id     uuid NOT NULL REFERENCES public.sales_reps(id) ON DELETE CASCADE,
  type       text NOT NULL,
  lead_id    uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  message    text NOT NULL,
  read       boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT rep_notifications_type_check CHECK (type IN (
    'proposal_opened','followup_due','deal_reassigned',
    'commission_updated','new_lead_assigned'
  ))
);
ALTER TABLE public.rep_notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "rep_notifications_rep_select" ON public.rep_notifications;
CREATE POLICY "rep_notifications_rep_select" ON public.rep_notifications
  FOR SELECT USING (rep_id = current_rep_id());
DROP POLICY IF EXISTS "rep_notifications_rep_insert" ON public.rep_notifications;
CREATE POLICY "rep_notifications_rep_insert" ON public.rep_notifications
  FOR INSERT WITH CHECK (rep_id = current_rep_id());
DROP POLICY IF EXISTS "rep_notifications_rep_update" ON public.rep_notifications;
CREATE POLICY "rep_notifications_rep_update" ON public.rep_notifications
  FOR UPDATE USING (rep_id = current_rep_id()) WITH CHECK (rep_id = current_rep_id());
DROP POLICY IF EXISTS "rep_notifications_admin_all" ON public.rep_notifications;
CREATE POLICY "rep_notifications_admin_all" ON public.rep_notifications
  FOR ALL USING (is_super_admin());

-- Realtime publication for the notification bell. Idempotent.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'rep_notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.rep_notifications;
  END IF;
END $$;

-- ============================================================
-- proposal_tracking
-- ============================================================
CREATE TABLE IF NOT EXISTS public.proposal_tracking (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id         uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  rep_id          uuid NOT NULL REFERENCES public.sales_reps(id) ON DELETE CASCADE,
  resend_email_id text,
  plan            text NOT NULL,
  opened_at       timestamptz,
  opened_count    integer DEFAULT 0,
  sent_at         timestamptz DEFAULT now(),
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now(),
  CONSTRAINT proposal_tracking_plan_check CHECK (plan IN ('starter','growth','pro'))
);
ALTER TABLE public.proposal_tracking ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "proposal_tracking_rep_select" ON public.proposal_tracking;
CREATE POLICY "proposal_tracking_rep_select" ON public.proposal_tracking
  FOR SELECT USING (rep_id = current_rep_id());
DROP POLICY IF EXISTS "proposal_tracking_rep_insert" ON public.proposal_tracking;
CREATE POLICY "proposal_tracking_rep_insert" ON public.proposal_tracking
  FOR INSERT WITH CHECK (rep_id = current_rep_id());
DROP POLICY IF EXISTS "proposal_tracking_rep_update" ON public.proposal_tracking;
CREATE POLICY "proposal_tracking_rep_update" ON public.proposal_tracking
  FOR UPDATE USING (rep_id = current_rep_id()) WITH CHECK (rep_id = current_rep_id());
DROP POLICY IF EXISTS "proposal_tracking_admin_all" ON public.proposal_tracking;
CREATE POLICY "proposal_tracking_admin_all" ON public.proposal_tracking
  FOR ALL USING (is_super_admin());

-- ============================================================
-- Atomic open-count increment for Resend webhook
-- Returns ZERO rows on no-match (IF FOUND guard prevents NULL row).
-- ============================================================
-- search_path is pinned so the SECURITY DEFINER function can't be tricked
-- into looking at attacker-controlled schemas. EXECUTE is revoked from
-- anon + authenticated because this function is only meant to be called
-- by the service role (via the Resend webhook route using createAdminClient).
CREATE OR REPLACE FUNCTION public.increment_proposal_opens(p_email_id text)
RETURNS TABLE(was_first_open boolean, rep_id uuid, lead_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_was_first boolean;
  v_rep_id uuid;
  v_lead_id uuid;
BEGIN
  UPDATE public.proposal_tracking
     SET opened_count = opened_count + 1,
         opened_at = COALESCE(opened_at, now()),
         updated_at = now()
   WHERE resend_email_id = p_email_id
  RETURNING (opened_count = 1), proposal_tracking.rep_id, proposal_tracking.lead_id
    INTO v_was_first, v_rep_id, v_lead_id;
  IF FOUND THEN
    RETURN QUERY SELECT v_was_first, v_rep_id, v_lead_id;
  END IF;
END $$;
REVOKE EXECUTE ON FUNCTION public.increment_proposal_opens(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.increment_proposal_opens(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.increment_proposal_opens(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.increment_proposal_opens(text) TO service_role;

-- ============================================================
-- businesses additions
-- ============================================================
ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS payment_confirmed_at   timestamptz,
  ADD COLUMN IF NOT EXISTS onboarding_started_at  timestamptz,
  ADD COLUMN IF NOT EXISTS onboarding_completed_by text,
  ADD COLUMN IF NOT EXISTS sales_rep_id           uuid REFERENCES public.sales_reps(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS temp_password          text,
  ADD COLUMN IF NOT EXISTS welcome_email_sent     boolean DEFAULT false;

-- ============================================================
-- client_comms_log: now supports either business_id OR lead_id, plus onboarding_stage
-- ============================================================
ALTER TABLE public.client_comms_log
  ADD COLUMN IF NOT EXISTS onboarding_stage text;

ALTER TABLE public.client_comms_log
  ALTER COLUMN business_id DROP NOT NULL;

ALTER TABLE public.client_comms_log
  ADD COLUMN IF NOT EXISTS lead_id uuid REFERENCES public.leads(id) ON DELETE CASCADE;

-- CHECK constraint guarded by DO block (CHECK constraints don't support IF NOT EXISTS)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'client_comms_log_target_check'
  ) THEN
    ALTER TABLE public.client_comms_log
      ADD CONSTRAINT client_comms_log_target_check
      CHECK (business_id IS NOT NULL OR lead_id IS NOT NULL);
  END IF;
END $$;

-- ============================================================
-- Indexes
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_lead_followups_rep_status
  ON public.lead_followups(rep_id, status);
CREATE INDEX IF NOT EXISTS idx_lead_followups_send_at
  ON public.lead_followups(send_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_lead_followups_call_reminder_active
  ON public.lead_followups(rep_id, send_at)
  WHERE type = 'call_reminder' AND status = 'sent' AND dismissed_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_rep_notifications_rep_read
  ON public.rep_notifications(rep_id, read);
CREATE INDEX IF NOT EXISTS idx_proposal_tracking_lead
  ON public.proposal_tracking(lead_id);
CREATE INDEX IF NOT EXISTS idx_proposal_tracking_resend
  ON public.proposal_tracking(resend_email_id) WHERE resend_email_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_businesses_pending_onboarding
  ON public.businesses(created_at)
  WHERE account_status IN ('pending','pending_payment') AND onboarded_by = 'sales_rep';
CREATE INDEX IF NOT EXISTS idx_leads_won_unconverted
  ON public.leads(assigned_to, won_at)
  WHERE status = 'won' AND business_id IS NULL;

COMMIT;
