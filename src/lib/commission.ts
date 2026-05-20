// Commission rates — single source of truth. Hardcoded server-side
// because clients must never be able to influence the amount that
// gets written to the commissions table. Both /api/sales/notify-win
// (which creates the pending commission row) and the admin approval
// flow read from this map.

export type CommissionPlan = 'starter' | 'growth' | 'pro'

export const COMMISSION_MAP: Record<CommissionPlan, number> = {
  starter: 299,
  growth: 349,
  pro: 399,
}

export const COMMISSION_POLICY_VERSION = 'v1'

export function getCommissionAmount(plan: string): number | null {
  if (plan === 'starter' || plan === 'growth' || plan === 'pro') {
    return COMMISSION_MAP[plan]
  }
  return null
}

export function isCommissionPlan(value: unknown): value is CommissionPlan {
  return value === 'starter' || value === 'growth' || value === 'pro'
}
