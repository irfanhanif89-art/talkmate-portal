'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, FileText, Plus, AlertTriangle, Send, Pencil } from 'lucide-react'
import { formatCurrency, formatDate, formatDateTime } from '@/lib/sales-format'
import EditRepModal from '@/components/admin/EditRepModal'
import { DEMO_INDUSTRIES } from '@/lib/demo-config'

export interface DetailContractor {
  id: string
  first_name: string
  last_name: string
  email: string
  phone: string | null
  abn: string | null
  bank_bsb: string | null
  bank_account_number: string | null
  status: 'invited' | 'agreement_sent' | 'active' | 'terminated'
  agreement_signed_at: string | null
  signed_pdf_url: string | null
  termination_date: string | null
  termination_reason: string | null
  notes: string | null
  created_at: string
}

export interface DetailAgreement {
  id: string
  agreement_version: string
  script_version: string
  script_date: string
  signed_at: string | null
  signed_pdf_url: string | null
  status: string
  created_at: string
}

export interface DetailAcknowledgement {
  id: string
  script_id: string
  script_version: string
  acknowledged_at: string
}

export interface DetailCommission {
  id: string
  plan_type: 'starter' | 'growth' | 'pro'
  billing_cycle: 'monthly' | 'annual'
  sale_amount: number
  commission_amount: number
  status: 'pending' | 'cleared' | 'clawback' | 'paid'
  clawback_period_ends_at: string
  paid_at: string | null
  created_at: string
  client_business_id: string | null
  notes: string | null
}

interface LinkedRep {
  id: string
  full_name: string
  notification_email: string | null
  status: string
  demo_industry: string | null
  demo_calendly_url: string | null
}

interface Props {
  contractor: DetailContractor
  agreements: DetailAgreement[]
  acknowledgements: DetailAcknowledgement[]
  commissions: DetailCommission[]
  signedPdfUrl: string | null
  linkedRep: LinkedRep | null
}

const COMMISSION_RATES = {
  starter: { monthly: 299, annual: 373.75 },
  growth: { monthly: 349, annual: 473.75 },
  pro: { monthly: 399, annual: 598.75 },
} as const

const wrap: React.CSSProperties = { padding: 24, fontFamily: 'Outfit, sans-serif', color: 'white', background: '#061322', minHeight: '100vh' }
const card: React.CSSProperties = { background: '#0A1E38', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: 20, marginBottom: 18 }
const sectionTitle: React.CSSProperties = { fontSize: 16, fontWeight: 700, margin: '0 0 12px' }
const kvRow: React.CSSProperties = { display: 'flex', gap: 10, padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }
const kvKey: React.CSSProperties = { width: 160, color: 'rgba(255,255,255,0.6)', fontSize: 13 }
const kvVal: React.CSSProperties = { flex: 1, fontSize: 14 }
const btnPrimary: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6,
  background: '#22D3EE', color: '#061322', border: 'none',
  padding: '8px 14px', borderRadius: 8, fontWeight: 700, cursor: 'pointer',
  fontFamily: 'inherit', fontSize: 13,
}
const btnGhost: React.CSSProperties = {
  background: 'transparent', color: 'white', border: '1px solid rgba(255,255,255,0.2)',
  padding: '8px 14px', borderRadius: 8, cursor: 'pointer',
  fontFamily: 'inherit', fontSize: 13,
}
const btnDanger: React.CSSProperties = {
  background: '#ef4444', color: 'white', border: 'none',
  padding: '10px 16px', borderRadius: 10, fontWeight: 700, cursor: 'pointer',
  fontFamily: 'inherit', fontSize: 14,
}
const thStyle: React.CSSProperties = { textAlign: 'left', padding: '8px 6px', fontSize: 12, color: 'rgba(255,255,255,0.6)', fontWeight: 600, borderBottom: '1px solid rgba(255,255,255,0.08)' }
const tdStyle: React.CSSProperties = { padding: '10px 6px', fontSize: 13, borderBottom: '1px solid rgba(255,255,255,0.05)' }

const statusBadge = (s: DetailCommission['status']) => {
  const styles = {
    pending:  { color: '#F59E0B', bg: 'rgba(245,158,11,0.12)',  border: 'rgba(245,158,11,0.4)' },
    cleared:  { color: '#4A9FE8', bg: 'rgba(74,159,232,0.15)',  border: 'rgba(74,159,232,0.4)' },
    paid:     { color: '#22c55e', bg: 'rgba(34,197,94,0.15)',   border: 'rgba(34,197,94,0.4)' },
    clawback: { color: '#ef4444', bg: 'rgba(239,68,68,0.12)',   border: 'rgba(239,68,68,0.4)' },
  }[s]
  return (
    <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 6, fontSize: 12, fontWeight: 600, color: styles.color, background: styles.bg, border: `1px solid ${styles.border}` }}>
      {s.charAt(0).toUpperCase() + s.slice(1)}
    </span>
  )
}

export default function ContractorDetailView({
  contractor, agreements, acknowledgements, commissions, signedPdfUrl, linkedRep,
}: Props) {
  const router = useRouter()
  const [addOpen, setAddOpen] = useState(false)
  const [terminateOpen, setTerminateOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [toast, setToast] = useState<{ kind: 'ok' | 'err'; message: string } | null>(null)
  const [demoIndustry, setDemoIndustry] = useState<string>(linkedRep?.demo_industry ?? '')
  const [demoSaving, setDemoSaving] = useState(false)
  const [demoSaved, setDemoSaved] = useState(false)

  const showToast = (kind: 'ok' | 'err', message: string) => {
    setToast({ kind, message })
    window.setTimeout(() => setToast(null), 4000)
  }

  const canResendInvite = contractor.status === 'invited' || contractor.status === 'agreement_sent'
  const canResendPortalAccess = contractor.status === 'active' && !!contractor.agreement_signed_at

  const resendInvite = async () => {
    setBusy('resend')
    try {
      const res = await fetch(`/api/contractors/${contractor.id}/resend`, { method: 'POST' })
      const json = await res.json()
      if (!json.ok) {
        showToast('err', json.error || 'Could not resend invite')
      } else {
        showToast('ok', `Invite resent to ${contractor.email}`)
        router.refresh()
      }
    } catch {
      showToast('err', 'Could not resend invite')
    } finally {
      setBusy(null)
    }
  }

  const resendPortalAccess = async () => {
    setBusy('portal')
    try {
      const res = await fetch(`/api/contractors/${contractor.id}/resend-portal-access`, { method: 'POST' })
      const json = await res.json()
      if (!json.ok) {
        showToast('err', json.error || 'Could not resend portal access email')
      } else {
        showToast('ok', `Portal access email sent to ${contractor.email}`)
      }
    } catch {
      showToast('err', 'Could not resend portal access email')
    } finally {
      setBusy(null)
    }
  }

  const totalEarned = useMemo(
    () => commissions.filter(c => c.status === 'paid' || c.status === 'cleared').reduce((s, c) => s + Number(c.commission_amount), 0),
    [commissions]
  )

  const updateCommission = async (id: string, action: 'clear' | 'paid' | 'clawback', body?: object) => {
    setBusy(id + ':' + action)
    try {
      const res = await fetch(`/api/contractor-commissions/${id}/${action}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      })
      const json = await res.json()
      if (!json.ok) alert(json.error || 'Action failed')
      else router.refresh()
    } finally {
      setBusy(null)
    }
  }

  const terminate = async (reason: string) => {
    setBusy('terminate')
    try {
      const res = await fetch(`/api/contractors/${contractor.id}/terminate`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      })
      const json = await res.json()
      if (!json.ok) alert(json.error || 'Termination failed')
      else { setTerminateOpen(false); router.refresh() }
    } finally {
      setBusy(null)
    }
  }

  const saveDemoIndustry = async (value: string) => {
    if (!linkedRep) return
    setDemoSaving(true)
    try {
      const res = await fetch(`/api/admin/sales-reps/${linkedRep.id}/demo-config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ demo_industry: value || null }),
      })
      const json = await res.json()
      if (!json.ok) {
        showToast('err', json.error || 'Could not save demo industry')
      } else {
        setDemoSaved(true)
        window.setTimeout(() => setDemoSaved(false), 2000)
      }
    } catch {
      showToast('err', 'Could not save demo industry')
    } finally {
      setDemoSaving(false)
    }
  }

  return (
    <div style={wrap}>
      {toast && (
        <div style={{
          position: 'fixed', top: 24, right: 24, zIndex: 100,
          padding: '12px 18px', borderRadius: 10, fontSize: 14, fontWeight: 600,
          background: toast.kind === 'ok' ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
          border: `1px solid ${toast.kind === 'ok' ? 'rgba(34,197,94,0.4)' : 'rgba(239,68,68,0.4)'}`,
          color: toast.kind === 'ok' ? '#86efac' : '#fca5a5',
          boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
        }}>{toast.message}</div>
      )}
      <button style={{ ...btnGhost, marginBottom: 16 }} onClick={() => router.push('/admin/contractors')}>
        <ArrowLeft size={14} /> All contractors
      </button>

      <h1 style={{ fontSize: 26, margin: '0 0 4px' }}>{contractor.first_name} {contractor.last_name}</h1>
      <p style={{ color: 'rgba(255,255,255,0.65)', margin: '0 0 18px' }}>
        Status: <strong>{contractor.status}</strong>
        {contractor.termination_date ? `  Terminated ${formatDate(contractor.termination_date)}` : ''}
      </p>

      {/* Profile */}
      <div style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h2 style={{ ...sectionTitle, margin: 0 }}>Profile</h2>
          <button
            style={{ ...btnGhost, padding: '6px 12px', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 6 }}
            onClick={() => setEditOpen(true)}
          >
            <Pencil size={12} /> Edit Profile
          </button>
        </div>
        <div style={kvRow}>
          <div style={kvKey}>Email</div>
          <div style={{ ...kvVal, display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'space-between' }}>
            <span>{contractor.email}</span>
            {canResendInvite && (
              <button
                style={{ ...btnGhost, padding: '4px 10px', fontSize: 12 }}
                disabled={busy === 'resend'}
                onClick={resendInvite}
              >
                <Send size={12} style={{ marginRight: 4, verticalAlign: 'middle' }} />
                {busy === 'resend' ? 'Resending...' : 'Resend Invite'}
              </button>
            )}
            {canResendPortalAccess && (
              <button
                style={{ ...btnGhost, padding: '4px 10px', fontSize: 12 }}
                disabled={busy === 'portal'}
                onClick={resendPortalAccess}
                title="Re-send the post-signing portal access email"
              >
                <Send size={12} style={{ marginRight: 4, verticalAlign: 'middle' }} />
                {busy === 'portal' ? 'Sending...' : 'Resend Portal Access'}
              </button>
            )}
          </div>
        </div>
        <div style={kvRow}><div style={kvKey}>Phone</div><div style={kvVal}>{contractor.phone || 'Not provided'}</div></div>
        <div style={kvRow}><div style={kvKey}>ABN</div><div style={kvVal}>{contractor.abn || 'Not provided (47% withholding applies)'}</div></div>
        <div style={kvRow}><div style={kvKey}>Bank BSB</div><div style={kvVal}>{contractor.bank_bsb || 'Not provided'}</div></div>
        <div style={kvRow}><div style={kvKey}>Account No.</div><div style={kvVal}>{contractor.bank_account_number || 'Not provided'}</div></div>
        <div style={kvRow}><div style={kvKey}>Created</div><div style={kvVal}>{formatDate(contractor.created_at)}</div></div>
      </div>

      {/* Demo Configuration */}
      <div style={card}>
        <h2 style={sectionTitle}>Demo Configuration</h2>
        <div style={kvRow}>
          <div style={kvKey}>Demo Industry</div>
          <div style={{ ...kvVal, display: 'flex', alignItems: 'center', gap: 10 }}>
            {linkedRep ? (
              <>
                <select
                  value={demoIndustry}
                  disabled={demoSaving}
                  onChange={(e) => {
                    setDemoIndustry(e.target.value)
                    saveDemoIndustry(e.target.value)
                  }}
                  style={{
                    background: '#061322',
                    color: 'white',
                    border: '1px solid rgba(255,255,255,0.15)',
                    borderRadius: 8,
                    padding: '6px 10px',
                    fontSize: 13,
                    fontFamily: 'inherit',
                    cursor: demoSaving ? 'not-allowed' : 'pointer',
                    opacity: demoSaving ? 0.7 : 1,
                  }}
                >
                  <option value="">Not assigned</option>
                  {DEMO_INDUSTRIES.map((ind) => (
                    ind.available ? (
                      <option key={ind.key} value={ind.key}>{ind.label}</option>
                    ) : (
                      <option key={ind.key} value={ind.key} disabled>{ind.label} (Coming soon)</option>
                    )
                  ))}
                </select>
                {demoSaving && (
                  <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>Saving...</span>
                )}
                {demoSaved && !demoSaving && (
                  <span style={{
                    fontSize: 12, fontWeight: 600, color: '#22c55e',
                    background: 'rgba(34,197,94,0.12)',
                    border: '1px solid rgba(34,197,94,0.3)',
                    padding: '2px 8px', borderRadius: 6,
                  }}>Saved</span>
                )}
              </>
            ) : (
              <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>No linked sales rep</span>
            )}
          </div>
        </div>
        <div style={kvRow}>
          <div style={kvKey}>Demo Booking Link</div>
          <div style={kvVal}>
            {linkedRep?.demo_calendly_url ? (
              <span style={{ fontFamily: 'monospace', fontSize: 12, color: 'rgba(255,255,255,0.8)', wordBreak: 'break-all' }}>
                {linkedRep.demo_calendly_url}
              </span>
            ) : (
              <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>
                Not set - rep must add this in their profile
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Agreement */}
      <div style={card}>
        <h2 style={sectionTitle}>Agreement</h2>
        {contractor.agreement_signed_at ? (
          <>
            <div style={kvRow}><div style={kvKey}>Signed</div><div style={kvVal}>{formatDateTime(contractor.agreement_signed_at)}</div></div>
            <div style={kvRow}><div style={kvKey}>Version</div><div style={kvVal}>{agreements[0]?.agreement_version ?? '2.1'}</div></div>
            <div style={kvRow}><div style={kvKey}>Script version</div><div style={kvVal}>{agreements[0]?.script_version ?? ''} (dated {agreements[0]?.script_date ?? ''})</div></div>
            {signedPdfUrl && (
              <div style={{ marginTop: 12 }}>
                <a href={signedPdfUrl} target="_blank" rel="noreferrer" style={{ ...btnPrimary, textDecoration: 'none' }}>
                  <FileText size={14} /> View signed PDF
                </a>
              </div>
            )}
          </>
        ) : (
          <p style={{ color: 'rgba(255,255,255,0.6)', margin: 0 }}>
            Not signed yet. Status: <strong>{contractor.status}</strong>.
          </p>
        )}
      </div>

      {/* Script acknowledgements */}
      <div style={card}>
        <h2 style={sectionTitle}>Script Acknowledgements</h2>
        {acknowledgements.length === 0 ? (
          <p style={{ color: 'rgba(255,255,255,0.6)', margin: 0 }}>No script acknowledgements yet.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr><th style={thStyle}>Script Version</th><th style={thStyle}>Acknowledged</th></tr></thead>
            <tbody>
              {acknowledgements.map(a => (
                <tr key={a.id}>
                  <td style={tdStyle}>{a.script_version}</td>
                  <td style={tdStyle}>{formatDateTime(a.acknowledged_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Commissions */}
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <h2 style={{ ...sectionTitle, margin: 0 }}>
            Commissions {commissions.length > 0 && (
              <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', fontWeight: 400, marginLeft: 8 }}>
                ({formatCurrency(totalEarned)} earned)
              </span>
            )}
          </h2>
          <button style={btnPrimary} onClick={() => setAddOpen(true)}>
            <Plus size={14} /> Add Commission
          </button>
        </div>

        {commissions.length === 0 ? (
          <p style={{ color: 'rgba(255,255,255,0.6)', margin: 0 }}>No commissions recorded yet.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={thStyle}>Plan</th>
                  <th style={thStyle}>Billing</th>
                  <th style={thStyle}>Sale</th>
                  <th style={thStyle}>Commission</th>
                  <th style={thStyle}>Status</th>
                  <th style={thStyle}>Clawback ends</th>
                  <th style={thStyle}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {commissions.map(c => {
                  const clawbackEnd = new Date(c.clawback_period_ends_at)
                  const clawbackHeld = clawbackEnd.getTime() > Date.now()
                  return (
                  <tr key={c.id}>
                    <td style={tdStyle}>{c.plan_type}</td>
                    <td style={tdStyle}>{c.billing_cycle}</td>
                    <td style={tdStyle}>{formatCurrency(Number(c.sale_amount))}</td>
                    <td style={tdStyle}>${Number(c.commission_amount).toFixed(2)}</td>
                    <td style={tdStyle}>{statusBadge(c.status)}</td>
                    <td style={tdStyle}>
                      <span style={{ color: clawbackHeld ? '#F59E0B' : 'inherit' }}>
                        {formatDate(c.clawback_period_ends_at)}
                      </span>
                    </td>
                    <td style={tdStyle}>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {c.status === 'pending' && (
                          <button
                            style={clawbackHeld ? { ...btnGhost, opacity: 0.5, cursor: 'not-allowed' } : btnGhost}
                            disabled={busy === c.id + ':clear' || clawbackHeld}
                            title={clawbackHeld ? `Available to clear on ${formatDate(c.clawback_period_ends_at)}` : undefined}
                            onClick={() => updateCommission(c.id, 'clear')}
                          >Mark Cleared</button>
                        )}
                        {c.status === 'cleared' && (
                          <button
                            style={btnGhost}
                            disabled={busy === c.id + ':paid'}
                            onClick={() => {
                              const ref = window.prompt('Optional Stripe payment ID for this payout:') ?? ''
                              updateCommission(c.id, 'paid', { stripe_payment_id: ref || null })
                            }}
                          >Mark Paid</button>
                        )}
                        {c.status !== 'paid' && c.status !== 'clawback' && (
                          <button
                            style={btnGhost}
                            disabled={busy === c.id + ':clawback'}
                            onClick={() => {
                              const reason = window.prompt('Reason for clawback:')
                              if (reason && reason.trim()) updateCommission(c.id, 'clawback', { reason: reason.trim() })
                            }}
                          >Trigger Clawback</button>
                        )}
                      </div>
                    </td>
                  </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Danger zone */}
      {contractor.status !== 'terminated' && (
        <div style={{ ...card, borderColor: 'rgba(239,68,68,0.4)' }}>
          <h2 style={{ ...sectionTitle, color: '#fca5a5' }}>
            <AlertTriangle size={16} style={{ verticalAlign: 'middle', marginRight: 6 }} />
            Danger Zone
          </h2>
          <p style={{ color: 'rgba(255,255,255,0.65)', margin: '0 0 12px', fontSize: 14 }}>
            Terminating a contractor stops all future commission payouts and marks them inactive in the portal.
          </p>
          <button style={btnDanger} onClick={() => setTerminateOpen(true)}>Terminate Contractor</button>
        </div>
      )}

      {addOpen && (
        <AddCommissionModal
          contractorId={contractor.id}
          onClose={() => setAddOpen(false)}
          onCreated={() => { setAddOpen(false); router.refresh() }}
        />
      )}

      {terminateOpen && (
        <TerminateModal
          name={`${contractor.first_name} ${contractor.last_name}`}
          busy={busy === 'terminate'}
          onClose={() => setTerminateOpen(false)}
          onConfirm={terminate}
        />
      )}

      {editOpen && (
        <EditRepModal
          contractorId={contractor.id}
          repDisplayName={`${contractor.first_name} ${contractor.last_name}`.trim() || contractor.email}
          initial={{
            full_name: linkedRep?.full_name
              ?? `${contractor.first_name} ${contractor.last_name}`.trim(),
            email: contractor.email,
            phone: contractor.phone ?? '',
            notification_email: linkedRep?.notification_email ?? '',
            abn: contractor.abn ?? '',
            bank_bsb: contractor.bank_bsb ?? '',
            bank_account_number: contractor.bank_account_number ?? '',
            status: linkedRep?.status === 'inactive' ? 'inactive' : 'active',
          }}
          onClose={() => setEditOpen(false)}
        />
      )}
    </div>
  )
}

function AddCommissionModal({
  contractorId, onClose, onCreated,
}: { contractorId: string; onClose: () => void; onCreated: () => void }) {
  const [plan, setPlan] = useState<'starter' | 'growth' | 'pro'>('growth')
  const [billing, setBilling] = useState<'monthly' | 'annual'>('monthly')
  const [saleAmount, setSaleAmount] = useState('349')
  const [businessId, setBusinessId] = useState('')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const commission = COMMISSION_RATES[plan][billing]

  const submit = async () => {
    setError(null)
    setSubmitting(true)
    try {
      const res = await fetch('/api/contractor-commissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contractor_id: contractorId,
          plan_type: plan,
          billing_cycle: billing,
          sale_amount: Number(saleAmount) || 0,
          client_business_id: businessId.trim() || undefined,
          notes: notes.trim() || undefined,
        }),
      })
      const json = await res.json()
      if (!json.ok) setError(json.error || 'Could not add commission')
      else onCreated()
    } finally {
      setSubmitting(false)
    }
  }

  const overlay: React.CSSProperties = {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, zIndex: 50,
  }
  const modal: React.CSSProperties = {
    background: '#0A1E38', border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 14, padding: 24, width: '100%', maxWidth: 500,
    fontFamily: 'Outfit, sans-serif', color: 'white',
  }
  const labelS: React.CSSProperties = { display: 'block', fontSize: 12, color: 'rgba(255,255,255,0.7)', marginBottom: 6, fontWeight: 600 }
  const inputS: React.CSSProperties = {
    width: '100%', padding: '10px 12px', borderRadius: 10,
    background: '#061322', border: '1px solid rgba(255,255,255,0.12)',
    color: 'white', fontFamily: 'inherit', fontSize: 14,
  }
  const btnP: React.CSSProperties = { background: '#22D3EE', color: '#061322', border: 'none', padding: '10px 18px', borderRadius: 10, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', fontSize: 14 }
  const btnG: React.CSSProperties = { background: 'transparent', color: 'white', border: '1px solid rgba(255,255,255,0.2)', padding: '10px 18px', borderRadius: 10, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', fontSize: 14 }

  return (
    <div style={overlay} onClick={onClose}>
      <div style={modal} onClick={e => e.stopPropagation()}>
        <h2 style={{ fontSize: 20, margin: '0 0 16px' }}>Add Commission</h2>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div>
            <label style={labelS}>Plan</label>
            <select style={inputS as React.CSSProperties} value={plan} onChange={e => setPlan(e.target.value as 'starter' | 'growth' | 'pro')}>
              <option value="starter">Starter</option>
              <option value="growth">Growth</option>
              <option value="pro">Pro</option>
            </select>
          </div>
          <div>
            <label style={labelS}>Billing Cycle</label>
            <select style={inputS as React.CSSProperties} value={billing} onChange={e => setBilling(e.target.value as 'monthly' | 'annual')}>
              <option value="monthly">Monthly</option>
              <option value="annual">Annual</option>
            </select>
          </div>
        </div>

        <div style={{ marginTop: 10 }}>
          <label style={labelS}>Sale Amount (AUD)</label>
          <input style={inputS} type="number" min="0" step="0.01" value={saleAmount} onChange={e => setSaleAmount(e.target.value)} />
          <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', marginTop: 6 }}>
            Commission auto-calculates to <strong>${commission.toFixed(2)}</strong> ({plan} / {billing}).
          </p>
        </div>

        <div style={{ marginTop: 10 }}>
          <label style={labelS}>Client Business ID (optional)</label>
          <input style={inputS} value={businessId} onChange={e => setBusinessId(e.target.value)} placeholder="businesses.id UUID" />
        </div>

        <div style={{ marginTop: 10 }}>
          <label style={labelS}>Notes (optional)</label>
          <input style={inputS} value={notes} onChange={e => setNotes(e.target.value)} />
        </div>

        {error && (
          <div style={{ background: 'rgba(248,113,113,0.12)', border: '1px solid rgba(248,113,113,0.4)', color: '#fecaca', padding: 10, borderRadius: 8, fontSize: 13, marginTop: 10 }}>{error}</div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 18 }}>
          <button style={btnG} onClick={onClose} disabled={submitting}>Cancel</button>
          <button style={btnP} onClick={submit} disabled={submitting}>{submitting ? 'Saving...' : 'Add Commission'}</button>
        </div>
      </div>
    </div>
  )
}

function TerminateModal({
  name, busy, onClose, onConfirm,
}: { name: string; busy: boolean; onClose: () => void; onConfirm: (reason: string) => void }) {
  const [reason, setReason] = useState('')

  const overlay: React.CSSProperties = {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, zIndex: 50,
  }
  const modal: React.CSSProperties = {
    background: '#0A1E38', border: '1px solid rgba(239,68,68,0.4)',
    borderRadius: 14, padding: 24, width: '100%', maxWidth: 460,
    fontFamily: 'Outfit, sans-serif', color: 'white',
  }
  const labelS: React.CSSProperties = { display: 'block', fontSize: 12, color: 'rgba(255,255,255,0.7)', marginBottom: 6, fontWeight: 600 }
  const inputS: React.CSSProperties = {
    width: '100%', padding: '10px 12px', borderRadius: 10,
    background: '#061322', border: '1px solid rgba(255,255,255,0.12)',
    color: 'white', fontFamily: 'inherit', fontSize: 14,
  }

  return (
    <div style={overlay} onClick={onClose}>
      <div style={modal} onClick={e => e.stopPropagation()}>
        <h2 style={{ fontSize: 20, margin: '0 0 8px', color: '#fca5a5' }}>Terminate {name}?</h2>
        <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 14, margin: '0 0 14px' }}>
          This sets the contractor status to terminated and stops future commission payouts.
          Past commissions are unaffected. This action cannot be undone from the UI.
        </p>
        <label style={labelS}>Reason (optional)</label>
        <input style={inputS} value={reason} onChange={e => setReason(e.target.value)} />
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 18 }}>
          <button
            style={{ background: 'transparent', color: 'white', border: '1px solid rgba(255,255,255,0.2)', padding: '10px 18px', borderRadius: 10, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', fontSize: 14 }}
            onClick={onClose}
            disabled={busy}
          >Cancel</button>
          <button
            style={{ background: '#ef4444', color: 'white', border: 'none', padding: '10px 18px', borderRadius: 10, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', fontSize: 14 }}
            onClick={() => onConfirm(reason.trim())}
            disabled={busy}
          >{busy ? 'Terminating...' : 'Terminate Contractor'}</button>
        </div>
      </div>
    </div>
  )
}
