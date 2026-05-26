// Plan metadata used across the portal.
// Source of truth for limits, prices, and feature gates.
//
// Session 42 — the 'professional' legacy alias was retired. The DB CHECK
// constraint (migration 051) now enforces plan IN ('starter','growth','pro'),
// so reads no longer need to defensively map 'professional' → 'pro'. The
// 'professional' string can never appear in production data.
export type Plan = 'starter' | 'growth' | 'pro'

export interface PlanConfig {
  key: Plan
  label: string
  monthlyPrice: number
  callLimit: number | null   // null = unlimited
  features: string[]
  hasCommandCentre: boolean
  overagePerCall: number
}

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
}

export function getPlan(plan: string | null | undefined): PlanConfig {
  // Legacy data could carry 'professional' before migration 050 backfill —
  // normalise just in case stale rows ever resurface from a cache/replica.
  const raw = (plan || 'starter').toLowerCase()
  const normalized = (raw === 'professional' ? 'pro' : raw) as Plan
  return PLAN_CONFIG[normalized] ?? PLAN_CONFIG.starter
}

export function planFromStripePriceNickname(nickname: string | null | undefined): Plan {
  const n = (nickname || '').toLowerCase()
  if (n.includes('pro')) return 'pro'
  if (n.includes('growth')) return 'growth'
  return 'starter'
}
