'use client'

import { useRouter } from 'next/navigation'
import { Check } from 'lucide-react'
import { PLAN_CONFIG, type Plan } from '@/lib/plan'

const ORDER: Plan[] = ['starter', 'growth', 'pro']

export default function PlanComparison({ currentPlan }: { currentPlan: string }) {
  const router = useRouter()
  const current = (currentPlan === 'professional' ? 'pro' : currentPlan) as Plan
  return (
    <div style={{ marginBottom: 28 }}>
      <h3 style={{ fontSize: 15, fontWeight: 700, color: 'white', marginBottom: 4 }}>Compare plans</h3>
      <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', marginBottom: 16 }}>No setup fees · 14-day money-back guarantee · No lock-in</p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14 }}>
        {ORDER.map(planKey => {
          const cfg = PLAN_CONFIG[planKey]
          const isCurrent = current === planKey
          const recommended = planKey === 'growth'
          return (
            <div key={planKey} style={{
              background: '#0A1E38', border: `1px solid ${isCurrent ? 'rgba(232,98,42,0.5)' : recommended ? 'rgba(74,159,232,0.4)' : 'rgba(255,255,255,0.07)'}`,
              borderRadius: 14, padding: 22, position: 'relative',
            }}>
              {recommended && !isCurrent && (
                <span style={{ position: 'absolute', top: -10, left: 16, background: '#1565C0', color: 'white', fontSize: 9, fontWeight: 800, padding: '3px 9px', borderRadius: 99, letterSpacing: '0.05em', textTransform: 'uppercase' }}>Recommended</span>
              )}
              {isCurrent && (
                <span style={{ position: 'absolute', top: -10, left: 16, background: '#E8622A', color: 'white', fontSize: 9, fontWeight: 800, padding: '3px 9px', borderRadius: 99, letterSpacing: '0.05em', textTransform: 'uppercase' }}>Your plan</span>
              )}
              <div style={{ fontSize: 14, fontWeight: 800, color: 'white', marginBottom: 4 }}>{cfg.label}</div>
              <div style={{ fontSize: 28, fontWeight: 800, color: 'white' }}>${cfg.monthlyPrice}<span style={{ fontSize: 12, color: '#7BAED4', fontWeight: 400 }}>/mo</span></div>
              <div style={{ fontSize: 11, color: '#7BAED4', marginTop: 4 }}>
                {cfg.callLimit ? `${cfg.callLimit} calls included` : 'Unlimited calls'}
                {cfg.overagePerCall > 0 && ` · $${cfg.overagePerCall.toFixed(2)}/extra`}
              </div>
              <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: '14px 0' }} />
              {cfg.features.map(f => (
                <div key={f} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 12, color: '#7BAED4', marginBottom: 8 }}>
                  <Check size={13} color="#22C55E" style={{ flexShrink: 0, marginTop: 2 }} />
                  <span>{f}</span>
                </div>
              ))}
              <button
                disabled={isCurrent}
                onClick={() => router.push('/api/stripe/portal')}
                style={{
                  width: '100%', marginTop: 14,
                  background: isCurrent ? 'rgba(255,255,255,0.06)' : recommended ? '#1565C0' : '#E8622A',
                  color: isCurrent ? '#7BAED4' : 'white', border: 'none', borderRadius: 9,
                  padding: '10px 14px', fontSize: 13, fontWeight: 700, cursor: isCurrent ? 'default' : 'pointer', fontFamily: 'Outfit, sans-serif',
                }}
              >
                {isCurrent ? 'Current plan' : `Switch to ${cfg.label} →`}
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
