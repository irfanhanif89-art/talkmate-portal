'use client'

import { Download } from 'lucide-react'
import { formatCurrency, formatDate } from '@/lib/sales-format'

export interface CommissionRow {
  id: string
  business_name: string
  plan: string
  amount: number
  status: 'pending' | 'approved' | 'paid' | 'revoked'
  created_at: string
  paid_at: string | null
  payment_reference: string | null
  revoke_reason: string | null
}

const STATUS_STYLES: Record<CommissionRow['status'], { label: string; bg: string; color: string; border: string }> = {
  pending:  { label: 'Pending',  bg: 'rgba(255,255,255,0.06)', color: '#7BAED4', border: 'rgba(255,255,255,0.12)' },
  approved: { label: 'Approved', bg: 'rgba(74,159,232,0.15)',  color: '#4A9FE8', border: 'rgba(74,159,232,0.35)' },
  paid:     { label: 'Paid',     bg: 'rgba(34,197,94,0.15)',   color: '#22c55e', border: 'rgba(34,197,94,0.35)' },
  revoked:  { label: 'Revoked',  bg: 'rgba(239,68,68,0.12)',   color: '#ef4444', border: 'rgba(239,68,68,0.3)' },
}

export default function CommissionsTable({ rows, repName }: { rows: CommissionRow[]; repName: string }) {
  function downloadCsv() {
    const headers = ['Business', 'Plan', 'Amount', 'Status', 'Created', 'Paid', 'Reference', 'Revoke reason']
    const lines = [headers.join(',')]
    for (const r of rows) {
      lines.push([
        csvCell(r.business_name),
        r.plan,
        r.amount.toFixed(2),
        r.status,
        r.created_at,
        r.paid_at ?? '',
        csvCell(r.payment_reference ?? ''),
        csvCell(r.revoke_reason ?? ''),
      ].join(','))
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `commissions-${repName.replace(/\s+/g, '-').toLowerCase()}-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div style={{ background: '#0A1E38', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
        <h2 style={{ fontSize: 15, fontWeight: 700, color: 'white', margin: 0 }}>Commission ledger</h2>
        <button
          onClick={downloadCsv}
          disabled={rows.length === 0}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '8px 12px', borderRadius: 8, cursor: rows.length === 0 ? 'not-allowed' : 'pointer',
            background: 'transparent', color: '#7BAED4',
            border: '1px solid rgba(255,255,255,0.1)',
            fontFamily: 'Outfit, sans-serif', fontSize: 12, fontWeight: 600,
            opacity: rows.length === 0 ? 0.5 : 1,
          }}
        ><Download size={13} /> Export CSV</button>
      </div>

      {rows.length === 0 ? (
        <div style={{ padding: 28, fontSize: 13, color: '#7BAED4', textAlign: 'center', border: '1px dashed rgba(255,255,255,0.1)', borderRadius: 8 }}>
          No commissions yet. Close a deal to start your ledger.
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 720 }}>
            <thead>
              <tr style={{ color: '#4A7FBB', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                <th style={th}>Business</th>
                <th style={th}>Plan</th>
                <th style={th}>Amount</th>
                <th style={th}>Status</th>
                <th style={th}>Created</th>
                <th style={th}>Reference</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => {
                const sty = STATUS_STYLES[r.status]
                return (
                  <tr key={r.id} style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                    <td style={td}><strong style={{ color: 'white' }}>{r.business_name}</strong></td>
                    <td style={{ ...td, color: '#7BAED4', textTransform: 'capitalize' }}>{r.plan}</td>
                    <td style={{ ...td, color: '#E8622A', fontWeight: 700 }}>{formatCurrency(r.amount)}</td>
                    <td style={td}>
                      <span style={{
                        display: 'inline-block', padding: '3px 9px', borderRadius: 99,
                        background: sty.bg, color: sty.color, border: `1px solid ${sty.border}`,
                        fontSize: 11, fontWeight: 700,
                      }}>{sty.label}</span>
                      {r.status === 'revoked' && r.revoke_reason && (
                        <div style={{ fontSize: 11, color: '#ef4444', marginTop: 3 }}>{r.revoke_reason}</div>
                      )}
                    </td>
                    <td style={{ ...td, color: '#7BAED4' }}>{formatDate(r.created_at)}</td>
                    <td style={{ ...td, color: '#7BAED4', fontFamily: 'monospace', fontSize: 12 }}>{r.payment_reference ?? '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function csvCell(v: string): string {
  if (v.includes(',') || v.includes('"') || v.includes('\n')) {
    return `"${v.replace(/"/g, '""')}"`
  }
  return v
}

const th: React.CSSProperties = { padding: '10px 12px', textAlign: 'left' }
const td: React.CSSProperties = { padding: '12px', verticalAlign: 'top' }
