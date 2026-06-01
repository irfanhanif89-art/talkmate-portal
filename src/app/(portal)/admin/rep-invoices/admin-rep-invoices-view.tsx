'use client'

import { useState } from 'react'
import { Download, Receipt, CheckCircle2, Clock, XCircle } from 'lucide-react'

export interface AdminInvoiceRow {
  id: string
  rep_name: string
  invoice_number: string | null
  amount: number | null
  period_label: string | null
  notes: string | null
  document_name: string | null
  status: 'submitted' | 'approved' | 'paid' | 'rejected'
  admin_note: string | null
  payment_reference: string | null
  submitted_at: string
  due_at: string
  paid_at: string | null
}

function fmtMoney(n: number | null): string {
  if (n === null) return '—'
  return `$${n.toLocaleString('en-AU', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
}

function fmtDate(s: string | null): string {
  if (!s) return '—'
  return new Date(s).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
}

function daysUntil(s: string): number {
  return Math.ceil((new Date(s).getTime() - Date.now()) / 86_400_000)
}

const STATUS_META: Record<AdminInvoiceRow['status'], { label: string; color: string; bg: string; Icon: typeof Clock }> = {
  submitted: { label: 'Submitted', color: '#fcd34d', bg: 'rgba(245,158,11,0.12)', Icon: Clock },
  approved:  { label: 'Approved',  color: '#7dd3fc', bg: 'rgba(56,189,248,0.12)', Icon: CheckCircle2 },
  paid:      { label: 'Paid',      color: '#86efac', bg: 'rgba(34,197,94,0.12)',  Icon: CheckCircle2 },
  rejected:  { label: 'Rejected',  color: '#fca5a5', bg: 'rgba(239,68,68,0.12)',  Icon: XCircle },
}

export default function AdminRepInvoicesView({ initialInvoices }: { initialInvoices: AdminInvoiceRow[] }) {
  const [invoices, setInvoices] = useState<AdminInvoiceRow[]>(initialInvoices)
  const [busyId, setBusyId] = useState<string | null>(null)

  async function download(id: string) {
    setBusyId(id)
    try {
      const res = await fetch(`/api/sales/storage/invoice-url?id=${encodeURIComponent(id)}`)
      const body = await res.json().catch(() => ({}))
      if (res.ok && body.ok && body.url) window.open(body.url as string, '_blank', 'noopener,noreferrer')
    } finally {
      setBusyId(null)
    }
  }

  async function act(id: string, action: 'approve' | 'pay' | 'reject') {
    let payment_reference: string | undefined
    let admin_note: string | undefined
    if (action === 'pay') {
      payment_reference = window.prompt('Payment reference (optional):') ?? undefined
    } else if (action === 'reject') {
      const reason = window.prompt('Reason for rejection (shown to the rep):')
      if (reason === null) return
      admin_note = reason
    }
    setBusyId(id)
    try {
      const res = await fetch(`/api/admin/rep-invoices/${encodeURIComponent(id)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, payment_reference, admin_note }),
      })
      const body = await res.json().catch(() => ({}))
      if (res.ok && body.ok && body.invoice) {
        setInvoices(prev => prev.map(inv => inv.id === id ? { ...inv, ...body.invoice } : inv))
      }
    } finally {
      setBusyId(null)
    }
  }

  const pendingCount = invoices.filter(i => i.status === 'submitted' || i.status === 'approved').length

  return (
    <div style={{ fontFamily: 'Outfit, sans-serif' }}>
      <div style={{ marginBottom: 22 }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0, letterSpacing: '-0.5px', color: 'white' }}>Rep Invoices</h1>
        <p style={{ fontSize: 13, color: '#7BAED4', margin: '4px 0 0' }}>
          Contractor invoices submitted by sales reps. {pendingCount} awaiting payment. Pay within 14 days of submission.
        </p>
      </div>

      {invoices.length === 0 ? (
        <div style={{
          background: '#0A1E38', border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: 12, padding: 32, textAlign: 'center', color: '#7BAED4', fontSize: 13,
        }}>
          <Receipt size={28} style={{ opacity: 0.5, marginBottom: 10 }} />
          <div>No invoices submitted yet.</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {invoices.map(inv => {
            const meta = STATUS_META[inv.status]
            const StatusIcon = meta.Icon
            const overdue = (inv.status === 'submitted' || inv.status === 'approved') && daysUntil(inv.due_at) < 0
            return (
              <div key={inv.id} style={{
                background: '#0A1E38', border: `1px solid ${overdue ? 'rgba(239,68,68,0.4)' : 'rgba(255,255,255,0.06)'}`,
                borderRadius: 12, padding: 16,
                display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap',
              }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'white' }}>
                    {inv.rep_name} · {inv.invoice_number || inv.document_name || 'Invoice'} · {fmtMoney(inv.amount)}
                  </div>
                  <div style={{ fontSize: 12, color: '#7BAED4', marginTop: 3 }}>
                    {inv.period_label ? `${inv.period_label} · ` : ''}Submitted {fmtDate(inv.submitted_at)}
                    {inv.status === 'paid'
                      ? ` · Paid ${fmtDate(inv.paid_at)}`
                      : inv.status === 'rejected'
                        ? ''
                        : ` · Due ${fmtDate(inv.due_at)}${overdue ? ' (OVERDUE)' : ` (${daysUntil(inv.due_at)}d)`}`}
                  </div>
                  {inv.notes && <div style={{ fontSize: 12, color: '#9fb6cc', marginTop: 4 }}>“{inv.notes}”</div>}
                  {inv.status === 'rejected' && inv.admin_note && (
                    <div style={{ fontSize: 12, color: '#fca5a5', marginTop: 4 }}>Reason: {inv.admin_note}</div>
                  )}
                  {inv.status === 'paid' && inv.payment_reference && (
                    <div style={{ fontSize: 12, color: '#86efac', marginTop: 4 }}>Ref: {inv.payment_reference}</div>
                  )}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    padding: '5px 10px', borderRadius: 999, fontSize: 12, fontWeight: 700,
                    background: meta.bg, color: meta.color,
                  }}>
                    <StatusIcon size={13} /> {meta.label}
                  </span>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    <button onClick={() => download(inv.id)} disabled={busyId === inv.id} style={btnGhost}>
                      <Download size={13} /> PDF
                    </button>
                    {inv.status === 'submitted' && (
                      <button onClick={() => act(inv.id, 'approve')} disabled={busyId === inv.id} style={btnGhost}>Approve</button>
                    )}
                    {(inv.status === 'submitted' || inv.status === 'approved') && (
                      <>
                        <button onClick={() => act(inv.id, 'pay')} disabled={busyId === inv.id} style={btnPrimary}>Mark paid</button>
                        <button onClick={() => act(inv.id, 'reject')} disabled={busyId === inv.id} style={btnDanger}>Reject</button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

const btnBase: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6,
  padding: '7px 12px', borderRadius: 8, cursor: 'pointer',
  fontFamily: 'Outfit, sans-serif', fontSize: 12, fontWeight: 700,
}
const btnGhost: React.CSSProperties = {
  ...btnBase, background: 'rgba(255,255,255,0.05)',
  border: '1px solid rgba(255,255,255,0.12)', color: '#7BAED4',
}
const btnPrimary: React.CSSProperties = {
  ...btnBase, background: '#22c55e', border: 'none', color: 'white',
}
const btnDanger: React.CSSProperties = {
  ...btnBase, background: 'rgba(239,68,68,0.12)',
  border: '1px solid rgba(239,68,68,0.3)', color: '#fca5a5',
}
