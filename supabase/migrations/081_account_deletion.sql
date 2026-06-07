-- 081_account_deletion.sql
-- In-app account deletion (Apple App Store Review Guideline 5.1.1(v)).
--
-- A logged-in user can request deletion from the mobile app. The account is
-- disabled immediately (auth ban + status change) and all personal data is
-- permanently purged after a 30-day grace window by the /api/cron/account-purge
-- cron. These columns track the request; the SQL functions below perform the
-- ordered, transactional purge.
--
-- The purge is SCOPED by the cron to rows where deletion_scheduled_for <= now(),
-- so live customers (who never set these columns) are never touched.

-- ── Tracking columns ─────────────────────────────────────────────────────────
ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS deletion_requested_at  timestamptz,
  ADD COLUMN IF NOT EXISTS deletion_scheduled_for timestamptz;

ALTER TABLE sales_reps
  ADD COLUMN IF NOT EXISTS deletion_requested_at  timestamptz,
  ADD COLUMN IF NOT EXISTS deletion_scheduled_for timestamptz;

COMMENT ON COLUMN businesses.deletion_requested_at  IS 'When the owner requested account deletion from the app. NULL = not requested.';
COMMENT ON COLUMN businesses.deletion_scheduled_for IS 'End of the 30-day grace window; the purge cron deletes the account on/after this time.';
COMMENT ON COLUMN sales_reps.deletion_requested_at  IS 'When the rep requested account deletion from the app. NULL = not requested.';
COMMENT ON COLUMN sales_reps.deletion_scheduled_for IS 'End of the 30-day grace window; the purge cron deletes the account on/after this time.';

-- ── Purge a business account ─────────────────────────────────────────────────
-- Deletes the business and ALL of its data. Most child tables are ON DELETE
-- CASCADE, but a handful reference businesses with NO ACTION and must be
-- cleared first or the businesses DELETE fails. Runs in a single transaction:
-- any unexpected FK rolls the whole thing back (no half-deleted accounts).
-- Returns the owner's auth user id so the caller can delete the auth identity.
CREATE OR REPLACE FUNCTION app_purge_business(p_business_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner uuid;
BEGIN
  SELECT owner_user_id INTO v_owner FROM businesses WHERE id = p_business_id;
  IF v_owner IS NULL THEN
    RETURN NULL;  -- business already gone
  END IF;

  -- Detach any other business that referenced this one as a referrer.
  UPDATE businesses SET referred_by = NULL WHERE referred_by = p_business_id;

  -- NO ACTION children that would otherwise block the businesses delete.
  DELETE FROM appointments           WHERE business_id        = p_business_id;
  DELETE FROM calls                  WHERE business_id        = p_business_id;
  DELETE FROM catalog_items          WHERE business_id        = p_business_id;
  DELETE FROM contractor_commissions WHERE client_business_id = p_business_id;
  DELETE FROM jobs                   WHERE business_id        = p_business_id;
  DELETE FROM notifications          WHERE business_id        = p_business_id;
  DELETE FROM onboarding_responses   WHERE business_id        = p_business_id;
  DELETE FROM orders                 WHERE business_id        = p_business_id;
  DELETE FROM subscriptions          WHERE business_id        = p_business_id;
  DELETE FROM users                  WHERE business_id        = p_business_id;

  -- Owner references on auth.users that would block deleting the auth identity.
  UPDATE leads SET assigned_by = NULL WHERE assigned_by = v_owner;
  UPDATE leads SET approved_by = NULL WHERE approved_by = v_owner;
  DELETE FROM referrals WHERE referred_user_id = v_owner;

  -- Finally the business itself. Remaining children are CASCADE / SET NULL.
  DELETE FROM businesses WHERE id = p_business_id;

  RETURN v_owner;
END;
$$;

COMMENT ON FUNCTION app_purge_business(uuid) IS 'Transactionally deletes a business and all its data; returns owner_user_id for auth-identity deletion. Used by /api/cron/account-purge.';

-- ── Purge a sales-rep account ────────────────────────────────────────────────
-- A rep has no business. Deleting their auth user cascades sales_reps and
-- commissions, but a few NO ACTION references on auth.users must be cleared
-- first. Takes the auth user id directly.
CREATE OR REPLACE FUNCTION app_purge_sales_rep(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM legal_acceptances WHERE user_id = p_user_id;
  UPDATE leads SET assigned_by = NULL WHERE assigned_by = p_user_id;
  UPDATE leads SET approved_by = NULL WHERE approved_by = p_user_id;
  DELETE FROM referrals WHERE referred_user_id = p_user_id;
  DELETE FROM users WHERE id = p_user_id;
  -- sales_reps + commissions are ON DELETE CASCADE from auth.users; the caller
  -- deletes the auth user to trigger that cascade.
END;
$$;

COMMENT ON FUNCTION app_purge_sales_rep(uuid) IS 'Clears NO ACTION references so the caller can delete the rep auth user (which cascades sales_reps + commissions). Used by /api/cron/account-purge.';
