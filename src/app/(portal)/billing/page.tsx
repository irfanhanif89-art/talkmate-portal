'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import PlanComparison from '@/components/portal/plan-comparison'

const invoices = [
  { date: '21 Apr 2026', desc: 'Talkmate Premium — April 2026', amount: '$499.00', status: 'Paid' },
  { date: '21 Apr 2026', desc: 'Implementation Fee', amount: '$299.00', status: 'Paid' },
]

function CheckIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#22C55E" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}>
      <polyline points="20,6 9,17 4,12" />
    </svg>
  )
}

interface AddOnCardProps {
  iconBg: string
  iconStroke: string
  iconPath: React.ReactNode
  title: string
  dataProof: React.ReactNode
  features: string[]
  price: string
  cta: string
  primary: boolean
}

function AddOnCard({ iconBg, iconStroke, iconPath, title, dataProof, features, price, cta, primary }: AddOnCardProps) {
  return (
    <div style={{ background: '#0A1E38', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: 20, position: 'relative', display: 'flex', flexDirection: 'column' }}>
      {/* Top row */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ width: 34, height: 34, borderRadius: 8, background: iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={iconStroke} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            {iconPath}
          </svg>
        </div>
        <span style={{ fontSize: 8, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' as const, background: 'rgba(232,98,42,0.15)', color: '#E8622A', borderRadius: 4, padding: '3px 7px' }}>
          LOCKED
        </span>
      </div>

      {/* Name */}
      <div style={{ fontSize: 13, fontWeight: 700, color: 'white', marginBottom: 10 }}>{title}</div>

      {/* Data proof */}
      <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 7, padding: '8px 10px', fontSize: 12, color: 'rgba(255,255,255,0.55)', marginBottom: 12, lineHeight: 1.55 }}>
        {dataProof}
      </div>

      {/* Features */}
      <div style={{ marginBottom: 14, flex: 1 }}>
        {features.map(f => (
          <div key={f} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 12, color: 'rgba(255,255,255,0.6)', marginBottom: 6 }}>
            <CheckIcon />
            {f}
          </div>
        ))}
      </div>

      {/* Bottom bar */}
      <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <span style={{ fontSize: 18, fontWeight: 800, color: '#E8622A' }}>${price}</span>
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginLeft: 3 }}>/mo</span>
        </div>
        <button style={{
          background: primary ? '#E8622A' : 'rgba(21,101,192,0.2)',
          color: primary ? 'white' : '#4A9FE8',
          border: primary ? 'none' : '1px solid rgba(74,159,232,0.3)',
          padding: '10px 18px',
          borderRadius: 8,
          fontSize: 12,
          fontWeight: 600,
          cursor: 'pointer',
          fontFamily: 'Outfit,sans-serif',
        }}>
          {cta}
        </button>
      </div>
    </div>
  )
}

export default function BillingPage() {
  const supabase = createClient()
  const [cancelling, setCancelling] = useState(false)
  const [missedCallCount, setMissedCallCount] = useState(0)
  const [plan, setPlan] = useState<string>('starter')
  const [lifetimeRevenue, setLifetimeRevenue] = useState(0)
  const [totalPaid, setTotalPaid] = useState(0)
  const [signupAt, setSignupAt] = useState<string | null>(null)
  const [businessName, setBusinessName] = useState('')
  const weeklyPositiveCalls = Math.round(7 * 0.72 * 5) // ~25

  useEffect(() => {
    async function fetchData() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: biz } = await supabase.from('businesses').select('id, plan, signup_at, name').eq('owner_user_id', user.id).single()
      if (!biz) return
      setPlan(biz.plan ?? 'starter')
      setSignupAt(biz.signup_at)
      setBusinessName(biz.name)

      const startOfMonth = new Date(); startOfMonth.setDate(1); startOfMonth.setHours(0, 0, 0, 0)
      const { data: calls } = await supabase.from('calls').select('outcome').eq('business_id', biz.id).gte('created_at', startOfMonth.toISOString())
      if (calls) setMissedCallCount(calls.filter(c => !c.outcome || c.outcome === 'Missed').length)

      const { data: allCalls } = await supabase.from('calls').select('id').eq('business_id', biz.id)
      // Estimate lifetime revenue at $85/call as a fallback when no jobs table values exist.
      const totalCalls = allCalls?.length ?? 0
      setLifetimeRevenue(totalCalls * 85)

      // Months active × monthly price
      if (biz.signup_at) {
        const months = Math.max(1, Math.floor((Date.now() - new Date(biz.signup_at).getTime()) / (30 * 24 * 60 * 60 * 1000)))
        const monthly = biz.plan === 'pro' || biz.plan === 'professional' ? 799 : biz.plan === 'growth' ? 499 : 299
        setTotalPaid(months * monthly)
      }
    }
    fetchData()
  }, [])

  const roiMultiple = totalPaid > 0 ? (lifetimeRevenue / totalPaid) : 0

  return (
    <div style={{ padding: 32, maxWidth: 900, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'white' }}>Billing</h1>
      </div>

      {/* Plan + Usage */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 28 }}>
        <div style={{ background: 'linear-gradient(135deg,rgba(232,98,42,0.1),rgba(10,30,56,1))', border: '1px solid rgba(232,98,42,0.3)', borderRadius: 16, padding: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <div>
              <div style={{ fontSize: 11, color: '#4A7FBB', fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.08em', marginBottom: 4 }}>Current Plan</div>
              <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'white' }}>Premium</div>
            </div>
            <span style={{ fontSize: 12, fontWeight: 600, padding: '4px 12px', borderRadius: 99, background: 'rgba(34,197,94,0.12)', color: '#22C55E' }}>Active</span>
          </div>
          <div style={{ fontSize: '2rem', fontWeight: 800, color: 'white', marginBottom: 4 }}>$499<span style={{ fontSize: 14, fontWeight: 400, color: '#4A7FBB' }}>/month</span></div>
          <div style={{ fontSize: 13, color: '#4A7FBB', marginBottom: 20 }}>Next billing: 21 May 2026</div>
          <button onClick={async () => { const r = await fetch('/api/stripe/portal', { method: 'POST' }); const d = await r.json(); if (d.url) window.location.href = d.url }}
            style={{ width: '100%', padding: '11px', background: 'transparent', border: '1px solid rgba(74,159,232,0.3)', color: '#4A9FE8', borderRadius: 10, fontFamily: 'Outfit,sans-serif', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
            Manage Payment Method
          </button>
        </div>

        <div style={{ background: '#0A1E38', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 16, padding: 24 }}>
          <div style={{ fontSize: 11, color: '#4A7FBB', fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.08em', marginBottom: 16 }}>Usage This Month</div>
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
              <span style={{ color: 'white' }}>AI Calls Used</span>
              <span style={{ fontWeight: 700, color: 'white' }}>0 <span style={{ color: '#4A7FBB' }}>/ unlimited</span></span>
            </div>
            <div style={{ height: 8, background: 'rgba(255,255,255,0.06)', borderRadius: 4, overflow: 'hidden' }}>
              <div style={{ width: '0%', height: '100%', background: '#22C55E', borderRadius: 4 }} />
            </div>
          </div>
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
              <span style={{ color: 'white' }}>SMS Sent</span>
              <span style={{ fontWeight: 700, color: 'white' }}>0 <span style={{ color: '#4A7FBB' }}>/ 0</span></span>
            </div>
            <div style={{ height: 8, background: 'rgba(255,255,255,0.06)', borderRadius: 4 }} />
          </div>
          <div style={{ fontSize: 12, color: '#4A7FBB', padding: 10, background: '#071829', borderRadius: 8 }}>
            💡 At this rate you&apos;ll use ~60% of your monthly calls.
          </div>
        </div>
      </div>

      {/* Plan comparison */}
      <PlanComparison currentPlan={plan} />

      {/* ROI summary */}
      {lifetimeRevenue > 0 && (
        <div style={{ background: 'linear-gradient(135deg, rgba(232,98,42,0.08), rgba(74,159,232,0.04))', border: '1px solid rgba(232,98,42,0.25)', borderRadius: 14, padding: 20, marginBottom: 28 }}>
          <div style={{ fontSize: 11, color: '#E8622A', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Your TalkMate ROI</div>
          <div style={{ fontSize: 14, color: 'white', lineHeight: 1.6 }}>
            TalkMate has captured an estimated <strong style={{ color: '#E8622A' }}>${lifetimeRevenue.toLocaleString()}</strong> in revenue for <strong>{businessName || 'your business'}</strong>{signupAt ? ` since ${new Date(signupAt).toLocaleDateString('en-AU', { month: 'short', year: 'numeric' })}` : ''}.
          </div>
          <div style={{ fontSize: 14, color: '#7BAED4', marginTop: 6 }}>
            Total investment: <strong style={{ color: 'white' }}>${totalPaid.toLocaleString()}</strong>. That&apos;s a <strong style={{ color: '#22C55E' }}>{roiMultiple.toFixed(1)}× return</strong>.
          </div>
        </div>
      )}

      {/* Add-ons section header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <div style={{ flex: 1 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: 'white', margin: '0 0 4px' }}>Grow your revenue with add-ons</h3>
          <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', margin: 0 }}>Each add-on pays for itself — most clients recover the cost within the first week.</p>
        </div>
        <div style={{ textAlign: 'right' as const }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#E8622A' }}>14x</div>
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)' }}>average add-on ROI</div>
        </div>
      </div>

      {/* Add-on cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14, marginBottom: 28 }}>
        <AddOnCard
          iconBg="rgba(245,158,11,0.12)"
          iconStroke="#F59E0B"
          iconPath={<><polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26"/></>}
          title="Google Review Requests"
          dataProof={<>An estimated 72% of your calls end positively. That&apos;s roughly <strong style={{ color: 'white' }}>{weeklyPositiveCalls} review requests</strong> you could have sent this week — automatically.</>}
          features={['Automatic review requests after every positive call', 'Smart timing — sent when satisfaction is highest', 'Google & Facebook review collection', 'Review performance dashboard']}
          price="49"
          cta="Unlock now →"
          primary={true}
        />
        <AddOnCard
          iconBg="rgba(74,159,232,0.12)"
          iconStroke="#4A9FE8"
          iconPath={<><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></>}
          title="SMS Follow-Ups"
          dataProof={<>You had <strong style={{ color: 'white' }}>{missedCallCount} missed call{missedCallCount !== 1 ? 's' : ''}</strong> this month. Without follow-up, that caller likely went to a competitor within 5 minutes.</>}
          features={['Auto-SMS within 5 min of every missed call', 'Customisable message templates', 'Two-way SMS conversation support', 'Missed call recovery tracking']}
          price="39"
          cta="Unlock now →"
          primary={true}
        />
        <AddOnCard
          iconBg="rgba(232,98,42,0.12)"
          iconStroke="#E8622A"
          iconPath={<><polyline points="23,7 23,1 17,1"/><line x1="16" y1="8" x2="23" y2="1"/><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 15a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 4.23h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L7.91 11a16 16 0 0 0 6 6l.92-.92a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></>}
          title="Outbound AI Calls"
          dataProof="Outbound AI can confirm every job, chase quotes, and follow up no-shows — while you sleep."
          features={['Automated job confirmation calls', 'Quote follow-up sequences', 'No-show re-engagement', 'Full call transcripts logged']}
          price="79"
          cta="Learn more"
          primary={false}
        />
      </div>

      {/* Invoices */}
      <div style={{ background: '#0A1E38', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 16, padding: 24, marginBottom: 20 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: 'white', marginBottom: 16 }}>🧾 Invoices</div>
        <table style={{ width: '100%', borderCollapse: 'collapse' as const }}>
          <thead>
            <tr style={{ fontSize: 11, textTransform: 'uppercase' as const, letterSpacing: '0.06em', color: '#4A7FBB' }}>
              {['Date', 'Description', 'Amount', 'Status', ''].map(h => (
                <th key={h} style={{ textAlign: 'left' as const, padding: '8px 0', fontWeight: 600 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {invoices.map((inv, i) => (
              <tr key={i} style={{ borderTop: '1px solid rgba(255,255,255,0.05)', fontSize: 14, color: 'white' }}>
                <td style={{ padding: '14px 0', color: '#4A7FBB' }}>{inv.date}</td>
                <td style={{ padding: '14px 0' }}>{inv.desc}</td>
                <td style={{ padding: '14px 0', fontWeight: 600 }}>{inv.amount}</td>
                <td style={{ padding: '14px 0' }}><span style={{ fontSize: 12, fontWeight: 600, padding: '3px 10px', borderRadius: 99, background: 'rgba(34,197,94,0.12)', color: '#22C55E' }}>Paid</span></td>
                <td style={{ padding: '14px 0', textAlign: 'right' as const }}><a href="#" style={{ color: '#4A9FE8', fontSize: 13, textDecoration: 'none' }}>Download PDF</a></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Cancel */}
      <div style={{ textAlign: 'center' as const }}>
        <button onClick={() => setCancelling(!cancelling)} style={{ background: 'transparent', border: 'none', color: '#4A7FBB', fontSize: 13, cursor: 'pointer', fontFamily: 'Outfit,sans-serif' }}>
          Cancel subscription
        </button>
        {cancelling && (
          <div style={{ marginTop: 16, padding: 20, background: '#0A1E38', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 14, maxWidth: 400, margin: '16px auto 0' }}>
            <div style={{ fontWeight: 600, marginBottom: 8, color: 'white' }}>Before you go...</div>
            <div style={{ fontSize: 13, color: '#7BAED4', marginBottom: 16 }}>Use code <strong style={{ color: '#E8622A' }}>STAY20</strong> for 20% off your next 3 months.</div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button style={{ flex: 1, padding: 10, background: '#E8622A', color: 'white', border: 'none', borderRadius: 8, fontFamily: 'Outfit,sans-serif', fontWeight: 600, cursor: 'pointer' }}>Apply Discount</button>
              <button onClick={() => setCancelling(false)} style={{ flex: 1, padding: 10, background: 'transparent', color: '#EF4444', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, fontFamily: 'Outfit,sans-serif', cursor: 'pointer' }}>Cancel Anyway</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
