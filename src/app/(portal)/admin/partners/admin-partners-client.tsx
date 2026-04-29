'use client'

import { useState } from 'react'
import Link from 'next/link'

interface PartnerRow {
  id: string
  name: string
  partner_tier: string | null
  partner_commission_rate: number | null
  referred_count: number
  referred_mrr: number
  has_white_label: boolean
}

const TIERS = ['starter', 'silver', 'gold'] as const

export default function AdminPartnersClient({ initialRows }: { initialRows: PartnerRow[] }) {
  const [rows, setRows] = useState<PartnerRow[]>(initialRows)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function update(id: string, patch: Partial<PartnerRow>) {
    setSavingId(id); setError(null)
    setRows(rs => rs.map(r => r.id === id ? { ...r, ...patch } : r))
    try {
      const res = await fetch('/api/admin/partner-update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...patch }),
      })
      const data = await res.json()
      if (!data.ok) throw new Error(data.error ?? 'Update failed')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSavingId(null)
    }
  }

  if (rows.length === 0) {
    return (
      <div style={{ padding: 24, background: '#0A1E38', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, fontSize: 13, color: '#7BAED4', textAlign: 'center' }}>
        No partner accounts yet. Flip <code style={{ color: '#E8622A' }}>businesses.is_partner</code> to true to enrol.
      </div>
    )
  }

  return (
    <div style={{ background: '#0A1E38', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, overflow: 'auto' }}>
      {error && (
        <div style={{ padding: '10px 16px', background: 'rgba(239,68,68,0.12)', color: '#EF4444', fontSize: 12 }}>
          {error}
        </div>
      )}
      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
        <thead>
          <tr style={{ background: '#071829' }}>
            {['Business', 'Tier', 'Commission', 'Referred', 'Attributed MRR', 'White label', 'Actions'].map(h => (
              <th key={h} style={{ textAlign: 'left' as const, padding: '10px 16px', fontSize: 11, fontWeight: 700, color: '#4A7FBB', textTransform: 'uppercase' as const, letterSpacing: '0.06em' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.id} style={{ borderTop: '1px solid rgba(255,255,255,0.04)', background: i % 2 === 0 ? '#0A1E38' : '#071829' }}>
              <td style={{ padding: '12px 16px', fontSize: 13, fontWeight: 600, color: 'white' }}>{r.name}</td>
              <td style={{ padding: '12px 16px' }}>
                <select
                  value={r.partner_tier ?? 'starter'}
                  onChange={e => update(r.id, { partner_tier: e.target.value })}
                  disabled={savingId === r.id}
                  style={{
                    background: '#071829', color: 'white',
                    border: '1px solid rgba(255,255,255,0.1)', borderRadius: 7,
                    padding: '5px 10px', fontSize: 12, fontFamily: 'Outfit, sans-serif', cursor: 'pointer',
                  }}
                >
                  {TIERS.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </td>
              <td style={{ padding: '12px 16px' }}>
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  max="100"
                  defaultValue={r.partner_commission_rate ?? 15}
                  onBlur={e => {
                    const val = parseFloat(e.target.value)
                    if (!isNaN(val) && val !== r.partner_commission_rate) update(r.id, { partner_commission_rate: val })
                  }}
                  disabled={savingId === r.id}
                  style={{
                    width: 70, background: '#071829', color: 'white',
                    border: '1px solid rgba(255,255,255,0.1)', borderRadius: 7,
                    padding: '5px 10px', fontSize: 12, fontFamily: 'Outfit, sans-serif',
                  }}
                />
                <span style={{ fontSize: 11, color: '#7BAED4', marginLeft: 4 }}>%</span>
              </td>
              <td style={{ padding: '12px 16px', fontSize: 13, color: 'white' }}>{r.referred_count}</td>
              <td style={{ padding: '12px 16px', fontSize: 13, fontWeight: 700, color: r.referred_mrr > 0 ? '#E8622A' : '#4A7FBB' }}>
                ${r.referred_mrr.toLocaleString()}/mo
              </td>
              <td style={{ padding: '12px 16px', fontSize: 12 }}>
                <span style={{ padding: '3px 9px', borderRadius: 99, fontSize: 11,
                  background: r.has_white_label ? 'rgba(34,197,94,0.12)' : 'rgba(255,255,255,0.04)',
                  color: r.has_white_label ? '#22C55E' : '#7BAED4',
                }}>
                  {r.has_white_label ? 'configured' : 'none'}
                </span>
              </td>
              <td style={{ padding: '12px 16px', fontSize: 12 }}>
                <Link href="/admin/white-label" style={{ color: '#4A9FE8', textDecoration: 'none', fontWeight: 600 }}>
                  White label →
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
