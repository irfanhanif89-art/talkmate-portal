'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import {
  AdminBusiness, PartnerOption, planLabel, statusColor, statusLabel,
  industryLabel, trialDaysRemaining,
} from './types'
import CreateClientModal from './create-client-modal'
import EditClientModal from './edit-client-modal'
import { integrationModeChip } from '@/lib/onboarding-admin'

interface QualitySummary {
  avg: number | null
  criticalToday: number
  count: number
}

interface BusinessRoi {
  estimatedRevenue: number
  chatLeads: number
  chatbotEnabled: boolean
}

function fmtRoi(n: number): string {
  return `$${Math.round(n).toLocaleString('en-AU')}`
}

function qualityDot(q: QualitySummary | undefined): { color: string; tooltip: string } {
  if (!q || q.count === 0) {
    return { color: 'rgba(255,255,255,0.18)', tooltip: 'No scored calls yet' }
  }
  if (q.criticalToday > 0) {
    return { color: '#EF4444', tooltip: `${q.criticalToday} critical today` }
  }
  if (q.avg == null) {
    return { color: 'rgba(255,255,255,0.18)', tooltip: 'No score available' }
  }
  if (q.avg >= 8) return { color: '#22C55E', tooltip: `Avg ${q.avg.toFixed(1)}/10 last 7d` }
  if (q.avg >= 5) return { color: '#F59E0B', tooltip: `Avg ${q.avg.toFixed(1)}/10 last 7d` }
  return { color: '#EF4444', tooltip: `Avg ${q.avg.toFixed(1)}/10 last 7d` }
}

export default function AdminClientsView({
  initialBusinesses,
  partners,
  qualityByBusiness = {},
  roiByBusiness = {},
  emailUnreadByBusiness = {},
  gapsByBusiness = {},
  flaggedByBusiness = {},
}: {
  initialBusinesses: AdminBusiness[]
  partners: PartnerOption[]
  qualityByBusiness?: Record<string, QualitySummary>
  roiByBusiness?: Record<string, BusinessRoi>
  emailUnreadByBusiness?: Record<string, number>
  gapsByBusiness?: Record<string, number>
  flaggedByBusiness?: Record<string, number>
}) {
  const [businesses, setBusinesses] = useState<AdminBusiness[]>(initialBusinesses)
  const [createOpen, setCreateOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<'all' | 'trial' | 'pending' | 'active' | 'expired' | 'suspended' | 'cancelled'>('active')
  const [search, setSearch] = useState('')
  const [paymentLinkBusy, setPaymentLinkBusy] = useState<string | null>(null)
  const [impersonateBusy, setImpersonateBusy] = useState<string | null>(null)
  const [activateBusy, setActivateBusy] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const stats = useMemo(() => {
    const total = businesses.length
    const trial = businesses.filter(b => b.account_status === 'trial').length
    const active = businesses.filter(b => b.account_status === 'active').length
    const pending = businesses.filter(b => b.account_status === 'pending').length
    const expired = businesses.filter(b => b.account_status === 'expired').length
    const suspended = businesses.filter(b => b.account_status === 'suspended').length
    const cancelled = businesses.filter(b => b.account_status === 'cancelled').length
    return { total, trial, active, pending, expired, suspended, cancelled }
  }, [businesses])

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase()
    const list = businesses.filter(b => {
      if (statusFilter !== 'all' && b.account_status !== statusFilter) return false
      if (!s) return true
      return (
        b.name.toLowerCase().includes(s) ||
        (b.industry ?? '').toLowerCase().includes(s) ||
        (b.phone_number ?? '').toLowerCase().includes(s)
      )
    })
    // Sprint Session 2 — default sort by estimated this-month ROI descending
    // so the highest-value clients surface first.
    return [...list].sort((a, b) => {
      const aRoi = roiByBusiness[a.id]?.estimatedRevenue ?? 0
      const bRoi = roiByBusiness[b.id]?.estimatedRevenue ?? 0
      return bRoi - aRoi
    })
  }, [businesses, statusFilter, search, roiByBusiness])

  function patchBusiness(id: string, patch: Partial<AdminBusiness>) {
    setBusinesses(rows => rows.map(b => b.id === id ? { ...b, ...patch } : b))
  }

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 3500)
  }

  // Refresh the admin session before any API mutation.
  // If the cookie has expired, redirects to login instead of showing
  // a confusing "Unauthorized" toast.
  async function ensureSession(): Promise<boolean> {
    try {
      const { createClient } = await import('@/lib/supabase/client')
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { window.location.href = '/login'; return false }
      await supabase.auth.refreshSession()
      return true
    } catch { return true }
  }

  async function handleActivate(id: string) {
    setActivateBusy(id)
    if (!await ensureSession()) { setActivateBusy(null); return }
    try {
      const res = await fetch(`/api/admin/clients/${id}/activate`, { method: 'POST' })
      const data = await res.json()
      if (!data.ok) throw new Error(data.error || 'Failed')
      patchBusiness(id, { account_status: 'active' })
      showToast('Account activated')
    } catch (e) {
      showToast((e as Error).message)
    } finally {
      setActivateBusy(null)
    }
  }

  async function handlePaymentLink(id: string) {
    setPaymentLinkBusy(id)
    if (!await ensureSession()) { setPaymentLinkBusy(null); return }
    try {
      const res = await fetch(`/api/admin/clients/${id}/generate-payment-link`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
      const data = await res.json()
      if (!data.ok) throw new Error(data.error || 'Failed')
      patchBusiness(id, { stripe_payment_link: data.url })
      try { await navigator.clipboard.writeText(data.url) } catch {}
      showToast('Payment link copied')
    } catch (e) {
      showToast((e as Error).message)
    } finally {
      setPaymentLinkBusy(null)
    }
  }

  async function handleImpersonate(id: string) {
    setImpersonateBusy(id)
    try {
      if (!await ensureSession()) return
      const res = await fetch(`/api/admin/clients/${id}/impersonate`, { method: 'POST' })
      const data = await res.json()
      if (!data.ok) throw new Error(data.error || 'Failed')
      // Copy link to clipboard — must be opened in a private/incognito window.
      // Opening in the same browser swaps the Supabase cookie and logs out the admin.
      try { await navigator.clipboard.writeText(data.url) } catch {}
      showToast(`Link copied for ${data.business_name} — paste into a private/incognito window`)
    } catch (e) {
      showToast((e as Error).message)
    } finally {
      setImpersonateBusy(null)
    }
  }

  const editing = businesses.find(b => b.id === editingId) ?? null

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8, marginBottom: 22 }}>
        <h1 style={{ fontSize: '1.6rem', fontWeight: 800, color: 'white', margin: 0 }}>Client Management</h1>
        <div style={{ display: 'flex', gap: 10 }}>
          <Link
            href="/admin/clients/overview"
            style={{
              padding: '10px 16px', borderRadius: 10, fontSize: 13, fontWeight: 600,
              background: 'rgba(74,159,232,0.10)', border: '1px solid rgba(74,159,232,0.3)',
              color: '#4A9FE8', textDecoration: 'none', fontFamily: 'Outfit, sans-serif',
            }}
          >Health overview →</Link>
          <button
            onClick={() => setCreateOpen(true)}
            style={{
              padding: '10px 18px', borderRadius: 10, fontSize: 13, fontWeight: 700,
              background: '#E8622A', border: 'none', color: 'white', cursor: 'pointer',
              fontFamily: 'Outfit, sans-serif',
            }}
          >+ Create new client</button>
        </div>
      </div>

      {/* Stats strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 16 }}>
        {[
          { label: 'Total', value: stats.total, color: '#4A9FE8' },
          { label: 'Trial', value: stats.trial, color: '#E8622A' },
          { label: 'Active', value: stats.active, color: '#22C55E' },
          { label: 'Pending', value: stats.pending, color: '#F59E0B' },
          { label: 'Expired', value: stats.expired, color: '#EF4444' },
          { label: 'Suspended', value: stats.suspended, color: '#EF4444' },
          { label: 'Cancelled', value: stats.cancelled, color: '#6B7280' },
        ].map(s => (
          <div key={s.label} style={{ background: '#0A1E38', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: 14, overflow: 'hidden' }}>
            <div style={{ height: 2, background: s.color, marginLeft: -14, marginRight: -14, marginTop: -14, marginBottom: 10 }} />
            <p style={{ fontSize: 11, fontWeight: 700, color: '#7BAED4', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>{s.label}</p>
            <p style={{ fontSize: 22, fontWeight: 800, color: 'white', letterSpacing: '-0.5px' }}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Pending banner */}
      {stats.pending > 0 && (
        <div
          onClick={() => setStatusFilter('pending')}
          style={{
            padding: '12px 18px', background: 'rgba(245,158,11,0.10)',
            border: '1px solid rgba(245,158,11,0.4)', borderRadius: 10, marginBottom: 18,
            display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer',
          }}
        >
          <span style={{ fontSize: 13, color: '#F59E0B', fontWeight: 600 }}>
            {stats.pending} client account{stats.pending === 1 ? '' : 's'} pending activation.
          </span>
          <span style={{ fontSize: 12, color: '#F59E0B', fontWeight: 700 }}>View pending →</span>
        </div>
      )}

      {/* Filter bar */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 14, alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          placeholder="Search by name, industry, phone…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            flex: 1, minWidth: 220, padding: '9px 14px', borderRadius: 8,
            background: '#071829', border: '1px solid rgba(255,255,255,0.1)',
            color: 'white', fontSize: 13, fontFamily: 'Outfit, sans-serif',
          }}
        />
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value as typeof statusFilter)}
          style={{
            padding: '9px 14px', borderRadius: 8, background: '#071829',
            border: '1px solid rgba(255,255,255,0.1)', color: 'white', fontSize: 13,
            fontFamily: 'Outfit, sans-serif', cursor: 'pointer',
          }}
        >
          <option value="all">All status</option>
          <option value="trial">Trial</option>
          <option value="active">Active</option>
          <option value="pending">Pending</option>
          <option value="expired">Expired</option>
          <option value="suspended">Suspended</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>

      {/* Table */}
      <div style={{ background: '#0A1E38', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1100 }}>
          <thead>
            <tr style={{ background: '#071829' }}>
              {['Business', 'Phone', 'Plan', 'Billing', 'Setup Fee', 'SMS / Mo', 'Industry', 'ServiceM8', 'Pack', 'Emails', 'Gaps', 'Flagged', 'Mode', 'Chat Leads', 'Est. ROI', 'Chatbot', 'Status', 'Unread', 'KB', 'WB', 'Rv', 'Go-Live', 'Onboarded', 'Closed by rep', 'Created', 'Actions'].map(h => (
                <th key={h} style={{ textAlign: 'left' as const, padding: '11px 16px', fontSize: 11, fontWeight: 700, color: '#4A7FBB', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={26} style={{ padding: 28, textAlign: 'center' as const, fontSize: 13, color: '#7BAED4' }}>

                  No clients match this filter.
                </td>
              </tr>
            )}
            {filtered.map((b, i) => (
              <tr key={b.id} style={{ borderTop: '1px solid rgba(255,255,255,0.04)', background: i % 2 === 0 ? '#0A1E38' : '#071829' }}>
                <td style={{ padding: '12px 16px', fontSize: 13, fontWeight: 600, color: 'white' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    {(() => {
                      const dot = qualityDot(qualityByBusiness[b.id])
                      return (
                        <div title={dot.tooltip}
                          style={{ width: 9, height: 9, borderRadius: '50%', background: dot.color, flexShrink: 0, boxShadow: `0 0 0 3px ${dot.color}22` }} />
                      )
                    })()}
                    <span>{b.name}</span>
                    {b.account_status === 'trial' && (() => {
                      const d = trialDaysRemaining(b.trial_end_date)
                      return (
                        <span style={trialPill('#E8622A')}>
                          TRIAL{d !== null ? ` · ${d} day${d === 1 ? '' : 's'} left` : ''}
                        </span>
                      )
                    })()}
                    {b.account_status === 'expired' && (
                      <span style={trialPill('#EF4444')}>TRIAL EXPIRED</span>
                    )}
                  </div>
                </td>
                <td style={{ padding: '12px 16px', fontSize: 12, color: '#7BAED4' }}>{b.phone_number || '—'}</td>
                <td style={{ padding: '12px 16px' }}>
                  <span style={{ fontSize: 11, padding: '3px 9px', borderRadius: 99, background: 'rgba(232,98,42,0.12)', color: '#E8622A', fontWeight: 700 }}>
                    {planLabel(b.plan)}
                  </span>
                </td>
                <td style={{ padding: '12px 16px' }}>
                  {(() => {
                    const annual = b.billing_cycle === 'annual'
                    return (
                      <span style={{
                        fontSize: 11, padding: '3px 9px', borderRadius: 99, fontWeight: 700,
                        background: annual ? 'rgba(34,197,94,0.14)' : 'rgba(123,174,212,0.12)',
                        color: annual ? '#22C55E' : '#7BAED4',
                      }}>{annual ? 'Annual' : 'Monthly'}</span>
                    )
                  })()}
                </td>
                <td style={{ padding: '12px 16px', fontSize: 12 }}>
                  {b.setup_fee_waived ? (
                    <span style={{ color: '#94A3B8', fontStyle: 'italic' }}>Waived</span>
                  ) : b.setup_fee_amount != null ? (
                    <span style={{ color: '#7BAED4' }}>${Number(b.setup_fee_amount).toFixed(0)}</span>
                  ) : (
                    <span style={{ color: 'rgba(255,255,255,0.3)' }}>—</span>
                  )}
                </td>
                <td style={{ padding: '12px 16px' }}>
                  {(() => {
                    const cap = b.plan === 'pro' || b.plan === 'professional' ? 500 : b.plan === 'growth' ? 200 : 0
                    const used = b.sms_used_this_month ?? 0
                    if (cap === 0) {
                      return <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)' }}>0 / —</span>
                    }
                    const pct = used / cap
                    const color = pct >= 0.9 ? '#EF4444' : pct >= 0.75 ? '#F59E0B' : '#7BAED4'
                    return <span style={{ fontSize: 12, color, fontWeight: pct >= 0.75 ? 700 : 500 }}>{used} / {cap}</span>
                  })()}
                </td>
                <td style={{ padding: '12px 16px', fontSize: 12, color: '#7BAED4' }}>{industryLabel(b.industry)}</td>
                {/* Session 6C — ServiceM8 connection */}
                <td style={{ padding: '12px 12px' }}>
                  <span style={{
                    fontSize: 11, padding: '3px 9px', borderRadius: 99, fontWeight: 700, whiteSpace: 'nowrap' as const,
                    background: b.servicem8_enabled ? 'rgba(34,197,94,0.14)' : 'rgba(255,255,255,0.06)',
                    color: b.servicem8_enabled ? '#22C55E' : '#7BAED4',
                  }}>{b.servicem8_enabled ? 'Connected' : 'Not connected'}</span>
                </td>
                {/* Session 6C — industry pack applied */}
                <td style={{ padding: '12px 12px', fontSize: 12, whiteSpace: 'nowrap' as const, color: b.industry_pack_applied ? '#7BAED4' : 'rgba(255,255,255,0.3)' }}>
                  {b.industry_pack_applied ? industryLabel(b.industry_pack_applied) : 'None'}
                </td>
                {/* Session 6C — unread AI emails */}
                <td style={{ padding: '12px 12px' }}>
                  {(() => {
                    const n = emailUnreadByBusiness[b.id] ?? 0
                    if (n === 0) return <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.25)' }}>0</span>
                    return <span style={{ fontSize: 11, fontWeight: 800, padding: '3px 9px', borderRadius: 99, background: '#4A9FE8', color: 'white' }}>{n > 99 ? '99+' : n}</span>
                  })()}
                </td>
                {/* Session 6C — pending transcript gaps */}
                <td style={{ padding: '12px 12px' }}>
                  {(() => {
                    const n = gapsByBusiness[b.id] ?? 0
                    if (n === 0) return <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.25)' }}>0</span>
                    return <span style={{ fontSize: 11, fontWeight: 800, padding: '3px 9px', borderRadius: 99, background: 'rgba(251,191,36,0.16)', color: '#FBBF24' }}>{n}</span>
                  })()}
                </td>
                {/* Session 6C — calls flagged for review (last 30d) */}
                <td style={{ padding: '12px 12px' }}>
                  {(() => {
                    const n = flaggedByBusiness[b.id] ?? 0
                    if (n === 0) return <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.25)' }}>0</span>
                    return <span style={{ fontSize: 11, fontWeight: 800, padding: '3px 9px', borderRadius: 99, background: 'rgba(239,68,68,0.16)', color: '#EF4444' }}>{n}</span>
                  })()}
                </td>
                {/* Session 4A — integration mode chip */}
                <td style={{ padding: '12px 16px' }}>
                  {(() => {
                    const chip = integrationModeChip(b.integration_mode)
                    return (
                      <span style={{
                        fontSize: 11, padding: '3px 9px', borderRadius: 99, fontWeight: 700,
                        whiteSpace: 'nowrap' as const,
                        background: chip.muted ? 'rgba(255,255,255,0.06)' : `${chip.color}22`,
                        color: chip.color, fontStyle: chip.muted ? 'italic' : 'normal',
                      }}>{chip.label}</span>
                    )
                  })()}
                </td>
                <td style={{ padding: '12px 16px', fontSize: 13, color: 'white', fontWeight: 600 }}>
                  {roiByBusiness[b.id]?.chatLeads ?? 0}
                </td>
                <td style={{ padding: '12px 16px', fontSize: 13, fontWeight: 700, color: (roiByBusiness[b.id]?.estimatedRevenue ?? 0) > 0 ? '#E8622A' : '#4A7FBB' }}>
                  {fmtRoi(roiByBusiness[b.id]?.estimatedRevenue ?? 0)}
                </td>
                <td style={{ padding: '12px 16px' }}>
                  {(() => {
                    const on = roiByBusiness[b.id]?.chatbotEnabled ?? false
                    return (
                      <span style={{
                        fontSize: 11, padding: '3px 9px', borderRadius: 99, fontWeight: 700,
                        background: on ? 'rgba(34,197,94,0.14)' : 'rgba(255,255,255,0.06)',
                        color: on ? '#22C55E' : '#7BAED4',
                      }}>{on ? 'Enabled' : 'Disabled'}</span>
                    )
                  })()}
                </td>
                <td style={{ padding: '12px 16px' }}>
                  <span style={{ fontSize: 11, padding: '3px 9px', borderRadius: 99, fontWeight: 700, background: `${statusColor(b.account_status)}22`, color: statusColor(b.account_status) }}>
                    {statusLabel(b.account_status)}
                  </span>
                </td>
                {/* Sprint Session 1 follow-up — 4 admin SMS / KB / automation chips */}
                <td style={{ padding: '12px 12px' }}>
                  {(() => {
                    const n = b.unread_sms ?? 0
                    if (n === 0) return <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.25)' }}>0</span>
                    return (
                      <Link href={`/admin/clients/${b.id}/portal/inbox`} style={{ textDecoration: 'none' }}>
                        <span style={{
                          fontSize: 11, fontWeight: 800, padding: '3px 9px', borderRadius: 99,
                          background: '#E8622A', color: 'white', cursor: 'pointer',
                        }}>{n > 99 ? '99+' : n}</span>
                      </Link>
                    )
                  })()}
                </td>
                <td style={{ padding: '12px 12px' }}>
                  {(() => {
                    const s = b.kb_sync_status ?? 'synced'
                    const map = {
                      synced:  { bg: 'rgba(34,197,94,0.14)',  fg: '#22C55E', label: 'S', tip: 'Knowledge base synced' },
                      pending: { bg: 'rgba(251,191,36,0.16)', fg: '#FBBF24', label: 'P', tip: 'KB has unsaved changes' },
                      syncing: { bg: 'rgba(74,159,232,0.16)', fg: '#4A9FE8', label: '…', tip: 'KB sync in flight' },
                      error:   { bg: 'rgba(239,68,68,0.16)',  fg: '#EF4444', label: 'E', tip: 'KB sync failed' },
                    } as const
                    const cfg = map[s as keyof typeof map] ?? map.synced
                    return (
                      <Link href={`/admin/clients/${b.id}/portal/train`} style={{ textDecoration: 'none' }} title={cfg.tip}>
                        <span style={{
                          fontSize: 11, fontWeight: 800, padding: '3px 9px', borderRadius: 99,
                          background: cfg.bg, color: cfg.fg, cursor: 'pointer',
                        }}>{cfg.label}</span>
                      </Link>
                    )
                  })()}
                </td>
                <td style={{ padding: '12px 8px' }}>
                  {(() => {
                    const on = b.winback_enabled === true || (b.winback_enabled === null && true) // default true
                    return (
                      <span title={on ? 'Win-back ON' : 'Win-back OFF'} style={{
                        display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
                        background: on ? '#22C55E' : 'rgba(255,255,255,0.18)',
                        boxShadow: on ? '0 0 0 3px rgba(34,197,94,0.18)' : 'none',
                      }} />
                    )
                  })()}
                </td>
                <td style={{ padding: '12px 8px' }}>
                  {(() => {
                    const on = b.review_requests_enabled === true
                    return (
                      <span title={on ? 'Reviews ON' : 'Reviews OFF'} style={{
                        display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
                        background: on ? '#22C55E' : 'rgba(255,255,255,0.18)',
                        boxShadow: on ? '0 0 0 3px rgba(34,197,94,0.18)' : 'none',
                      }} />
                    )
                  })()}
                </td>
                <td style={{ padding: '12px 16px' }}>
                  <Link href={`/admin/clients/${b.id}/golive`} style={{ textDecoration: 'none' }}>
                    <span style={{
                      fontSize: 11, padding: '3px 9px', borderRadius: 99, fontWeight: 700,
                      cursor: 'pointer',
                      background: b.golive_verified ? 'rgba(34,197,94,0.14)' : 'rgba(239,68,68,0.12)',
                      color: b.golive_verified ? '#22C55E' : '#EF4444',
                    }}>
                      {b.golive_verified ? 'Verified' : 'Not Verified'}
                    </span>
                  </Link>
                </td>
                <td style={{ padding: '12px 16px', fontSize: 12, color: '#7BAED4', textTransform: 'capitalize' as const }}>{b.onboarded_by || '—'}</td>
                <td style={{ padding: '12px 16px', fontSize: 12, color: '#7BAED4' }}>{b.sales_rep_name ?? '—'}</td>
                <td style={{ padding: '12px 16px', fontSize: 12, color: '#7BAED4' }}>{new Date(b.created_at).toLocaleDateString('en-AU')}</td>
                <td style={{ padding: '12px 16px' }}>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      onClick={() => setEditingId(b.id)}
                      title="View / Edit"
                      style={iconBtn('#4A9FE8')}
                    >✎</button>
                    <button
                      onClick={() => handlePaymentLink(b.id)}
                      disabled={paymentLinkBusy === b.id}
                      title={b.stripe_payment_link ? 'Regenerate payment link' : 'Generate payment link'}
                      style={iconBtn('#E8622A')}
                    >{paymentLinkBusy === b.id ? '…' : '🔗'}</button>
                    <button
                      onClick={() => handleImpersonate(b.id)}
                      disabled={impersonateBusy === b.id}
                      title="Login as client (opens new tab)"
                      style={iconBtn('#8B5CF6')}
                    >{impersonateBusy === b.id ? '…' : '👁'}</button>
                    <Link
                      href={`/admin/clients/${b.id}/portal/dashboard`}
                      title="Open Client Portal (admin view — stays signed in)"
                      style={{ ...iconBtn('#F59E0B'), textDecoration: 'none' as const, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                    >🏢</Link>
                    {(b.account_status === 'pending' || b.account_status === 'suspended') && (
                      <button
                        onClick={() => handleActivate(b.id)}
                        disabled={activateBusy === b.id}
                        title="Activate"
                        style={iconBtn('#22C55E')}
                      >{activateBusy === b.id ? '…' : '✓'}</button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {createOpen && (
        <CreateClientModal
          partners={partners}
          onClose={() => setCreateOpen(false)}
          onCreated={created => {
            setBusinesses(rows => [created, ...rows])
          }}
        />
      )}

      {editing && (
        <EditClientModal
          business={editing}
          onClose={() => setEditingId(null)}
          onUpdate={patch => patchBusiness(editing.id, patch)}
          onCancelled={() => patchBusiness(editing.id, { account_status: 'cancelled' })}
        />
      )}

      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 100,
          padding: '12px 18px', background: '#0A1E38',
          border: '1px solid rgba(34,197,94,0.4)', borderRadius: 10,
          color: '#22C55E', fontSize: 13, fontWeight: 600,
          boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
        }}>
          {toast}
        </div>
      )}
    </div>
  )
}

function iconBtn(color: string): React.CSSProperties {
  return {
    width: 30, height: 30, borderRadius: 7,
    background: `${color}1A`, border: `1px solid ${color}55`,
    color, cursor: 'pointer', fontSize: 14, fontWeight: 700,
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    fontFamily: 'Outfit, sans-serif',
  }
}

function trialPill(color: string): React.CSSProperties {
  return {
    fontSize: 10, fontWeight: 800, letterSpacing: '0.04em',
    padding: '2px 7px', borderRadius: 99,
    background: `${color}22`, color,
    textTransform: 'uppercase' as const,
    whiteSpace: 'nowrap' as const,
  }
}
