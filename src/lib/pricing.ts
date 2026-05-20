// TalkMate pricing — single source of truth for monthly/annual prices,
// setup fees, and the Stripe price IDs needed at checkout time. Used
// by signup, /subscribe, /api/stripe/embedded-checkout, the admin
// create-client modal, and the client billing display.
//
// Annual price = monthly × 10 (2 months free). Setup fee is one-off,
// added as a separate line item in Stripe checkout unless waived
// by an admin via businesses.setup_fee_waived.

import type { BillingCycle, CommissionPlan } from '@/lib/commission'

export type PricingPlan = CommissionPlan
export type { BillingCycle }

export interface PlanPricing {
  monthly: number      // AUD/month
  annual: number       // AUD/year (10× monthly)
  annual_savings: number  // AUD saved vs. paying monthly for 12 months
  setup_fee: number    // AUD one-off
}

export const PRICING: Record<PricingPlan, PlanPricing> = {
  starter: { monthly: 299, annual: 2990, annual_savings: 598,  setup_fee: 299 },
  growth:  { monthly: 499, annual: 4990, annual_savings: 998,  setup_fee: 349 },
  pro:     { monthly: 799, annual: 7990, annual_savings: 1598, setup_fee: 399 },
}

// Stripe price IDs — Donna creates the corresponding products in the
// Stripe dashboard and adds the env vars. Code uses these lookups
// at checkout time. See DEPLOYMENT.md for the list of env vars.

export function getMonthlyPriceId(plan: PricingPlan): string | undefined {
  switch (plan) {
    case 'starter': return process.env.STRIPE_PRICE_STARTER
    case 'growth':  return process.env.STRIPE_PRICE_GROWTH
    case 'pro':     return process.env.STRIPE_PRICE_PROFESSIONAL
  }
}

export function getAnnualPriceId(plan: PricingPlan): string | undefined {
  switch (plan) {
    case 'starter': return process.env.STRIPE_STARTER_ANNUAL_PRICE_ID
    case 'growth':  return process.env.STRIPE_GROWTH_ANNUAL_PRICE_ID
    case 'pro':     return process.env.STRIPE_PRO_ANNUAL_PRICE_ID
  }
}

export function getSetupPriceId(plan: PricingPlan): string | undefined {
  switch (plan) {
    case 'starter': return process.env.STRIPE_STARTER_SETUP_PRICE_ID
    case 'growth':  return process.env.STRIPE_GROWTH_SETUP_PRICE_ID
    case 'pro':     return process.env.STRIPE_PRO_SETUP_PRICE_ID
  }
}

export function getRecurringPriceId(plan: PricingPlan, cycle: BillingCycle): string | undefined {
  return cycle === 'annual' ? getAnnualPriceId(plan) : getMonthlyPriceId(plan)
}

export function getPlanPrice(plan: PricingPlan, cycle: BillingCycle): number {
  return cycle === 'annual' ? PRICING[plan].annual : PRICING[plan].monthly
}

export function getSetupFee(plan: PricingPlan): number {
  return PRICING[plan].setup_fee
}

export function isPricingPlan(value: unknown): value is PricingPlan {
  return value === 'starter' || value === 'growth' || value === 'pro'
}

export function isBillingCycle(value: unknown): value is BillingCycle {
  return value === 'monthly' || value === 'annual'
}
