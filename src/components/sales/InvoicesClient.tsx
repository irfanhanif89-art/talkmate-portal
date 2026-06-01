'use client'

import { useState } from 'react'
import { Upload, FileText, Download, CheckCircle2, Clock, XCircle } from 'lucide-react'

export interface RepInvoiceRow {
  id: string
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

const STATUS_META: Record<RepInvoiceRow['status'], { label: string; color: string; bg: string; Icon: typeof Clock }> = {
  submitted: { label: 'Submitted',  color: '#fcd34d', bg: 'rgba(245,158,11,0.12)', Icon: Clock },
  approved:  { label: 'Approved',   color: '#7dd3fc', bg: 'rgba(56,189,248,0.12)', Icon: CheckCircle2 },
  paid:      { label: 'Paid',       color: '#86efac', bg: 'rgba(34,197,94,0.12)',  Icon: CheckCircle2 },
  rejected:  { label: 'Rejected',   color: '#fca5a5', bg: 'rgba(239,68,68,0.12)',  Icon: XCircle },
}

export default function InvoicesClient({ initialInvoices }: { initialInvoices: RepInvoiceRow[] }) {
  const [invoices, setInvoices] = useState<RepInvoiceRow[]>(initialInvoices)
  const [file, setFile] = useState<File | null>(null)
  const [invoiceNumber, setInvoiceNumber] = useState('')
  const [amount, setAmount] = useState('')
  const [periodLabel, setPeriodLabel] = useState('')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)

  async function refresh() {
    const res = await fetch('/api/sales/invoices')
    const body = await res.json().catch(() => ({}))
    if (res.ok && body.ok) setInvoices(body.invoices as RepInvoiceRow[])
  }

  async function submit() {
    if (!file) { setError('Please attach your invoice PDF.'); return }
    setSubmitting(true); setError(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      if (invoiceNumber.trim()) fd.append('invoice_number', invoiceNumber.trim())
      if (amount.trim()) fd.append('amount', amount.trim())
      if (periodLabel.trim()) fd.append('period_label', periodLabel.trim())
      if (notes.trim()) fd.append('notes', notes.trim())

      const res = await fetch('/api/sales/invoices', { method: 'POST', body: fd })
      const body = await res.json().catch(() => ({}))
      if (!res.ok || !body.ok) {
        setError(body?.error ?? 'Upload failed. Try again.')
        setSubmitting(false)
        return
      }
      // Reset form + reload list.
      setFile(null); setInvoiceNumber(''); setAmount(''); setPeriodLabel(''); setNotes('')
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error uploading invoice.')
    } finally {
      setSubmitting(false)
    }
  }

  async function download(id: string) {
    setDownloadingId(id)
    try {
      const res = await fetch(`/api/sales/storage/invoice-url?id=${encodeURIComponent(id)}`)
      const body = await res.json().catch(() => ({}))
      if (res.ok && body.ok && body.url) {
        window.open(body.url as string, '_blank', 'noopener,noreferrer')
      }
    } finally {
      setDownloadingId(null)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
      {/* Upload card */}
      <div style={{
        background: '#0A1E38', border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: 12, padding: 22,
      }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: 'white', marginBottom: 4 }}>Submit an invoice</div>
        <p style={{ fontSize: 12, color: '#7BAED4', margin: 0, marginBottom: 18 }}>
          Generate your invoice however you normally do, then upload the PDF here. We pay within 14 days of submission.
        </p>

        <Field label="Invoice PDF">
          <label style={{
            display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer',
            padding: '12px 14px', borderRadius: 9, background: '#061322',
            border: `1px dashed ${file ? 'rgba(34,197,94,0.5)' : 'rgba(255,255,255,0.15)'}`,
          }}>
            <Upload size={16} style={{ color: file ? '#22c55e' : '#7BAED4' }} />
            <span style={{ fontSize: 13, color: file ? 'white' : '#7BAED4' }}>
              {file ? file.name : 'Choose a PDF file (max 20MB)'}
            </span>
            <input
              type="file" accept="application/pdf"
              onChange={e => { setFile(e.target.files?.[0] ?? null); setError(null) }}
              style={{ display: 'none' }}
            />
          </label>
        </Field>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="Invoice number" help="Optional">
            <input value={invoiceNumber} onChange={e => setInvoiceNumber(e.target.value)} style={inputStyle} placeholder="e.g. INV-0007" />
          </Field>
          <Field label="Amount (AUD)" help="Optional">
            <input value={amount} onChange={e => setAmount(e.target.value)} style={inputStyle} placeholder="e.g. 598" inputMode="decimal" />
          </Field>
        </div>

        <Field label="What's this for?" help="Optional — e.g. the month or the deals it covers.">
          <input value={periodLabel} onChange={e => setPeriodLabel(e.target.value)} style={inputStyle} placeholder="e.g. May 2026 commissions" />
        </Field>

        <Field label="Note to admin" help="Optional">
          <textarea
            value={notes} onChange={e => setNotes(e.target.value.slice(0, 500))}
            rows={2} placeholder="Anything we should know."
            style={{ ...inputStyle, resize: 'vertical', fontFamily: 'Outfit, sans-serif' }}
          />
        </Field>

        {error && (
          <div style={{
            marginBottom: 12, padding: '10px 14px', borderRadius: 9,
            background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)',
            color: '#ef4444', fontSize: 13,
          }}>{error}</div>
        )}

        <button
          onClick={submit}
          disabled={submitting || !file}
          style={{
            width: '100%', padding: '12px 18px', borderRadius: 9, border: 'none',
            background: (submitting || !file) ? '#7B3A1A' : '#E8622A',
            color: 'white', fontFamily: 'Outfit, sans-serif',
            fontSize: 14, fontWeight: 700,
            cursor: (submitting || !file) ? 'not-allowed' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          }}
        >
          <Upload size={15} /> {submitting ? 'Uploading…' : 'Submit invoice'}
        </button>
      </div>

      {/* Submitted invoices */}
      <div>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#7BAED4', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          Your submitted invoices
        </div>
        {invoices.length === 0 ? (
          <div style={{
            background: '#0A1E38', border: '1px solid rgba(255,255,255,0.06)',
            borderRadius: 12, padding: 28, textAlign: 'center', color: '#7BAED4', fontSize: 13,
          }}>
            <FileText size={26} style={{ opacity: 0.5, marginBottom: 10 }} />
            <div>No invoices submitted yet. Upload your first one above.</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {invoices.map(inv => {
              const meta = STATUS_META[inv.status]
              const StatusIcon = meta.Icon
              return (
                <div key={inv.id} style={{
                  background: '#0A1E38', border: '1px solid rgba(255,255,255,0.06)',
                  borderRadius: 12, padding: 16,
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap',
                }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'white' }}>
                      {inv.invoice_number || inv.document_name || 'Invoice'} · {fmtMoney(inv.amount)}
                    </div>
                    <div style={{ fontSize: 12, color: '#7BAED4', marginTop: 3 }}>
                      {inv.period_label ? `${inv.period_label} · ` : ''}Submitted {fmtDate(inv.submitted_at)}
                      {inv.status !== 'paid' && inv.status !== 'rejected' ? ` · Due ${fmtDate(inv.due_at)}` : ''}
                      {inv.status === 'paid' ? ` · Paid ${fmtDate(inv.paid_at)}` : ''}
                    </div>
                    {inv.status === 'rejected' && inv.admin_note && (
                      <div style={{ fontSize: 12, color: '#fca5a5', marginTop: 4 }}>Reason: {inv.admin_note}</div>
                    )}
                    {inv.status === 'paid' && inv.payment_reference && (
                      <div style={{ fontSize: 12, color: '#86efac', marginTop: 4 }}>Ref: {inv.payment_reference}</div>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', gap: 6,
                      padding: '5px 10px', borderRadius: 999, fontSize: 12, fontWeight: 700,
                      background: meta.bg, color: meta.color,
                    }}>
                      <StatusIcon size={13} /> {meta.label}
                    </span>
                    <button
                      onClick={() => download(inv.id)}
                      disabled={downloadingId === inv.id}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 6,
                        padding: '7px 12px', borderRadius: 8, cursor: 'pointer',
                        background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
                        color: '#7BAED4', fontFamily: 'Outfit, sans-serif', fontSize: 12, fontWeight: 700,
                      }}
                    >
                      <Download size={13} /> {downloadingId === inv.id ? '…' : 'PDF'}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

function Field({ label, help, children }: { label: string; help?: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'block', marginBottom: 14 }}>
      <span style={{ display: 'block', fontSize: 12, color: '#7BAED4', fontWeight: 600, marginBottom: 6 }}>
        {label}
      </span>
      {children}
      {help && <span style={{ display: 'block', fontSize: 11, color: '#4A7FBB', marginTop: 4 }}>{help}</span>}
    </label>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 12px', borderRadius: 8,
  background: '#061322', border: '1px solid rgba(255,255,255,0.08)',
  color: 'white', fontFamily: 'Outfit, sans-serif', fontSize: 13, outline: 'none',
}
