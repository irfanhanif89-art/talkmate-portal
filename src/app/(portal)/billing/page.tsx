'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getPlan } from '@/lib/plan'
import PlanComparison from '@/components/portal/plan-comparison'
import { INDUSTRY_AVG_CALL_VALUE } from '@/lib/dashboard-defaults'
import { Meter } from '@/components/portal/ui-v2/meter'
import { Panel, PanelHeader } from '@/components/portal/ui-v2/panel'
import { ButtonV2 } from '@/components/portal/ui-v2/button'

interface StripeInvoice {
  id: string
  amount: number
  currency: string
  status: string
  created: number
  hosted_invoice_url: string | null
  invoice_pdf: string | null
  description: string | null
}
interface StripeSummary {
  ok: boolean
  hasStripe: boolean
  plan: string
  paymentMethod: { last4: string; brand: string; exp_month: number; exp_year: number } | null
  invoices: StripeInvoice[]
  subscription: { id: string | null; status: string; current_period_end: string | null; cancel_at_period_end: boolean } | null
}

// ─────────────────────────────────────────────────────────────────────────────
// Small helpers
// ─────────────────────────────────────────────────────────────────────────────

function CheckSvg() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="mt-[1px] flex-shrink-0 text-green">
      <polyline points="20,6 9,17 4,12" />
    </svg>
  )
}

function openStripePortal() {
  return fetch('/api/stripe/portal', { method: 'POST' })
    .then(r => r.json())
    .then(d => { if (d.url) window.location.href = d.url; else alert(d.error ?? 'Could not open Stripe portal. Please try again.') })
}

// ─────────────────────────────────────────────────────────────────────────────
// Add-on card
// ─────────────────────────────────────────────────────────────────────────────

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
    <div className="relative flex flex-col rounded-[var(--r)] border border-line bg-card-2 p-5 shadow-[0_1px_4px_rgba(0,0,0,.28)]">
      {/* Top row: icon + locked badge */}
      <div className="mb-[10px] flex items-start justify-between">
        <div
          className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-[9px]"
          style={{ background: iconBg }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={iconStroke} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            {iconPath}
          </svg>
        </div>
        <span className="rounded-[5px] bg-[rgba(238,106,44,.15)] px-[7px] py-[3px] text-[8px] font-[700] uppercase tracking-[.10em] text-orange">
          Locked
        </span>
      </div>

      {/* Name */}
      <div className="mb-[9px] text-[13.5px] font-[800] text-text">{title}</div>

      {/* Proof stat */}
      <div className="mb-3 rounded-[8px] bg-[rgba(255,255,255,.04)] p-[9px_11px] text-[12px] leading-[1.55] text-[rgba(255,255,255,.5)] [&_strong]:font-[700] [&_strong]:text-[rgba(255,255,255,.8)]">
        {dataProof}
      </div>

      {/* Features */}
      <div className="mb-4 flex flex-1 flex-col gap-[7px]">
        {features.map(f => (
          <div key={f} className="flex items-start gap-[7px] text-[12px] text-[rgba(255,255,255,.6)]">
            <CheckSvg />
            <span>{f}</span>
          </div>
        ))}
      </div>

      {/* Bottom bar */}
      <div className="mt-auto flex items-center justify-between border-t border-[rgba(255,255,255,.06)] pt-[14px]">
        <div className="flex items-baseline gap-[2px]">
          <span className="tnum text-[20px] font-[800] tracking-[-0.5px] text-orange">${price}</span>
          <span className="text-[11px] text-faint">/mo</span>
        </div>
        {primary ? (
          <ButtonV2 variant="primary" className="px-[18px] py-[10px] text-[12px]">{cta}</ButtonV2>
        ) : (
          <ButtonV2 variant="secondary" className="px-[18px] py-[10px] text-[12px] text-blue">{cta}</ButtonV2>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────────────────────

export default function BillingPage() {
  const supabase = createClient()

  // Cancel flow state
  const [cancelStep, setCancelStep] = useState<0|1|2|3>(0)
  const [cancelReason, setCancelReason] = useState('')
  const [cancelReasonOther, setCancelReasonOther] = useState('')
  const [cancelBusy, setCancelBusy] = useState(false)
  const [cancelMessage, setCancelMessage] = useState<string | null>(null)

  // Data state
  const [missedCallCount, setMissedCallCount] = useState(0)
  const [callsThisMonth, setCallsThisMonth] = useState(0)
  const [plan, setPlan] = useState<string>('starter')
  const [lifetimeRevenue, setLifetimeRevenue] = useState(0)
  const [totalPaid, setTotalPaid] = useState(0)
  const [signupAt, setSignupAt] = useState<string | null>(null)
  const [businessName, setBusinessName] = useState('')
  const [stripeSummary, setStripeSummary] = useState<StripeSummary | null>(null)
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'annual'>('monthly')
  const [setupFeeAmount, setSetupFeeAmount] = useState<number | null>(null)
  const [setupFeeWaived, setSetupFeeWaived] = useState<boolean>(false)

  const weeklyPositiveCalls = Math.round(7 * 0.72 * 5) // ~25

  useEffect(() => {
    async function fetchData() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: biz } = await supabase.from('businesses').select('id, plan, signup_at, name, billing_cycle, setup_fee_amount, setup_fee_waived').eq('owner_user_id', user.id).maybeSingle()
      if (!biz) return
      setPlan(biz.plan ?? 'starter')
      setSignupAt(biz.signup_at)
      setBusinessName(biz.name)
      setBillingCycle(biz.billing_cycle === 'annual' ? 'annual' : 'monthly')
      setSetupFeeAmount(biz.setup_fee_amount == null ? null : Number(biz.setup_fee_amount))
      setSetupFeeWaived(biz.setup_fee_waived === true)

      const startOfMonth = new Date(); startOfMonth.setDate(1); startOfMonth.setHours(0, 0, 0, 0)
      const { data: calls } = await supabase.from('calls').select('outcome').eq('business_id', biz.id).gte('created_at', startOfMonth.toISOString())
      if (calls) {
        setCallsThisMonth(calls.length)
        setMissedCallCount(calls.filter(c => !c.outcome || c.outcome === 'Missed').length)
      }

      const { data: allCalls } = await supabase.from('calls').select('id').eq('business_id', biz.id)
      const totalCalls = allCalls?.length ?? 0
      setLifetimeRevenue(totalCalls * INDUSTRY_AVG_CALL_VALUE)

      if (biz.signup_at) {
        const months = Math.max(1, Math.floor((Date.now() - new Date(biz.signup_at).getTime()) / (30 * 24 * 60 * 60 * 1000)))
        const billingCycleForCalc = (biz.billing_cycle as string) ?? 'monthly'
        const monthlyPrice = biz.plan === 'pro' ? 799 : biz.plan === 'growth' ? 499 : 299
        const annualPrice = monthlyPrice * 10

        let totalPaidAmount: number
        if (billingCycleForCalc === 'annual') {
          const years = Math.max(1, Math.ceil(months / 12))
          totalPaidAmount = years * annualPrice
        } else {
          totalPaidAmount = months * monthlyPrice
        }
        setTotalPaid(totalPaidAmount)
      }

      try {
        const res = await fetch('/api/stripe/summary')
        const data = await res.json() as StripeSummary
        if (data.ok) setStripeSummary(data)
      } catch (e) {
        console.error('[billing] stripe summary', e)
      }
    }
    fetchData()
  }, [])

  const roiMultiple = totalPaid > 0 ? (lifetimeRevenue / totalPaid) : 0
  const planConfig = getPlan(plan)
  const usagePct = planConfig.callLimit ? Math.min(100, Math.round((callsThisMonth / planConfig.callLimit) * 100)) : 0
  const willEndAt = stripeSummary?.subscription?.current_period_end ?? null
  const alreadyCancelled = stripeSummary?.subscription?.cancel_at_period_end ?? false
  // Next invoice estimate. The advertised plan price is GST-INCLUSIVE — it is
  // exactly what Stripe charges (no tax added on top) and what the onboarding
  // terms commit to ("inc. GST"). So the total IS the plan price; GST is the
  // component already contained within it (total − total/1.1), shown for the
  // tax invoice, not an extra line added on top.
  const nextInvoiceTotal = planConfig.monthlyPrice
  const nextInvoiceGst = Math.round((nextInvoiceTotal - nextInvoiceTotal / 1.1) * 100) / 100

  const CANCEL_REASONS = [
    { id: 'price',    label: 'Too expensive',                        offer: 'pause' },
    { id: 'calls',    label: 'Not getting enough calls / leads',      offer: 'review' },
    { id: 'broken',   label: 'Something isn\'t working properly',     offer: 'fix' },
    { id: 'switch',   label: 'Moving to a different solution',        offer: 'talk' },
    { id: 'closing',  label: 'My business is closing / pausing',      offer: 'pause' },
    { id: 'other',    label: 'Other reason',                         offer: 'talk' },
  ]

  const OFFERS: Record<string, { heading: string; body: string; cta: string; href?: string }> = {
    pause: {
      heading: 'Want to pause instead of cancel?',
      body: 'We can freeze your account for up to 60 days — no charge, no data loss. Your AI agent, contacts, and call history will be waiting when you\'re ready.',
      cta: 'Request a pause',
      href: 'mailto:hello@talkmate.com.au?subject=Pause%20Request&body=Hi%20Irfan%2C%20I%27d%20like%20to%20pause%20my%20TalkMate%20account.',
    },
    review: {
      heading: 'Let us fix your setup — for free',
      body: 'Low call volume is usually a configuration issue, not a product issue. Irfan will personally review your AI agent, script, and phone routing and make sure it\'s set up to capture every lead.',
      cta: 'Book a free review call',
      href: 'mailto:hello@talkmate.com.au?subject=Free%20Setup%20Review&body=Hi%20Irfan%2C%20I%27d%20like%20a%20free%20review%20of%20my%20TalkMate%20setup.',
    },
    fix: {
      heading: 'Don\'t cancel — let us fix it',
      body: 'We\'re sorry something isn\'t working. Irfan can jump on a 15-minute call with you right now to diagnose and fix the issue before you lose your number and setup.',
      cta: 'Book a 15-min fix call',
      href: 'mailto:hello@talkmate.com.au?subject=Support%20Request&body=Hi%20Irfan%2C%20I%27m%20having%20an%20issue%20with%20my%20TalkMate%20account.',
    },
    talk: {
      heading: 'Before you go — let\'s talk',
      body: 'Whatever the reason, we\'d love 10 minutes to understand what we could have done better, and whether there\'s anything we can do to keep you. No hard sell.',
      cta: 'Chat with Irfan',
      href: 'mailto:hello@talkmate.com.au?subject=Cancellation%20Chat&body=Hi%20Irfan%2C%20I%27d%20like%20to%20chat%20before%20I%20cancel.',
    },
  }

  async function confirmCancel() {
    setCancelBusy(true); setCancelMessage(null)
    const fullReason = cancelReason === 'other' ? cancelReasonOther : (CANCEL_REASONS.find(r => r.id === cancelReason)?.label ?? cancelReason)
    try {
      const res = await fetch('/api/stripe/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: fullReason }),
      })
      const data = await res.json()
      if (!data.ok) throw new Error(data.error ?? 'Cancellation failed')
      setCancelMessage(data.effectiveAt
        ? `Cancellation confirmed. You have full access until ${new Date(data.effectiveAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })}.`
        : 'Cancellation confirmed.')
      setCancelStep(0)
    } catch (e) {
      setCancelMessage((e as Error).message)
    } finally {
      setCancelBusy(false)
    }
  }

  const selectedReason = CANCEL_REASONS.find(r => r.id === cancelReason)
  const offer = selectedReason ? OFFERS[selectedReason.offer] : null

  return (
    <div className="mx-auto max-w-[900px] px-5 py-6 md:px-7 md:py-7">

      {/* ── Page heading ──────────────────────────────── */}
      <h1 className="mb-5 text-[20px] font-[800] tracking-[-0.4px] text-text">Billing</h1>

      {/* ── 1. Plan hero ──────────────────────────────── */}
      <div className="tm-hero relative mb-5 overflow-hidden rounded-[18px] border border-line p-[26px_32px] shadow-[0_1px_4px_rgba(0,0,0,.28)]">
        {/* Glow */}
        <div className="pointer-events-none absolute right-[-80px] top-[-60px] h-[280px] w-[280px] rounded-full"
          style={{ background: 'radial-gradient(circle,rgba(238,106,44,.25),transparent 70%)', filter: 'blur(15px)' }}
          aria-hidden="true" />

        <div className="relative z-10 flex flex-col gap-5 md:flex-row md:items-center md:gap-7">
          {/* Left: plan details */}
          <div className="flex-1">
            {/* Plan badge */}
            <span className="inline-flex items-center gap-[7px] rounded-full bg-[linear-gradient(135deg,#f58a42,#e86526)] px-4 py-[7px] text-[13px] font-[800] text-white shadow-[0_6px_18px_rgba(238,106,44,.45)]">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
              </svg>
              {planConfig.label} Plan
            </span>

            {/* Business name */}
            <div className="mt-3 text-[26px] font-[800] leading-tight tracking-[-0.6px] text-text">
              {businessName || ' '}
            </div>

            {/* Price line */}
            <div className="mt-[5px] text-[14px] text-dim">
              <b className="text-[16px] font-[800] text-text">${planConfig.monthlyPrice}</b>
              {' / month'}
              {billingCycle === 'annual' && <span className="ml-2 text-[11px] font-[700] text-green">· Annual billing</span>}
            </div>

            {/* Renew / access ends */}
            <div className="mt-1 text-[12.5px] text-faint">
              {willEndAt
                ? alreadyCancelled
                  ? `Access ends: ${new Date(willEndAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}`
                  : `Renews ${new Date(willEndAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })} · ${billingCycle === 'annual' ? 'paid annually' : 'paid monthly'}`
                : 'Subscription details syncing…'}
            </div>

            {/* Setup fee tag */}
            {(setupFeeWaived || setupFeeAmount != null) && (
              <div className="mt-2 inline-block rounded-full border px-[9px] py-[3px] text-[11px] font-[700] uppercase tracking-[.06em]"
                style={{
                  background: setupFeeWaived ? 'rgba(148,163,184,0.18)' : 'rgba(74,159,232,0.12)',
                  color: setupFeeWaived ? '#94A3B8' : '#4A9FE8',
                  borderColor: setupFeeWaived ? 'rgba(148,163,184,0.35)' : 'rgba(74,159,232,0.3)',
                }}>
                {setupFeeWaived ? 'Setup fee: waived' : `Setup fee: paid $${setupFeeAmount}`}
              </div>
            )}

            {/* Feature checks */}
            <div className="mt-[14px] flex flex-wrap gap-x-[18px] gap-y-[8px]">
              {planConfig.features.slice(0, 4).map(f => (
                <span key={f} className="flex items-center gap-[6px] text-[13px] font-[600] text-text">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-green flex-shrink-0">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="M22 4L12 14.01l-3-3"/>
                  </svg>
                  {f}
                </span>
              ))}
              {/* Active / Ending badge */}
              {alreadyCancelled ? (
                <span className="flex items-center rounded-full bg-[rgba(245,158,11,0.12)] px-3 py-1 text-[12px] font-[600] text-[#F59E0B]">Ending</span>
              ) : (
                <span className="flex items-center rounded-full bg-green-soft px-3 py-1 text-[12px] font-[600] text-green">Active</span>
              )}
            </div>
          </div>

          {/* Right: action buttons */}
          <div className="flex flex-shrink-0 flex-col gap-2 md:items-end">
            {planConfig.key !== 'pro' && (
              <ButtonV2 variant="primary" className="w-full px-[22px] py-[11px] text-[13.5px] font-[800] md:w-auto"
                onClick={openStripePortal}>
                Upgrade →
              </ButtonV2>
            )}
            <ButtonV2 variant="secondary" className="w-full px-[22px] py-[9px] text-[13px] font-[700] md:w-auto"
              onClick={openStripePortal}>
              Manage subscription
            </ButtonV2>
          </div>
        </div>
      </div>

      {/* ── 3. Three-column info cards ────────────────── */}
      <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-3">

        {/* Card A: Usage meter */}
        <Panel>
          <h3 className="mb-[14px] text-[12px] font-[700] uppercase tracking-[.06em] text-faint">Usage this month</h3>
          <Meter
            label="Calls handled"
            value={callsThisMonth}
            cap={planConfig.callLimit ?? 0}
            pills={
              planConfig.callLimit ? (
                <span className="text-[12px] text-dim">
                  {usagePct}% used
                  {planConfig.callLimit && callsThisMonth >= planConfig.callLimit && (
                    <span className="ml-2 font-[700] text-[#F59E0B]">· Cap reached</span>
                  )}
                </span>
              ) : (
                <span className="text-[12px] text-dim">Unlimited</span>
              )
            }
          />
        </Panel>

        {/* Card B: Payment method */}
        <Panel>
          <h3 className="mb-[14px] text-[12px] font-[700] uppercase tracking-[.06em] text-faint">Payment method</h3>
          {stripeSummary?.paymentMethod ? (
            <>
              <div className="mb-3 flex items-center gap-3 rounded-[11px] border border-[rgba(255,255,255,.10)] bg-card-2 p-[12px_14px]">
                <div className="flex h-7 w-[42px] flex-shrink-0 items-center justify-center rounded-[6px] bg-[linear-gradient(135deg,#1a4a8a,#0d2e5c)] text-[11px] font-[800] uppercase text-white">
                  {stripeSummary.paymentMethod.brand.slice(0, 4)}
                </div>
                <div className="flex-1">
                  <div className="text-[14px] font-[700] text-text">
                    •••• •••• •••• {stripeSummary.paymentMethod.last4}
                  </div>
                  <div className="text-[12px] text-dim">
                    Expires {String(stripeSummary.paymentMethod.exp_month).padStart(2, '0')}/{String(stripeSummary.paymentMethod.exp_year).slice(-2)}
                  </div>
                </div>
              </div>
              <button
                onClick={openStripePortal}
                className="block w-full text-right text-[12.5px] font-[700] text-orange hover:opacity-80 transition-opacity">
                Update payment method →
              </button>
            </>
          ) : (
            <button
              onClick={openStripePortal}
              className="w-full rounded-[8px] border border-[rgba(232,98,42,0.3)] bg-[rgba(232,98,42,0.12)] p-[10px] text-[13px] font-[600] text-orange cursor-pointer transition-opacity hover:opacity-80 font-[Outfit,sans-serif]">
              + Add payment method
            </button>
          )}
          {/* Auto-pay & email rows */}
          <div className="mt-4 border-t border-line pt-3 flex flex-col gap-[9px]">
            <div className="flex items-center justify-between text-[13px]">
              <span className="text-dim">Auto-pay</span>
              <span className="font-[700] text-green">Enabled</span>
            </div>
          </div>
        </Panel>

        {/* Card C: Next invoice */}
        <Panel>
          <h3 className="mb-[14px] text-[12px] font-[700] uppercase tracking-[.06em] text-faint">Next invoice</h3>
          <div className="tnum text-[32px] font-[800] leading-none tracking-[-1px] text-text">
            ${nextInvoiceTotal.toFixed(2)}
          </div>
          <div className="mt-[3px] text-[12.5px] text-dim">
            {willEndAt && !alreadyCancelled
              ? `Due ${new Date(willEndAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })}`
              : 'No upcoming invoice'}
          </div>
          {!alreadyCancelled && (
            <div className="mt-3 border-t border-line pt-3 flex flex-col gap-[7px]">
              <div className="flex justify-between text-[13px]">
                <span className="text-dim">{planConfig.label} Plan (inc. GST)</span>
                <span className="font-[700]">${nextInvoiceTotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-[13px]">
                <span className="text-dim">Includes GST (10%)</span>
                <span className="font-[700]">${nextInvoiceGst.toFixed(2)}</span>
              </div>
              <div className="flex justify-between border-t border-line pt-2 text-[14px]">
                <span className="font-[700]">Total (inc. GST)</span>
                <span className="font-[800] text-orange">${nextInvoiceTotal.toFixed(2)}</span>
              </div>
            </div>
          )}
        </Panel>
      </div>

      {/* ── Plan comparison ── */}
      <PlanComparison currentPlan={plan} />

      {/* ── ROI summary (conditional) ─────────────────── */}
      {lifetimeRevenue > 0 && (
        <div className="mb-5 rounded-[14px] border border-[rgba(232,98,42,0.25)] p-5"
          style={{ background: 'linear-gradient(135deg, rgba(232,98,42,0.08), rgba(74,159,232,0.04))' }}>
          <div className="mb-2 text-[11px] font-[700] uppercase tracking-[.08em] text-orange">Your TalkMate ROI</div>
          <div className="text-[14px] leading-[1.6] text-text">
            TalkMate has captured an estimated <strong className="text-orange">${lifetimeRevenue.toLocaleString()}</strong> in revenue for <strong>{businessName || 'your business'}</strong>{signupAt ? ` since ${new Date(signupAt).toLocaleDateString('en-AU', { month: 'short', year: 'numeric' })}` : ''}.
          </div>
          <div className="mt-[6px] text-[14px] text-dim">
            Total investment: <strong className="text-text">${totalPaid.toLocaleString()}</strong>. That&apos;s a <strong className="text-green">{roiMultiple.toFixed(1)}× return</strong>.
          </div>
        </div>
      )}

      {/* ── 4. Add-ons section ────────────────────────── */}
      <div className="mb-[18px] flex items-center gap-[14px]">
        <div className="flex-1">
          <h3 className="text-[16px] font-[800] tracking-[-0.2px] text-text">Grow your revenue with add-ons</h3>
          <p className="mt-1 text-[12.5px] text-dim">Each add-on pays for itself — most clients recover the cost within the first week.</p>
        </div>
        <div className="flex-shrink-0 text-right">
          <div className="tnum text-[28px] font-[800] tracking-[-1px] text-orange">14x</div>
          <div className="text-[10.5px] text-faint">average add-on ROI</div>
        </div>
      </div>

      <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <AddOnCard
          iconBg="rgba(242,181,60,.12)"
          iconStroke="#f2b53c"
          iconPath={<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>}
          title="Google Reviews Automation"
          dataProof={<>An estimated 72% of your calls end positively. That&apos;s roughly <strong>{weeklyPositiveCalls} review requests</strong> you could have sent this week — automatically.</>}
          features={['Automatic review requests after every positive call', 'Smart timing — sent when satisfaction is highest', 'Google & Facebook review collection', 'Review performance dashboard']}
          price="49"
          cta="Unlock →"
          primary={true}
        />
        <AddOnCard
          iconBg="rgba(91,155,217,.12)"
          iconStroke="#5b9bd9"
          iconPath={<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>}
          title="Missed Call SMS Follow-ups"
          dataProof={<>You had <strong>{missedCallCount} missed call{missedCallCount !== 1 ? 's' : ''}</strong> this month. Without follow-up, a missed caller goes to a competitor within 5 minutes.</>}
          features={['Auto-SMS within 5 min of every missed call', 'Customisable message templates', 'Two-way SMS conversation support', 'Missed call recovery tracking']}
          price="39"
          cta="Unlock →"
          primary={true}
        />
        <AddOnCard
          iconBg="rgba(238,106,44,.12)"
          iconStroke="#ee6a2c"
          iconPath={<><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 15a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 4.23h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L7.91 11a16 16 0 0 0 6 6l.92-.92a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/><polyline points="22 4 12 14.01 9 11.01"/></>}
          title="Outbound AI Calls"
          dataProof="Outbound AI can confirm every job, chase quotes, and follow up no-shows — while you sleep. Zero staff time required."
          features={['Automated job confirmation calls', 'Quote follow-up sequences', 'No-show re-engagement', 'Full call transcripts logged']}
          price="79"
          cta="Learn more →"
          primary={false}
        />
      </div>

      {/* ── 5. Invoice history table ──────────────────── */}
      <div className="mb-5 overflow-hidden rounded-[var(--r)] border border-line bg-card shadow-[0_1px_4px_rgba(0,0,0,.28)]">
        <div className="flex items-center justify-between border-b border-line px-5 py-[18px]">
          <h3 className="text-[12px] font-[700] uppercase tracking-[.06em] text-faint">Invoice history</h3>
          <button
            onClick={openStripePortal}
            className="cursor-pointer bg-transparent border-none text-[12px] font-[600] text-blue hover:opacity-80 transition-opacity font-[Outfit,sans-serif]">
            View all in Stripe →
          </button>
        </div>

        {(stripeSummary?.invoices.length ?? 0) === 0 ? (
          <div className="px-5 py-4 text-center text-[13px] text-dim">
            {stripeSummary?.hasStripe === false
              ? 'No Stripe customer linked yet. Invoices will appear here after your first payment.'
              : 'No invoices yet.'}
          </div>
        ) : (
          <>
            {/* Table head */}
            <div className="grid grid-cols-[1fr_120px_110px_90px_100px] gap-[14px] border-b border-line px-5 py-[9px]">
              {['Period', 'Invoice #', 'Date', 'Amount', 'Status'].map(h => (
                <div key={h} className="text-[11px] font-[700] uppercase tracking-[.06em] text-faint">{h}</div>
              ))}
            </div>
            {/* Rows */}
            {(stripeSummary?.invoices ?? []).map(inv => (
              <div key={inv.id}
                className="grid grid-cols-[1fr_120px_110px_90px_100px] gap-[14px] items-center border-b border-line px-5 py-3 last:border-b-0 hover:bg-[rgba(255,255,255,.02)] transition-colors">
                <div className="text-[13.5px] font-[700] text-text">
                  {new Date(inv.created * 1000).toLocaleDateString('en-AU', { month: 'short', year: 'numeric' })}
                </div>
                <div className="font-mono text-[12.5px] text-dim">—</div>
                <div className="text-[12.5px] text-dim">
                  {new Date(inv.created * 1000).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
                </div>
                <div className="tnum text-[13.5px] font-[800] text-text">
                  ${inv.amount.toFixed(2)}
                </div>
                <div>
                  <span className={`inline-block rounded-[7px] px-[9px] py-[3px] text-[11.5px] font-[700] capitalize whitespace-nowrap ${
                    inv.status === 'paid'
                      ? 'bg-green-soft text-green'
                      : inv.status === 'open'
                      ? 'bg-[rgba(245,158,11,.12)] text-[#F59E0B]'
                      : 'bg-[rgba(240,98,90,.16)] text-[#F0625A]'
                  }`}>
                    {inv.status}
                  </span>
                </div>
              </div>
            ))}
          </>
        )}
      </div>

      {/* Download PDF links (separate row, shown if any invoice has pdf) */}
      {(stripeSummary?.invoices ?? []).some(inv => inv.invoice_pdf) && (
        <div className="mb-5 flex flex-wrap gap-3">
          {(stripeSummary?.invoices ?? []).filter(inv => inv.invoice_pdf).map(inv => (
            <a key={inv.id} href={inv.invoice_pdf!} target="_blank" rel="noreferrer"
              className="text-[12.5px] font-[700] text-orange no-underline hover:opacity-80 transition-opacity">
              Download {new Date(inv.created * 1000).toLocaleDateString('en-AU', { month: 'short', year: 'numeric' })} PDF
            </a>
          ))}
        </div>
      )}

      {/* ── Cancel subscription flow ──────────────────── */}
      <div className="text-center">
        {cancelMessage && (
          <div className="mx-auto mb-3 max-w-[520px] rounded-[8px] bg-green-soft p-[10px_14px] text-[13px] text-green">
            {cancelMessage}
          </div>
        )}

        {alreadyCancelled && willEndAt && (
          <div className="mx-auto max-w-[520px] rounded-[10px] border border-[rgba(245,158,11,.2)] bg-[rgba(245,158,11,.08)] p-[12px_16px] text-[13px] text-[#F59E0B]">
            Your subscription is set to cancel on {new Date(willEndAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })}.
          </div>
        )}

        {!alreadyCancelled && cancelStep === 0 && (
          <button onClick={() => setCancelStep(1)}
            className="cursor-pointer border-none bg-transparent font-[Outfit,sans-serif] text-[13px] text-faint hover:text-dim transition-colors">
            Cancel subscription
          </button>
        )}

        {/* Step 1 — Reason */}
        {cancelStep === 1 && (
          <div className="mx-auto max-w-[520px] rounded-[16px] border border-[rgba(239,68,68,.2)] bg-card p-7 text-left">
            <div className="mb-[10px] text-[11px] font-[700] uppercase tracking-[.10em] text-[#EF4444]">Cancel subscription</div>
            <div className="mb-[6px] text-[18px] font-[800] text-text">Before you go — what happened?</div>
            <p className="mb-5 text-[13px] leading-[1.6] text-dim">Your feedback helps us improve. Please pick the main reason.</p>
            <div className="mb-5 flex flex-col gap-2">
              {CANCEL_REASONS.map(r => (
                <label key={r.id}
                  className="flex cursor-pointer items-center gap-3 rounded-[10px] border p-[12px_16px] transition-colors"
                  style={{
                    background: cancelReason === r.id ? 'rgba(239,68,68,0.1)' : 'rgba(255,255,255,0.03)',
                    borderColor: cancelReason === r.id ? 'rgba(239,68,68,0.5)' : 'rgba(255,255,255,0.07)',
                  }}>
                  <input type="radio" name="cancelReason" value={r.id} checked={cancelReason === r.id}
                    onChange={() => setCancelReason(r.id)}
                    className="h-4 w-4 flex-shrink-0 accent-[#EF4444]" />
                  <span className="text-[14px] text-text">{r.label}</span>
                </label>
              ))}
            </div>
            {cancelReason === 'other' && (
              <textarea value={cancelReasonOther} onChange={e => setCancelReasonOther(e.target.value)} rows={2}
                placeholder="Tell us more..."
                className="mb-[14px] w-full resize-y rounded-[8px] border border-[rgba(255,255,255,.1)] bg-[rgba(255,255,255,.04)] p-[10px_12px] font-[Outfit,sans-serif] text-[13px] text-text placeholder:text-faint" />
            )}
            <div className="flex gap-[10px]">
              <button onClick={() => { setCancelStep(0); setCancelReason('') }}
                className="flex-1 cursor-pointer rounded-[10px] border border-[rgba(255,255,255,.15)] bg-transparent p-3 font-[Outfit,sans-serif] text-[14px] font-[600] text-text">
                Keep my subscription
              </button>
              <button onClick={() => setCancelStep(2)} disabled={!cancelReason}
                className="flex-1 cursor-pointer rounded-[10px] border-none p-3 font-[Outfit,sans-serif] text-[14px] font-[700] text-white"
                style={{ background: cancelReason ? '#EF4444' : 'rgba(239,68,68,0.3)', cursor: cancelReason ? 'pointer' : 'not-allowed' }}>
                Continue →
              </button>
            </div>
          </div>
        )}

        {/* Step 2 — Retention offer */}
        {cancelStep === 2 && offer && (
          <div className="mx-auto max-w-[520px] rounded-[16px] border border-[rgba(74,159,232,.25)] bg-card p-7 text-left">
            <div className="mb-[10px] text-[11px] font-[700] uppercase tracking-[.10em] text-blue">Wait — one moment</div>
            <div className="mb-[10px] text-[18px] font-[800] text-text">{offer.heading}</div>
            <p className="mb-[22px] text-[14px] leading-[1.65] text-dim">{offer.body}</p>
            <a href={offer.href}
              className="mb-[10px] block w-full rounded-[10px] bg-[linear-gradient(135deg,#f58a42,#e86526)] p-[14px] text-center text-[15px] font-[700] text-white no-underline shadow-[0_4px_14px_rgba(238,106,44,.35)] hover:opacity-90 transition-opacity">
              {offer.cta} →
            </a>
            <button onClick={() => setCancelStep(3)}
              className="w-full cursor-pointer rounded-[10px] border border-[rgba(255,255,255,.08)] bg-transparent p-[11px] font-[Outfit,sans-serif] text-[13px] font-[500] text-faint">
              No thanks, I still want to cancel
            </button>
          </div>
        )}

        {/* Step 3 — Final confirm */}
        {cancelStep === 3 && (
          <div className="mx-auto max-w-[520px] rounded-[16px] border border-[rgba(239,68,68,.35)] bg-card p-7 text-left">
            <div className="mb-3 text-[17px] font-[800] text-text">Are you sure?</div>
            <ul className="mb-5 list-disc pl-[18px] text-[13px] leading-[1.8] text-dim">
              <li>Your AI agent will stop answering calls at the end of the billing period.</li>
              <li>Your contacts, call history, and smart lists are kept for 90 days.</li>
              <li>Your dedicated phone number will be released back to TalkMate.</li>
              <li>You can re-subscribe at any time — setup fee waived for returning clients.</li>
            </ul>
            <div className="flex gap-[10px]">
              <button onClick={() => setCancelStep(0)}
                className="flex-1 cursor-pointer rounded-[10px] border border-[rgba(34,197,94,.25)] bg-green-soft p-3 font-[Outfit,sans-serif] text-[14px] font-[700] text-green">
                Keep my subscription ✓
              </button>
              <button onClick={confirmCancel} disabled={cancelBusy}
                className="flex-1 cursor-pointer rounded-[10px] border-none bg-[#EF4444] p-3 font-[Outfit,sans-serif] text-[14px] font-[700] text-white disabled:opacity-70 disabled:cursor-wait">
                {cancelBusy ? 'Cancelling…' : 'Yes, cancel my subscription'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
