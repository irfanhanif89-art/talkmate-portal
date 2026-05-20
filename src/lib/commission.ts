// Commission rates — single source of truth. Hardcoded server-side
// because clients must never be able to influence the amount that
// gets written to the commissions table.
//
// Session 22: annual closes earn a 2.5% bonus on top of the base
// commission (bonus = annual contract value × 0.025). The bonus is
// inserted into commissions.bonus_amount; the base remains in
// commissions.commission_amount.

export type CommissionPlan = 'starter' | 'growth' | 'pro'
export type BillingCycle = 'monthly' | 'annual'

export const COMMISSION_MAP: Record<CommissionPlan, { base: number; annual_bonus: number }> = {
  starter: { base: 299, annual_bonus: 74.75 },  //  2,990 × 2.5%
  growth:  { base: 349, annual_bonus: 124.75 }, //  4,990 × 2.5%
  pro:     { base: 399, annual_bonus: 199.75 }, //  7,990 × 2.5%
}

export const COMMISSION_POLICY_VERSION = 'v1'

export function getCommissionBase(plan: string): number | null {
  if (isCommissionPlan(plan)) return COMMISSION_MAP[plan].base
  return null
}

export function getAnnualBonus(plan: string): number | null {
  if (isCommissionPlan(plan)) return COMMISSION_MAP[plan].annual_bonus
  return null
}

// Total payable commission for a close. Bonus only applies when
// billing_cycle === 'annual'.
export function getCommissionTotal(plan: string, billing_cycle: BillingCycle): number | null {
  if (!isCommissionPlan(plan)) return null
  const base = COMMISSION_MAP[plan].base
  const bonus = billing_cycle === 'annual' ? COMMISSION_MAP[plan].annual_bonus : 0
  return base + bonus
}

export function isCommissionPlan(value: unknown): value is CommissionPlan {
  return value === 'starter' || value === 'growth' || value === 'pro'
}

export function isBillingCycle(value: unknown): value is BillingCycle {
  return value === 'monthly' || value === 'annual'
}

// Backwards-compatibility helper for call sites that still need a
// scalar amount when no cycle is known. Returns the base only.
// New code should call getCommissionTotal(plan, cycle) explicitly.
export function getCommissionAmount(plan: string): number | null {
  return getCommissionBase(plan)
}
