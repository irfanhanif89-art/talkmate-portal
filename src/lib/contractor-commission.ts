// Server-side commission rate table for the contractor flow.
// Never read commission amounts from client input - look them up
// here so the agreement, the API, and the admin UI all agree.

export type ContractorPlan = 'starter' | 'growth' | 'pro'
export type ContractorBilling = 'monthly' | 'annual'

export const CONTRACTOR_COMMISSION_MAP: Record<ContractorPlan, Record<ContractorBilling, number>> = {
  starter: { monthly: 299, annual: 373.75 },
  growth:  { monthly: 349, annual: 473.75 },
  pro:     { monthly: 399, annual: 598.75 },
}

export function getCommissionAmount(plan: ContractorPlan, billing: ContractorBilling): number {
  return CONTRACTOR_COMMISSION_MAP[plan][billing]
}

export function isContractorPlan(v: unknown): v is ContractorPlan {
  return v === 'starter' || v === 'growth' || v === 'pro'
}

export function isContractorBilling(v: unknown): v is ContractorBilling {
  return v === 'monthly' || v === 'annual'
}

// Clawback period is fixed at 14 days from sale.
export function clawbackEndsAt(saleDate: Date = new Date()): Date {
  const d = new Date(saleDate)
  d.setDate(d.getDate() + 14)
  return d
}
