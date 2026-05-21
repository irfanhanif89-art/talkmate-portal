'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Users, GitBranch, DollarSign, Plus, Download, Trophy, X } from 'lucide-react'
import { formatCurrency, formatDate, formatDateTime } from '@/lib/sales-format'
import InviteRepModal from './invite-rep-modal'
import ContractManagerModal from './contract-manager-modal'
import ApproveDealModal from './approve-deal-modal'
import RejectDealModal from './reject-deal-modal'
import RevokeCommissionModal from './revoke-commission-modal'
import MarkPaidModal from './mark-paid-modal'

const LEGACY_BANNER_KEY = 'sales-team-legacy-banner-dismissed'

export interface AdminRepRow {
  id: string
  full_name: string
  email: string
  phone: string | null
  status: 'active' | 'inactive'
  contract_signed_at: string | null
  policy_acknowledged_at: string | null
  created_at: string
  leads_count: number
  won_count: number
  commission_earned: number
  contract_status: string | null
  contract_signed_on: string | null
}

export interface AdminLeadRow {
  id: string
  business_name: string
  contact_name: string | null
  phone: string | null
  industry: string | null
  status: string
  approval_status: 'pending' | 'approved' | 'rejected' | null
  won_plan: 'starter' | 'growth' | 'pro' | null
  won_at: string | null
  business_id: string | null
  created_at: string
  rep_id: string | null
  rep_name: string
  approval_notes: string | null
}

export interface AdminCommissionRow {
  id: string
  rep_id: string
  rep_name: string
  business_name: string
  plan: string
  base: number
  bonus: number
  total: number
  billing_cycle: 'monthly' | 'annual'
  status: 'pending' | 'approved' | 'paid' | 'revoked'
  created_at: string
  paid_at: string | null
  payment_reference: string | null
  revoke_reason: string | null
  // Session 27 (H23) — null on rows created before migration 042 backfill.
  // The PATCH endpoint still computes from created_at as a fallback.
  clawback_period_ends_at: string | null
}

interface Props {
  reps: AdminRepRow[]
  leads: AdminLeadRow[]
  commissions: AdminCommissionRow[]
  leaderboard: Array<{ rep_name: string; count: number }>
}

type Tab = 'reps' | 'leads' | 'commissions'

const COMMISSION_MAP = { starter: 299, growth: 349, pro: 399 } as const

export default function AdminSalesTeamView({ reps, leads, commissions, leaderboard }: Props) {
  const [tab, setTab] = useState<Tab>('reps')
  const router = useRouter()

  // Top-level modal states
  const [inviteOpen, setInviteOpen] = useState(false)
  const [contractRep, setContractRep] = useState<AdminRepRow | null>(null)
  const [approveLead, setApproveLead] = useState<AdminLeadRow | null>(null)
  const [rejectLead, setRejectLead] = useState<AdminLeadRow | null>(null)
  const [revokeCommission, setRevokeCommission] = useState<AdminCommissionRow | null>(null)
  const [payCommission, setPayCommission] = useState<AdminCommissionRow | null>(null)

  async function approveCommission(id: string) {
    const res = await fetch(`/api/admin/commissions/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'approve' }),
    })
    if (res.ok) router.refresh()
    else alert((await res.json().catch(() => ({}))).error ?? 'Approve failed')
  }

  async function deactivateRep(rep: AdminRepRow) {
    if (!confirm(`Deactivate ${rep.full_name}? They will lose access to the sales portal.`)) return
    const res = await fetch(`/api/admin/sales-reps/${rep.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'inactive' }),
    })
    if (res.ok) router.refresh()
    else alert((await res.json().catch(() => ({}))).error ?? 'Deactivate failed')
  }

  async function reactivateRep(rep: AdminRepRow) {
    const res = await fetch(`/api/admin/sales-reps/${rep.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'active' }),
    })
    if (res.ok) router.refresh()
    else alert((await res.json().catch(() => ({}))).error ?? 'Reactivate failed')
  }

  return (
    <div style={{ padding: '24px 24px 40px', fontFamily: 'Outfit, sans-serif', background: '#061322', color: 'white', minHeight: '100vh' }}>
      <LegacyBanner />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, marginBottom: 22 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 800, margin: 0, letterSpacing: '-0.5px' }}>Sales Team</h1>
          <p style={{ fontSize: 13, color: '#7BAED4', margin: 0, marginTop: 4 }}>
            Manage reps, approve deals, and track commissions.
          </p>
        </div>
        {tab === 'reps' && (
          <button onClick={() => setInviteOpen(true)} style={primaryBtn}>
            <Plus size={14} /> Invite Rep
          </button>
        )}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 22, borderBottom: '1px solid rgba(255,255,255,0.08)', flexWrap: 'wrap' }}>
        <TabBtn icon={Users}      label="Reps"        active={tab === 'reps'}        onClick={() => setTab('reps')} />
        <TabBtn icon={GitBranch}  label="Leads"       active={tab === 'leads'}       onClick={() => setTab('leads')} />
        <TabBtn icon={DollarSign} label="Commissions" active={tab === 'commissions'} onClick={() => setTab('commissions')} />
      </div>

      {tab === 'reps' && (
        <RepsPane
          reps={reps}
          onManageContract={setContractRep}
          onDeactivate={deactivateRep}
          onReactivate={reactivateRep}
        />
      )}
      {tab === 'leads' && (
        <LeadsPane
          leads={leads}
          leaderboard={leaderboard}
          onApprove={setApproveLead}
          onReject={setRejectLead}
        />
      )}
      {tab === 'commissions' && (
        <CommissionsPane
          commissions={commissions}
          onApprove={approveCommission}
          onMarkPaid={setPayCommission}
          onRevoke={setRevokeCommission}
        />
      )}

      {/* Modals */}
      {inviteOpen && <InviteRepModal onClose={() => setInviteOpen(false)} onSuccess={() => { setInviteOpen(false); router.refresh() }} />}
      {contractRep && <ContractManagerModal rep={contractRep} onClose={() => setContractRep(null)} onSuccess={() => { setContractRep(null); router.refresh() }} />}
      {approveLead && <ApproveDealModal lead={approveLead} onClose={() => setApproveLead(null)} onSuccess={() => { setApproveLead(null); router.refresh() }} />}
      {rejectLead && <RejectDealModal lead={rejectLead} onClose={() => setRejectLead(null)} onSuccess={() => { setRejectLead(null); router.refresh() }} />}
      {revokeCommission && <RevokeCommissionModal commission={revokeCommission} onClose={() => setRevokeCommission(null)} onSuccess={() => { setRevokeCommission(null); router.refresh() }} />}
      {payCommission && <MarkPaidModal commission={payCommission} onClose={() => setPayCommission(null)} onSuccess={() => { setPayCommission(null); router.refresh() }} />}
    </div>
  )
}

function LegacyBanner() {
  const [dismissed, setDismissed] = useState(true)
  useEffect(() => {
    try {
      setDismissed(window.sessionStorage.getItem(LEGACY_BANNER_KEY) === '1')
    } catch {
      setDismissed(false)
    }
  }, [])
  if (dismissed) return null
  return (
    <div style={{
      padding: '12px 16px', marginBottom: 16, borderRadius: 9,
      background: 'rgba(59,130,246,0.10)', border: '1px solid rgba(59,130,246,0.35)',
      display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12,
    }}>
      <div style={{ fontSize: 13, color: '#BBD9FF', lineHeight: 1.6 }}>
        New contractors are now onboarded through the Contractors page with automated digital signing.
        This page manages legacy manually-onboarded reps only.
      </div>
      <button
        onClick={() => {
          try { window.sessionStorage.setItem(LEGACY_BANNER_KEY, '1') } catch {}
          setDismissed(true)
        }}
        aria-label="Dismiss"
        style={{
          background: 'transparent', border: 'none', color: '#7BAED4',
          padding: 2, cursor: 'pointer', display: 'flex', alignItems: 'center',
        }}
      >
        <X size={16} />
      </button>
    </div>
  )
}

function TabBtn({ icon: Icon, label, active, onClick }: { icon: React.ComponentType<{ size?: number }>; label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '11px 18px', borderRadius: 0,
        background: 'transparent', border: 'none',
        borderBottom: active ? '2px solid #E8622A' : '2px solid transparent',
        color: active ? '#E8622A' : '#7BAED4',
        fontFamily: 'Outfit, sans-serif', fontSize: 14, fontWeight: 700,
        cursor: 'pointer', marginBottom: -1,
      }}
    >
      <Icon size={15} /> {label}
    </button>
  )
}

// -----------------------------
// Reps tab
// -----------------------------
function RepsPane({ reps, onManageContract, onDeactivate, onReactivate }: {
  reps: AdminRepRow[]
  onManageContract: (r: AdminRepRow) => void
  onDeactivate: (r: AdminRepRow) => void
  onReactivate: (r: AdminRepRow) => void
}) {
  if (reps.length === 0) {
    return (
      <Empty text="No sales reps yet. Hit Invite Rep above to add your first." />
    )
  }
  return (
    <Card>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 900 }}>
          <thead><tr style={headRow}>
            <th style={th}>Name</th>
            <th style={th}>Email</th>
            <th style={th}>Phone</th>
            <th style={th}>Status</th>
            <th style={{ ...th, textAlign: 'right' }}>Leads</th>
            <th style={{ ...th, textAlign: 'right' }}>Won</th>
            <th style={{ ...th, textAlign: 'right' }}>Commission</th>
            <th style={th}>Contract</th>
            <th style={{ ...th, textAlign: 'right' }}>Actions</th>
          </tr></thead>
          <tbody>
            {reps.map(r => (
              <tr key={r.id} style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                <td style={td}><strong style={{ color: 'white' }}>{r.full_name}</strong></td>
                <td style={{ ...td, color: '#7BAED4' }}>{r.email}</td>
                <td style={{ ...td, color: '#7BAED4' }}>{r.phone ?? '—'}</td>
                <td style={td}>
                  <StatusPill on={r.status === 'active'} label={r.status === 'active' ? 'Active' : 'Inactive'} />
                </td>
                <td style={{ ...td, textAlign: 'right' }}>{r.leads_count}</td>
                <td style={{ ...td, textAlign: 'right', color: '#22c55e', fontWeight: 700 }}>{r.won_count}</td>
                <td style={{ ...td, textAlign: 'right', color: '#E8622A', fontWeight: 700 }}>{formatCurrency(r.commission_earned)}</td>
                <td style={td}>
                  {r.contract_status === 'signed'
                    ? <span style={{ color: '#22c55e', fontSize: 12, fontWeight: 700 }}>Signed</span>
                    : r.contract_status === 'pending_signature'
                      ? <span style={{ color: '#f59e0b', fontSize: 12, fontWeight: 700 }}>Pending</span>
                      : <span style={{ color: '#7BAED4', fontSize: 12 }}>No contract</span>}
                </td>
                <td style={{ ...td, textAlign: 'right' }}>
                  <button onClick={() => onManageContract(r)} style={ghostBtn}>Manage Contract</button>
                  {r.status === 'active' ? (
                    <button onClick={() => onDeactivate(r)} style={{ ...ghostBtn, color: '#ef4444', borderColor: 'rgba(239,68,68,0.3)' }}>Deactivate</button>
                  ) : (
                    <button onClick={() => onReactivate(r)} style={{ ...ghostBtn, color: '#22c55e', borderColor: 'rgba(34,197,94,0.3)' }}>Reactivate</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

// -----------------------------
// Leads tab
// -----------------------------
function LeadsPane({ leads, leaderboard, onApprove, onReject }: {
  leads: AdminLeadRow[]
  leaderboard: Array<{ rep_name: string; count: number }>
  onApprove: (lead: AdminLeadRow) => void
  onReject: (lead: AdminLeadRow) => void
}) {
  const [sub, setSub] = useState<'queue' | 'all'>('queue')
  const [filterRep, setFilterRep] = useState('all')
  const [filterStatus, setFilterStatus] = useState('all')

  const queue = leads.filter(l => l.status === 'won' && l.approval_status === 'pending')

  const reps = useMemo(() => {
    const set = new Set<string>()
    for (const l of leads) if (l.rep_name) set.add(l.rep_name)
    return Array.from(set).sort()
  }, [leads])

  const filteredAll = useMemo(() => {
    return leads.filter(l => {
      if (filterRep !== 'all' && l.rep_name !== filterRep) return false
      if (filterStatus !== 'all' && l.status !== filterStatus) return false
      return true
    })
  }, [leads, filterRep, filterStatus])

  function exportCsv() {
    const headers = ['Business', 'Contact', 'Industry', 'Rep', 'Status', 'Approval', 'Plan', 'Won at', 'Created']
    const lines = [headers.join(',')]
    for (const l of filteredAll) {
      lines.push([
        csv(l.business_name), csv(l.contact_name ?? ''), csv(l.industry ?? ''),
        csv(l.rep_name), l.status, l.approval_status ?? '',
        l.won_plan ?? '', l.won_at ?? '', l.created_at,
      ].join(','))
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `leads-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 18 }} className="admin-sales-leads-grid">
      <div>
        {/* Sub-tabs */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
          <SubTab label={`Approval queue (${queue.length})`} active={sub === 'queue'} onClick={() => setSub('queue')} />
          <SubTab label="All leads" active={sub === 'all'} onClick={() => setSub('all')} />
        </div>

        {sub === 'queue' ? (
          queue.length === 0 ? (
            <Empty text="Nothing in the approval queue. When a rep marks a deal as won, it'll appear here." />
          ) : (
            <Card>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 700 }}>
                  <thead><tr style={headRow}>
                    <th style={th}>Business</th>
                    <th style={th}>Rep</th>
                    <th style={th}>Plan</th>
                    <th style={th}>Commission</th>
                    <th style={th}>Won</th>
                    <th style={{ ...th, textAlign: 'right' }}>Action</th>
                  </tr></thead>
                  <tbody>
                    {queue.map(l => (
                      <tr key={l.id} style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                        <td style={td}><strong style={{ color: 'white' }}>{l.business_name}</strong>
                          {l.contact_name && <div style={{ fontSize: 11, color: '#7BAED4', marginTop: 2 }}>{l.contact_name}{l.phone ? ` · ${l.phone}` : ''}</div>}
                        </td>
                        <td style={{ ...td, color: '#7BAED4' }}>{l.rep_name}</td>
                        <td style={{ ...td, color: '#7BAED4', textTransform: 'capitalize' }}>{l.won_plan ?? '—'}</td>
                        <td style={{ ...td, color: '#22c55e', fontWeight: 700 }}>
                          {l.won_plan ? formatCurrency(COMMISSION_MAP[l.won_plan]) : '—'}
                        </td>
                        <td style={{ ...td, color: '#7BAED4' }}>{formatDate(l.won_at)}</td>
                        <td style={{ ...td, textAlign: 'right' }}>
                          <button onClick={() => onApprove(l)} style={{ ...ghostBtn, color: '#22c55e', borderColor: 'rgba(34,197,94,0.3)' }}>Approve</button>
                          <button onClick={() => onReject(l)} style={{ ...ghostBtn, color: '#ef4444', borderColor: 'rgba(239,68,68,0.3)' }}>Reject</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )
        ) : (
          <>
            <div style={{ display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
              <select value={filterRep} onChange={e => setFilterRep(e.target.value)} style={filterSelect}>
                <option value="all">All reps</option>
                {reps.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
              <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={filterSelect}>
                <option value="all">All statuses</option>
                {['new', 'contacted', 'demo_booked', 'demo_done', 'proposal_sent', 'won', 'lost', 'nurture', 'bad_lead'].map(s =>
                  <option key={s} value={s}>{s}</option>
                )}
              </select>
              <button onClick={exportCsv} style={ghostBtn}><Download size={13} /> Export CSV</button>
            </div>

            <Card>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 780 }}>
                  <thead><tr style={headRow}>
                    <th style={th}>Business</th>
                    <th style={th}>Rep</th>
                    <th style={th}>Status</th>
                    <th style={th}>Industry</th>
                    <th style={th}>Created</th>
                  </tr></thead>
                  <tbody>
                    {filteredAll.map(l => (
                      <tr key={l.id} style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                        <td style={td}><strong style={{ color: 'white' }}>{l.business_name}</strong></td>
                        <td style={{ ...td, color: '#7BAED4' }}>{l.rep_name}</td>
                        <td style={{ ...td, color: '#7BAED4', textTransform: 'capitalize' }}>{l.status.replace(/_/g, ' ')}</td>
                        <td style={{ ...td, color: '#7BAED4' }}>{l.industry ?? '—'}</td>
                        <td style={{ ...td, color: '#7BAED4' }}>{formatDate(l.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </>
        )}
      </div>

      <aside className="admin-sales-leaderboard">
        <Card>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <Trophy size={16} color="#E8622A" />
            <h2 style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>Top reps this month</h2>
          </div>
          {leaderboard.length === 0 ? (
            <div style={{ fontSize: 12, color: '#7BAED4' }}>No wins yet this month.</div>
          ) : (
            <ol style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {leaderboard.map((row, i) => (
                <li key={row.rep_name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', borderRadius: 8, background: '#061322', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <span style={{ fontSize: 13, color: 'white', fontWeight: 600 }}>{i + 1}. {row.rep_name}</span>
                  <span style={{ fontSize: 13, color: '#22c55e', fontWeight: 700 }}>{row.count} won</span>
                </li>
              ))}
            </ol>
          )}
        </Card>
      </aside>

      <style>{`
        @media (min-width: 1100px) {
          .admin-sales-leads-grid { grid-template-columns: 1fr 280px !important; }
        }
        @media (max-width: 1099px) {
          .admin-sales-leaderboard { order: -1; }
        }
      `}</style>
    </div>
  )
}

// -----------------------------
// Commissions tab
// -----------------------------
function CommissionsPane({ commissions, onApprove, onMarkPaid, onRevoke }: {
  commissions: AdminCommissionRow[]
  onApprove: (id: string) => void
  onMarkPaid: (c: AdminCommissionRow) => void
  onRevoke: (c: AdminCommissionRow) => void
}) {
  const [filterRep, setFilterRep] = useState('all')
  const [filterStatus, setFilterStatus] = useState('all')

  const reps = useMemo(() => Array.from(new Set(commissions.map(c => c.rep_name))).sort(), [commissions])

  const filtered = commissions.filter(c => {
    if (filterRep !== 'all' && c.rep_name !== filterRep) return false
    if (filterStatus !== 'all' && c.status !== filterStatus) return false
    return true
  })

  function exportCsv() {
    const headers = ['Rep', 'Business', 'Plan', 'Billing', 'Base', 'Bonus', 'Total', 'Status', 'Created', 'Paid', 'Reference', 'Revoke reason']
    const lines = [headers.join(',')]
    for (const c of filtered) {
      lines.push([
        csv(c.rep_name), csv(c.business_name), c.plan, c.billing_cycle,
        c.base.toFixed(2), c.bonus.toFixed(2), c.total.toFixed(2),
        c.status, c.created_at, c.paid_at ?? '',
        csv(c.payment_reference ?? ''), csv(c.revoke_reason ?? ''),
      ].join(','))
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `commissions-${new Date().toISOString().slice(0, 10)}.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <>
      <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        <select value={filterRep} onChange={e => setFilterRep(e.target.value)} style={filterSelect}>
          <option value="all">All reps</option>
          {reps.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={filterSelect}>
          <option value="all">All statuses</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="paid">Paid</option>
          <option value="revoked">Revoked</option>
        </select>
        <button onClick={exportCsv} style={ghostBtn}><Download size={13} /> Export CSV</button>
      </div>

      {filtered.length === 0 ? (
        <Empty text="No commissions match these filters." />
      ) : (
        <Card>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 880 }}>
              <thead><tr style={headRow}>
                <th style={th}>Rep</th>
                <th style={th}>Business</th>
                <th style={th}>Plan</th>
                <th style={th}>Billing</th>
                <th style={th}>Total</th>
                <th style={th}>Status</th>
                <th style={th}>Created</th>
                <th style={{ ...th, textAlign: 'right' }}>Actions</th>
              </tr></thead>
              <tbody>
                {filtered.map(c => {
                  const isAnnual = c.billing_cycle === 'annual'
                  return (
                  <tr key={c.id} style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                    <td style={td}><strong style={{ color: 'white' }}>{c.rep_name}</strong></td>
                    <td style={{ ...td, color: '#7BAED4' }}>{c.business_name}</td>
                    <td style={{ ...td, color: '#7BAED4', textTransform: 'capitalize' }}>{c.plan}</td>
                    <td style={td}>
                      <span style={{
                        display: 'inline-block', padding: '3px 9px', borderRadius: 99,
                        background: isAnnual ? 'rgba(34,197,94,0.15)' : 'rgba(123,174,212,0.12)',
                        color: isAnnual ? '#22c55e' : '#7BAED4',
                        border: `1px solid ${isAnnual ? 'rgba(34,197,94,0.35)' : 'rgba(123,174,212,0.3)'}`,
                        fontSize: 11, fontWeight: 700,
                      }}>{isAnnual ? 'Annual' : 'Monthly'}</span>
                    </td>
                    <td style={td}>
                      <div style={{ color: '#E8622A', fontWeight: 700 }}>{formatCurrency(c.total)}</div>
                      {c.bonus > 0 && (
                        <div style={{ fontSize: 11, color: '#7BAED4', marginTop: 2 }}>
                          ${c.base} base <span style={{ color: '#22c55e', fontWeight: 600 }}>+ ${c.bonus.toFixed(2)} annual bonus</span>
                        </div>
                      )}
                    </td>
                    <td style={td}>
                      <CommissionPill status={c.status} />
                      {c.status === 'paid' && c.payment_reference && (
                        <div style={{ fontSize: 10, color: '#7BAED4', marginTop: 3, fontFamily: 'monospace' }}>{c.payment_reference}</div>
                      )}
                      {c.status === 'revoked' && c.revoke_reason && (
                        <div style={{ fontSize: 11, color: '#ef4444', marginTop: 3 }}>{c.revoke_reason}</div>
                      )}
                    </td>
                    <td style={{ ...td, color: '#7BAED4' }}>
                      {formatDateTime(c.created_at)}
                      {/* Session 27 (H23) — show clawback end date for any
                          row that hasn't been approved yet. */}
                      {c.status === 'pending' && (() => {
                        const clawbackEnds = c.clawback_period_ends_at
                          ? new Date(c.clawback_period_ends_at)
                          : new Date(new Date(c.created_at).getTime() + 14 * 24 * 60 * 60 * 1000)
                        const isLocked = Date.now() < clawbackEnds.getTime()
                        return (
                          <div style={{ fontSize: 10, marginTop: 4, color: isLocked ? '#f59e0b' : '#22c55e', fontWeight: 600 }}>
                            {isLocked ? '🔒 Clawback ends ' : '✓ Clawback cleared '}
                            {clawbackEnds.toLocaleDateString('en-AU')}
                          </div>
                        )
                      })()}
                    </td>
                    <td style={{ ...td, textAlign: 'right' }}>
                      {c.status === 'pending' && (() => {
                        const clawbackEnds = c.clawback_period_ends_at
                          ? new Date(c.clawback_period_ends_at)
                          : new Date(new Date(c.created_at).getTime() + 14 * 24 * 60 * 60 * 1000)
                        const isLocked = Date.now() < clawbackEnds.getTime()
                        return (
                          <button
                            onClick={() => onApprove(c.id)}
                            disabled={isLocked}
                            title={isLocked ? `Available to approve on ${clawbackEnds.toLocaleDateString('en-AU')}` : 'Approve commission'}
                            style={{
                              ...ghostBtn,
                              color: isLocked ? '#7BAED4' : '#22c55e',
                              borderColor: isLocked ? 'rgba(123,174,212,0.3)' : 'rgba(34,197,94,0.3)',
                              cursor: isLocked ? 'not-allowed' : 'pointer',
                              opacity: isLocked ? 0.55 : 1,
                            }}
                          >
                            Approve
                          </button>
                        )
                      })()}
                      {c.status === 'approved' && (
                        <button onClick={() => onMarkPaid(c)} style={{ ...ghostBtn, color: '#22c55e', borderColor: 'rgba(34,197,94,0.3)' }}>Mark Paid</button>
                      )}
                      {(c.status === 'pending' || c.status === 'approved' || c.status === 'paid') && (
                        <button onClick={() => onRevoke(c)} style={{ ...ghostBtn, color: '#ef4444', borderColor: 'rgba(239,68,68,0.3)' }}>Revoke</button>
                      )}
                    </td>
                  </tr>
                )})}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </>
  )
}

// -----------------------------
// Shared bits
// -----------------------------
function Card({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: '#0A1E38', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: 16 }}>{children}</div>
  )
}
function Empty({ text }: { text: string }) {
  return <div style={{ padding: 32, borderRadius: 12, background: '#0A1E38', border: '1px dashed rgba(255,255,255,0.1)', textAlign: 'center', fontSize: 13, color: '#7BAED4' }}>{text}</div>
}
function SubTab({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      padding: '8px 13px', borderRadius: 8, cursor: 'pointer',
      background: active ? 'rgba(232,98,42,0.15)' : 'transparent',
      border: active ? '1px solid rgba(232,98,42,0.3)' : '1px solid rgba(255,255,255,0.08)',
      color: active ? '#E8622A' : '#7BAED4',
      fontFamily: 'Outfit, sans-serif', fontSize: 12, fontWeight: 700,
    }}>{label}</button>
  )
}
function StatusPill({ on, label }: { on: boolean; label: string }) {
  return (
    <span style={{
      display: 'inline-block', padding: '3px 9px', borderRadius: 99,
      background: on ? 'rgba(34,197,94,0.15)' : 'rgba(100,116,139,0.18)',
      color: on ? '#22c55e' : '#94a3b8',
      border: `1px solid ${on ? 'rgba(34,197,94,0.35)' : 'rgba(100,116,139,0.4)'}`,
      fontSize: 11, fontWeight: 700,
    }}>{label}</span>
  )
}
function CommissionPill({ status }: { status: AdminCommissionRow['status'] }) {
  const map = {
    pending:  { color: '#7BAED4', bg: 'rgba(255,255,255,0.06)', border: 'rgba(255,255,255,0.12)', label: 'Pending' },
    approved: { color: '#4A9FE8', bg: 'rgba(74,159,232,0.15)',  border: 'rgba(74,159,232,0.35)', label: 'Approved' },
    paid:     { color: '#22c55e', bg: 'rgba(34,197,94,0.15)',   border: 'rgba(34,197,94,0.35)', label: 'Paid' },
    revoked:  { color: '#ef4444', bg: 'rgba(239,68,68,0.12)',   border: 'rgba(239,68,68,0.3)',  label: 'Revoked' },
  }[status]
  return (
    <span style={{
      display: 'inline-block', padding: '3px 9px', borderRadius: 99,
      background: map.bg, color: map.color, border: `1px solid ${map.border}`,
      fontSize: 11, fontWeight: 700,
    }}>{map.label}</span>
  )
}

function csv(v: string): string {
  if (v.includes(',') || v.includes('"') || v.includes('\n')) return `"${v.replace(/"/g, '""')}"`
  return v
}

const primaryBtn: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 6,
  padding: '10px 16px', borderRadius: 9, border: 'none', cursor: 'pointer',
  background: '#E8622A', color: 'white',
  fontFamily: 'Outfit, sans-serif', fontSize: 13, fontWeight: 700,
}
const ghostBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 5,
  padding: '7px 11px', borderRadius: 7, cursor: 'pointer',
  background: 'transparent', color: '#7BAED4',
  border: '1px solid rgba(255,255,255,0.12)',
  fontFamily: 'Outfit, sans-serif', fontSize: 12, fontWeight: 700, marginLeft: 6,
}
const filterSelect: React.CSSProperties = {
  padding: '8px 11px', borderRadius: 8,
  background: '#0A1E38', border: '1px solid rgba(255,255,255,0.08)',
  color: 'white', fontFamily: 'Outfit, sans-serif', fontSize: 12, outline: 'none',
}
const headRow: React.CSSProperties = { textAlign: 'left', color: '#4A7FBB', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em' }
const th: React.CSSProperties = { padding: '10px 12px', textAlign: 'left', fontWeight: 700 }
const td: React.CSSProperties = { padding: '12px', verticalAlign: 'top' }
