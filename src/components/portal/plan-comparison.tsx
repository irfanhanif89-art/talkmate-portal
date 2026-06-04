'use client'

import { useState } from 'react'
import { Check } from 'lucide-react'
import { PLAN_CONFIG, type Plan } from '@/lib/plan'
import { cn } from '@/lib/utils'

const ORDER: Plan[] = ['starter', 'growth', 'pro']

export default function PlanComparison({ currentPlan }: { currentPlan: string }) {
  const current = currentPlan as Plan
  // Session 27 (H6) — track which card is mid-redirect so we can show a
  // loading state on its button while the Stripe portal session is created.
  const [loadingPlan, setLoadingPlan] = useState<Plan | null>(null)

  async function openStripePortal(planKey: Plan) {
    if (loadingPlan) return
    setLoadingPlan(planKey)
    try {
      const res = await fetch('/api/stripe/portal', { method: 'POST' })
      const data = await res.json()
      if (data.url) {
        window.location.href = data.url
      } else {
        // Fall back: surface the error so we don't strand the user on a
        // disabled button.
        alert(data.error ?? 'Could not open Stripe portal. Please try again.')
        setLoadingPlan(null)
      }
    } catch {
      alert('Could not open Stripe portal. Please try again.')
      setLoadingPlan(null)
    }
  }

  return (
    <div className="mb-7">
      <h3 className="text-[15px] font-[700] text-text mb-1">Compare plans</h3>
      <p className="text-[12px] text-dim mb-4">No setup fees · 14-day money-back guarantee · No lock-in</p>

      <div className="grid gap-[14px]" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
        {ORDER.map(planKey => {
          const cfg = PLAN_CONFIG[planKey]
          const isCurrent = current === planKey
          const recommended = planKey === 'growth'
          return (
            <div
              key={planKey}
              className={cn(
                'relative rounded-[14px] p-[22px] bg-card-2',
                isCurrent
                  ? 'border border-orange/50'
                  : recommended
                    ? 'border border-blue/40'
                    : 'border border-line',
              )}
            >
              {recommended && !isCurrent && (
                <span className="absolute -top-[10px] left-4 bg-blue text-white text-[9px] font-[800] px-[9px] py-[3px] rounded-full tracking-[0.05em] uppercase">
                  Recommended
                </span>
              )}
              {isCurrent && (
                <span className="absolute -top-[10px] left-4 bg-orange text-white text-[9px] font-[800] px-[9px] py-[3px] rounded-full tracking-[0.05em] uppercase">
                  Your plan
                </span>
              )}

              <div className="text-[14px] font-[800] text-text mb-1">{cfg.label}</div>
              <div className="text-[28px] font-[800] text-text">
                ${cfg.monthlyPrice}
                <span className="text-[12px] font-[400] text-dim">/mo</span>
              </div>
              <div className="text-[11px] text-dim mt-1">
                {cfg.callLimit ? `${cfg.callLimit} calls included` : 'Unlimited calls'}
                {cfg.overagePerCall > 0 && ` · $${cfg.overagePerCall.toFixed(2)}/extra`}
              </div>

              <div className="h-px bg-line my-[14px]" />

              {cfg.features.map(f => (
                <div key={f} className="flex gap-2 items-start text-[12px] text-dim mb-2">
                  <Check size={13} className="text-green flex-shrink-0 mt-[2px]" />
                  <span>{f}</span>
                </div>
              ))}

              <button
                disabled={isCurrent || loadingPlan !== null}
                onClick={() => openStripePortal(planKey)}
                className={cn(
                  'w-full mt-[14px] rounded-[9px] px-[14px] py-[10px]',
                  'text-[13px] font-[700] border-none cursor-pointer transition-opacity',
                  isCurrent
                    ? 'bg-bg text-dim cursor-default'
                    : recommended
                      ? 'bg-blue text-white hover:opacity-90'
                      : 'bg-orange text-white hover:opacity-90',
                  loadingPlan !== null && loadingPlan !== planKey ? 'opacity-55' : '',
                  (!isCurrent && !loadingPlan) ? 'cursor-pointer' : '',
                )}
              >
                {isCurrent
                  ? 'Current plan'
                  : loadingPlan === planKey
                    ? 'Opening Stripe…'
                    : `Switch to ${cfg.label} →`}
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
