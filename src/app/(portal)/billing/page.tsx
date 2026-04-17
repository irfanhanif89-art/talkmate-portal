'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { CreditCard, ExternalLink, CheckCircle } from 'lucide-react'

const PLANS = [
  { id: 'starter', name: 'Starter', price: 299, calls: 300, features: ['1 location', 'Up to 300 calls/month', 'Order taking + FAQs', 'SMS confirmations', 'Call transcripts', 'Email support'] },
  { id: 'growth', name: 'Growth', price: 499, calls: 800, features: ['Up to 3 locations', 'Up to 800 calls/month', 'Everything in Starter', 'Live order dashboard', 'Call analytics', 'Priority support'], featured: true },
  { id: 'enterprise', name: 'Enterprise', price: null, calls: null, features: ['Unlimited locations', 'Custom integrations', 'POS system sync', 'Dedicated account manager', 'Custom AI training', 'SLA guarantee'] },
]

export default function BillingPage() {
  const supabase = createClient()
  const [subscription, setSubscription] = useState<{ plan: string; status: string; current_period_end: string } | null>(null)
  const [callsUsed, setCallsUsed] = useState(0)
  const [loading, setLoading] = useState(false)
  const [showCancelModal, setShowCancelModal] = useState(false)
  const [cancelReason, setCancelReason] = useState('')
  const [showDiscount, setShowDiscount] = useState(false)

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: biz } = await supabase.from('businesses').select('id').eq('owner_user_id', user.id).single()
      if (!biz) return
      const { data: sub } = await supabase.from('subscriptions').select('*').eq('business_id', biz.id).single()
      setSubscription(sub)
      const startOfMonth = new Date(); startOfMonth.setDate(1); startOfMonth.setHours(0, 0, 0, 0)
      const { count } = await supabase.from('calls').select('id', { count: 'exact', head: true }).eq('business_id', biz.id).gte('created_at', startOfMonth.toISOString())
      setCallsUsed(count || 0)
    }
    load()
  }, [])

  async function openStripePortal() {
    setLoading(true)
    const res = await fetch('/api/stripe/portal', { method: 'POST' })
    if (res.ok) { const { url } = await res.json(); window.open(url, '_blank') }
    setLoading(false)
  }

  const currentPlan = PLANS.find(p => p.id === (subscription?.plan || 'starter')) || PLANS[0]
  const usagePercent = currentPlan.calls ? Math.min(100, Math.round((callsUsed / currentPlan.calls) * 100)) : 0

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold text-white mb-8">Billing & Subscription</h1>

      {/* Current plan */}
      <div className="p-6 rounded-2xl border mb-8" style={{ background: '#0A1E38', borderColor: 'rgba(232,98,42,0.25)' }}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#4A7FBB' }}>Current Plan</span>
            <h2 className="text-xl font-bold text-white mt-1">{currentPlan.name} — ${currentPlan.price}/mo</h2>
          </div>
          <span className="px-3 py-1 rounded-full text-sm font-semibold" style={{ background: 'rgba(34,197,94,0.1)', color: '#22c55e' }}>
            {subscription?.status || 'Active'}
          </span>
        </div>
        {currentPlan.calls && (
          <div>
            <div className="flex justify-between text-sm mb-2">
              <span style={{ color: '#4A7FBB' }}>Calls this month</span>
              <span className="text-white">{callsUsed} / {currentPlan.calls}</span>
            </div>
            <Progress value={usagePercent} className="h-2" style={{ background: 'rgba(255,255,255,0.08)' }} />
            {usagePercent >= 80 && <p className="text-xs mt-2" style={{ color: '#f59e0b' }}>⚠️ {100 - usagePercent}% of your monthly calls remaining</p>}
          </div>
        )}
        {subscription?.current_period_end && (
          <p className="text-xs mt-3" style={{ color: '#4A7FBB' }}>Renews {new Date(subscription.current_period_end).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
        )}
        <div className="flex gap-3 mt-4">
          <Button onClick={openStripePortal} disabled={loading} variant="outline" className="gap-2"
            style={{ borderColor: '#1565C0', color: '#4A9FE8' }}>
            <CreditCard size={14} /> Manage Billing <ExternalLink size={12} />
          </Button>
          <Button variant="outline" onClick={() => setShowCancelModal(true)}
            style={{ borderColor: 'rgba(239,68,68,0.3)', color: '#ef4444', background: 'transparent' }}>
            Cancel plan
          </Button>
        </div>
      </div>

      {/* Plan comparison */}
      <h2 className="text-lg font-bold text-white mb-4">Plans</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        {PLANS.map(plan => (
          <div key={plan.id} className="p-6 rounded-2xl border relative" style={{ background: plan.featured ? 'linear-gradient(160deg,#0D2B4A,#071829)' : '#0A1E38', borderColor: plan.featured ? '#E8622A' : 'rgba(255,255,255,0.06)' }}>
            {plan.featured && <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full text-xs font-bold" style={{ background: '#E8622A', color: 'white' }}>Most Popular</div>}
            <h3 className="font-bold text-white text-lg mb-1">{plan.name}</h3>
            {plan.price ? (
              <p className="text-3xl font-bold mb-4" style={{ color: plan.featured ? '#E8622A' : 'white' }}>${plan.price}<span className="text-sm font-normal" style={{ color: '#4A7FBB' }}>/mo</span></p>
            ) : (
              <p className="text-2xl font-bold mb-4 text-white">Custom</p>
            )}
            <ul className="space-y-2 mb-6">
              {plan.features.map(f => (
                <li key={f} className="flex items-start gap-2 text-sm" style={{ color: '#7BAED4' }}>
                  <CheckCircle size={14} className="mt-0.5 flex-shrink-0" style={{ color: plan.featured ? '#E8622A' : '#22c55e' }} /> {f}
                </li>
              ))}
            </ul>
            {plan.id === subscription?.plan ? (
              <div className="text-center text-sm font-semibold py-2" style={{ color: '#22c55e' }}>✓ Current plan</div>
            ) : plan.price ? (
              <Button onClick={openStripePortal} className="w-full" style={{ background: plan.featured ? '#E8622A' : 'transparent', color: plan.featured ? 'white' : '#4A9FE8', border: plan.featured ? 'none' : '1px solid #1565C0' }}>
                {plan.price > (currentPlan.price || 0) ? 'Upgrade' : 'Downgrade'}
              </Button>
            ) : (
              <a href="mailto:hello@talkmate.com.au" className="block text-center py-2 rounded-lg text-sm font-semibold" style={{ border: '1px solid rgba(255,255,255,0.1)', color: '#4A7FBB' }}>Contact Us</a>
            )}
          </div>
        ))}
      </div>

      {/* Cancel modal */}
      {showCancelModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)' }}>
          <div className="w-full max-w-md p-8 rounded-2xl border" style={{ background: '#0A1E38', borderColor: 'rgba(255,255,255,0.1)' }}>
            <h3 className="text-xl font-bold text-white mb-2">Cancel subscription</h3>
            <p className="text-sm mb-6" style={{ color: '#4A7FBB' }}>We're sorry to see you go. What's the reason?</p>
            {[['too_expensive', 'Too expensive'], ['not_using', 'Not using it enough'], ['missing_features', 'Missing features I need'], ['switching', 'Switching to another solution'], ['other', 'Other']].map(([val, label]) => (
              <button key={val} onClick={() => { setCancelReason(val); if (val === 'too_expensive') setShowDiscount(true) }} className="w-full text-left px-4 py-3 rounded-lg mb-2 text-sm transition-all"
                style={{ background: cancelReason === val ? 'rgba(232,98,42,0.15)' : 'rgba(255,255,255,0.04)', color: cancelReason === val ? '#E8622A' : '#7BAED4', border: `1px solid ${cancelReason === val ? 'rgba(232,98,42,0.3)' : 'transparent'}` }}>
                {label}
              </button>
            ))}
            {showDiscount && cancelReason === 'too_expensive' && (
              <div className="p-4 rounded-xl mb-4 border" style={{ background: 'rgba(34,197,94,0.08)', borderColor: 'rgba(34,197,94,0.25)' }}>
                <p className="font-bold text-white mb-1">We'd love to keep you 💚</p>
                <p className="text-sm" style={{ color: '#7BAED4' }}>Use code <strong style={{ color: '#22c55e' }}>STAY20</strong> for 20% off your next 3 months. Apply it in the billing portal.</p>
              </div>
            )}
            <div className="flex gap-3 mt-4">
              <Button variant="outline" onClick={() => { setShowCancelModal(false); setShowDiscount(false); setCancelReason('') }} className="flex-1" style={{ borderColor: 'rgba(255,255,255,0.1)', color: '#4A7FBB' }}>Keep my plan</Button>
              <Button onClick={openStripePortal} className="flex-1" style={{ background: '#ef4444', color: 'white', border: 'none' }}>Cancel anyway</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
