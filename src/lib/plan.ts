// Plan metadata used across the portal.
// Source of truth for limits, prices, and feature gates.

export type Plan = 'starter' | 'growth' | 'pro' | 'professional'

export interface PlanConfig {
  key: Plan
  label: string
  monthlyPrice: number
  callLimit: number | null   // null = unlimited
  features: string[]
  hasCommandCentre: boolean
  overagePerCall: number
}

// `professional` is treated as an alias of `pro` (legacy data may carry either).
export const PLAN_CONFIG: Record<Plan, PlanConfig> = {
  starter: {
    key: 'starter',
    label: 'Starter',
    monthlyPrice: 299,
    callLimit: 300,
    features: [
      '300 calls/month included',
      'AI voice agent — 24/7',
      'Live call dashboard',
      'Transcripts & recordings',
      'Email notifications',
    ],
    hasCommandCentre: false,
    overagePerCall: 0.45,
  },
  growth: {
    key: 'growth',
    label: 'Growth',
    monthlyPrice: 499,
    callLimit: 800,
    features: [
      '800 calls/month included',
      'Everything in Starter',
      'TalkMate Command Centre (WhatsApp/Telegram)',
      'Daily call summaries',
      'Priority support',
    ],
    hasCommandCentre: true,
    overagePerCall: 0.45,
  },
  pro: {
    key: 'pro',
    label: 'Pro',
    monthlyPrice: 799,
    callLimit: null,
    features: [
      'Unlimited calls',
      'Everything in Growth',
      'Outbound AI calls',
      'Multi-location support',
      'Dedicated success manager',
    ],
    hasCommandCentre: true,
    overagePerCall: 0,
  },
  professional: {
    key: 'professional',
    label: 'Pro',
    monthlyPrice: 799,
    callLimit: null,
    features: [
      'Unlimited calls',
      'Everything in Growth',
      'Outbound AI calls',
      'Multi-location support',
      'Dedicated success manager',
    ],
    hasCommandCentre: true,
    overagePerCall: 0,
  },
}

export function getPlan(plan: string | null | undefined): PlanConfig {
  const normalized = (plan || 'starter').toLowerCase() as Plan
  return PLAN_CONFIG[normalized] ?? PLAN_CONFIG.starter
}

export function planFromStripePriceNickname(nickname: string | null | undefined): Plan {
  const n = (nickname || '').toLowerCase()
  if (n.includes('pro')) return 'pro'
  if (n.includes('growth')) return 'growth'
  return 'starter'
}
