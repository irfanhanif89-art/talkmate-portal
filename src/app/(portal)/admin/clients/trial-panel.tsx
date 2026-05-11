'use client'

import { useState } from 'react'
import type { AdminBusiness } from './types'
import { trialDaysRemaining } from './types'

// Trial and Billing management panel — rendered at the top of the
// edit-client modal. Surfaces the right controls for each account_status:
//
//   trial     → days remaining + Convert / Extend / End buttons
//   expired   → "trial ended on X" + Reactivate / Mark paid
//   active    → simple confirmation that the account is paid
//   cancelled → grey badge
//   pending / suspended → no trial controls (the existing modal handles those)
export function TrialManagementPanel({
  business, onUpdate,
}: {
  business: AdminBusiness
  onUpdate: (patch: Partial<AdminBusiness>) => void
}) {
  const status = business.account_status
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [showConvert, setShowConvert] = useState(false)

  async function call(action: string, body?: Record<string, unknown>) {
    setBusy(action); setErr(null)
    try {
      const res = await fetch(`/api/admin/clients/${business.id}/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      })
      const data = await res.json()
      if (!data.ok) throw new Error(data.error || 'Failed')
      return data
    } catch (e) {
      setErr((e as Error).message)
      throw e
    } finally {
      setBusy(null)
    }
  }

  async function extend() {
    const data = await call('extend-trial')
    onUpdate({
      account_status: 'trial',
      trial_end_date: data.business.trial_end_date,
    })
  }

  async function endNow() {
    if (!confirm('End this trial immediately? The agent will go offline.')) return
    const data = await call('end-trial')
    onUpdate({
      account_status: 'expired',
      trial_end_date: data.business.trial_end_date,
    })
  }

  async function reactivate() {
    const data = await call('reactivate-trial')
    onUpdate({
      account_status: 'trial',
      trial_start_date: data.business.trial_start_date,
      trial_end_date: data.business.trial_end_date,
    })
  }

  async function convert(plan: 'starter' | 'growth' | 'pro') {
    const data = await call('convert-trial', { plan })
    onUpdate({
      account_status: 'active',
      plan: data.business.plan,
      trial_converted_at: data.business.trial_converted_at,
    })
    setShowConvert(false)
  }

  if (!status || status === 'pending' || status === 'suspended') {
    return null
  }

  const days = trialDaysRemaining(business.trial_end_date)
  const endDateStr = business.trial_end_date
    ? new Date(business.trial_end_date).toLocaleDateString('en-AU')
    : null

  return (
    <div style={{
      marginTop: 14, marginBottom: 18,
      padding: 16, borderRadius: 12,
      background: bannerBg(status),
      border: `1px solid ${bannerBorder(status)}`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 240 }}>
          <p style={{ fontSize: 11, fontWeight: 800, color: bannerText(status), textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>
            Trial and Billing
          </p>
          <p style={{ fontSize: 14, fontWeight: 600, color: 'white', margin: '4px 0 0 0' }}>
            {status === 'trial' && (
              <>Trial active — <strong>{days} day{days === 1 ? '' : 's'} remaining</strong>{endDateStr ? ` (ends ${endDateStr})` : ''}.</>
            )}
            {status === 'expired' && (
              <>Trial ended{endDateStr ? ` on ${endDateStr}` : ''} — not converted.</>
            )}
            {status === 'active' && (
              <>Paid subscriber on the {business.plan ?? '—'} plan.</>
            )}
            {status === 'cancelled' && <>Account cancelled.</>}
          </p>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {status === 'trial' && (
            <>
              <button onClick={() => setShowConvert(true)} disabled={!!busy} style={btn('#22C55E')}>Convert to paid</button>
              <button onClick={extend} disabled={!!busy} style={btn('#4A9FE8')}>{busy === 'extend-trial' ? '…' : 'Extend 3 days'}</button>
              <button onClick={endNow} disabled={!!busy} style={btn('#EF4444', true)}>{busy === 'end-trial' ? '…' : 'End trial now'}</button>
            </>
          )}
          {status === 'expired' && (
            <>
              <button onClick={reactivate} disabled={!!busy} style={btn('#E8622A')}>{busy === 'reactivate-trial' ? '…' : 'Reactivate trial'}</button>
              <button onClick={() => setShowConvert(true)} disabled={!!busy} style={btn('#22C55E')}>Mark as paid</button>
            </>
          )}
        </div>
      </div>

      {err && <p style={{ marginTop: 10, fontSize: 12, color: '#FCA5A5' }}>{err}</p>}

      {showConvert && (
        <ConvertPlanPicker
          currentPlan={(business.plan === 'professional' ? 'pro' : business.plan) ?? 'starter'}
          busy={busy === 'convert-trial'}
          onCancel={() => setShowConvert(false)}
          onPick={convert}
        />
      )}
    </div>
  )
}

function ConvertPlanPicker({
  currentPlan, busy, onCancel, onPick,
}: {
  currentPlan: string
  busy: boolean
  onCancel: () => void
  onPick: (p: 'starter' | 'growth' | 'pro') => void
}) {
  const [plan, setPlan] = useState<'starter' | 'growth' | 'pro'>(
    (currentPlan === 'starter' || currentPlan === 'growth' || currentPlan === 'pro') ? currentPlan : 'starter'
  )
  return (
    <div style={{
      marginTop: 14, padding: 14, borderRadius: 10,
      background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.3)',
    }}>
      <p style={{ fontSize: 13, fontWeight: 700, color: 'white', margin: 0, marginBottom: 10 }}>
        Confirm plan. Stripe payment link is sent manually after this.
      </p>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <select
          value={plan}
          onChange={e => setPlan(e.target.value as 'starter' | 'growth' | 'pro')}
          style={{
            padding: '8px 12px', borderRadius: 8,
            background: '#071829', border: '1px solid rgba(255,255,255,0.1)',
            color: 'white', fontSize: 13, fontFamily: 'Outfit, sans-serif',
          }}
        >
          <option value="starter">Starter ($299/mo)</option>
          <option value="growth">Growth ($499/mo)</option>
          <option value="pro">Pro ($799/mo)</option>
        </select>
        <button onClick={() => onPick(plan)} disabled={busy} style={btn('#22C55E')}>
          {busy ? 'Converting…' : 'Confirm convert'}
        </button>
        <button onClick={onCancel} style={btn('#6B7280', true)}>Cancel</button>
      </div>
    </div>
  )
}

function bannerBg(status: AdminBusiness['account_status']): string {
  if (status === 'trial') return 'rgba(232,98,42,0.08)'
  if (status === 'expired') return 'rgba(239,68,68,0.08)'
  if (status === 'cancelled') return 'rgba(107,114,128,0.10)'
  return 'rgba(34,197,94,0.08)' // active
}

function bannerBorder(status: AdminBusiness['account_status']): string {
  if (status === 'trial') return 'rgba(232,98,42,0.35)'
  if (status === 'expired') return 'rgba(239,68,68,0.35)'
  if (status === 'cancelled') return 'rgba(107,114,128,0.30)'
  return 'rgba(34,197,94,0.30)'
}

function bannerText(status: AdminBusiness['account_status']): string {
  if (status === 'trial') return '#E8622A'
  if (status === 'expired') return '#EF4444'
  if (status === 'cancelled') return '#9CA3AF'
  return '#22C55E'
}

function btn(color: string, subtle = false): React.CSSProperties {
  return {
    padding: '8px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700,
    background: subtle ? 'transparent' : color,
    border: `1px solid ${color}`,
    color: subtle ? color : 'white',
    cursor: 'pointer', fontFamily: 'Outfit, sans-serif',
  }
}

// ---------- Onboarding-complete button ----------

export function OnboardingCompleteButton({
  business, onUpdate,
}: {
  business: AdminBusiness
  onUpdate: (patch: Partial<AdminBusiness>) => void
}) {
  const [busy, setBusy] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const [result, setResult] = useState<{ status: string; error: string | null } | null>(null)

  async function fire() {
    setBusy(true); setResult(null)
    try {
      const res = await fetch(`/api/admin/clients/${business.id}/onboarding-complete`, { method: 'POST' })
      const data = await res.json()
      if (!data.ok) throw new Error(data.error || 'Failed')
      onUpdate({
        onboarding_complete: true,
        onboarding_complete_at: data.business.onboarding_complete_at,
      })
      setResult({ status: data.webhook?.status ?? 'sent', error: data.webhook?.error ?? null })
      setConfirm(false)
    } catch (e) {
      setResult({ status: 'failed', error: (e as Error).message })
    } finally {
      setBusy(false)
    }
  }

  if (business.onboarding_complete) {
    return (
      <div style={{
        marginTop: 22, padding: 14, borderRadius: 10,
        background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.35)',
      }}>
        <p style={{ fontSize: 13, fontWeight: 700, color: '#22C55E', margin: 0 }}>
          ✓ Donna briefed
          {business.onboarding_complete_at && (
            <span style={{ marginLeft: 8, fontSize: 11, color: '#7BAED4', fontWeight: 500 }}>
              {new Date(business.onboarding_complete_at).toLocaleString('en-AU')}
            </span>
          )}
        </p>
        <button
          onClick={() => setConfirm(true)}
          disabled={busy}
          style={{
            marginTop: 8, padding: 0, background: 'transparent', border: 'none',
            color: '#7BAED4', fontSize: 12, fontWeight: 600, textDecoration: 'underline',
            cursor: 'pointer', fontFamily: 'Outfit, sans-serif',
          }}
        >Re-brief Donna</button>
        {confirm && (
          <ConfirmBriefDonna busy={busy} onCancel={() => setConfirm(false)} onConfirm={fire} />
        )}
      </div>
    )
  }

  return (
    <div style={{ marginTop: 22 }}>
      <button
        onClick={() => setConfirm(true)}
        disabled={busy}
        style={{
          padding: '14px 24px', borderRadius: 10, fontSize: 14, fontWeight: 700,
          background: '#E8622A', border: 'none', color: 'white',
          cursor: busy ? 'wait' : 'pointer', fontFamily: 'Outfit, sans-serif',
          boxShadow: '0 4px 16px rgba(232,98,42,0.3)',
        }}
      >
        {busy ? 'Briefing Donna…' : 'Mark onboarding complete and brief Donna'}
      </button>
      {result && result.status !== 'sent' && (
        <p style={{ marginTop: 10, fontSize: 12, color: result.status === 'failed' ? '#FCA5A5' : '#F59E0B' }}>
          {result.status === 'skipped_no_url'
            ? 'Flag set, but Make.com webhook URL is not configured — brief Donna manually.'
            : `Webhook failed: ${result.error}`}
        </p>
      )}
      {confirm && (
        <ConfirmBriefDonna busy={busy} onCancel={() => setConfirm(false)} onConfirm={fire} />
      )}
    </div>
  )
}

function ConfirmBriefDonna({
  busy, onCancel, onConfirm,
}: {
  busy: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  return (
    <div style={{
      marginTop: 12, padding: 14, borderRadius: 10,
      background: 'rgba(232,98,42,0.06)', border: '1px solid rgba(232,98,42,0.35)',
    }}>
      <p style={{ fontSize: 13, color: 'white', margin: 0, marginBottom: 12 }}>
        This will send Donna a full agent build brief via the Make.com webhook.
        Make sure all services, hours, and pricing are filled in before proceeding.
      </p>
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={onConfirm} disabled={busy} style={btn('#E8622A')}>{busy ? 'Sending…' : 'Yes, brief Donna'}</button>
        <button onClick={onCancel} disabled={busy} style={btn('#6B7280', true)}>Cancel</button>
      </div>
    </div>
  )
}
