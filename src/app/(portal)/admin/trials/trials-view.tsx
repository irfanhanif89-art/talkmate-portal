'use client'

import { useMemo, useState } from 'react'
import { industryLabel, planLabel, trialDaysRemaining } from '../clients/types'

interface TrialRow {
  id: string
  name: string
  industry: string | null
  plan: string | null
  account_status: string | null
  trial_start_date: string | null
  trial_end_date: string | null
  trial_converted_at: string | null
  created_at: string
}

export default function TrialsView({ initial }: { initial: TrialRow[] }) {
  const [rows, setRows] = useState<TrialRow[]>(initial)
  const [busy, setBusy] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const sorted = useMemo(() =>
    [...rows].sort((a, b) => {
      const aT = a.trial_end_date ? new Date(a.trial_end_date).getTime() : Number.MAX_SAFE_INTEGER
      const bT = b.trial_end_date ? new Date(b.trial_end_date).getTime() : Number.MAX_SAFE_INTEGER
      return aT - bT
    })
  , [rows])

  function showToast(m: string) { setToast(m); setTimeout(() => setToast(null), 3500) }

  async function action(id: string, kind: 'extend-trial' | 'end-trial' | 'convert-trial', body?: Record<string, unknown>) {
    setBusy(`${id}:${kind}`)
    try {
      const res = await fetch(`/api/admin/clients/${id}/${kind}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      })
      const data = await res.json()
      if (!data.ok) throw new Error(data.error || 'Failed')
      if (kind === 'extend-trial') {
        setRows(rs => rs.map(r => r.id === id ? { ...r, trial_end_date: data.business.trial_end_date } : r))
        showToast('Extended by 3 days')
      } else {
        // 'end-trial' moves account_status to 'expired'; 'convert-trial' moves to 'active'.
        // Either way the row leaves this list — drop it.
        setRows(rs => rs.filter(r => r.id !== id))
        showToast(kind === 'end-trial' ? 'Trial ended' : 'Trial converted to paid')
      }
    } catch (e) {
      showToast((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div>
      <div style={{ background: '#0A1E38', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 980 }}>
          <thead>
            <tr style={{ background: '#071829' }}>
              {['Business', 'Industry', 'Plan', 'Start', 'End', 'Days left', 'Actions'].map(h => (
                <th key={h} style={{ textAlign: 'left' as const, padding: '11px 16px', fontSize: 11, fontWeight: 700, color: '#4A7FBB', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 && (
              <tr>
                <td colSpan={7} style={{ padding: 32, textAlign: 'center' as const, fontSize: 13, color: '#7BAED4' }}>
                  No active trials at the moment.
                </td>
              </tr>
            )}
            {sorted.map((r, i) => {
              const days = trialDaysRemaining(r.trial_end_date)
              const dayColor = days === null
                ? '#7BAED4'
                : days <= 1 ? '#EF4444'
                : days <= 3 ? '#F59E0B'
                : '#22C55E'
              const k = `${r.id}:`
              return (
                <tr key={r.id} style={{ borderTop: '1px solid rgba(255,255,255,0.04)', background: i % 2 === 0 ? '#0A1E38' : '#071829' }}>
                  <td style={{ padding: '12px 16px', fontSize: 13, fontWeight: 600, color: 'white' }}>{r.name}</td>
                  <td style={{ padding: '12px 16px', fontSize: 12, color: '#7BAED4' }}>{industryLabel(r.industry)}</td>
                  <td style={{ padding: '12px 16px' }}>
                    <span style={{ fontSize: 11, padding: '3px 9px', borderRadius: 99, background: 'rgba(232,98,42,0.12)', color: '#E8622A', fontWeight: 700 }}>
                      {planLabel(r.plan)}
                    </span>
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: 12, color: '#7BAED4' }}>
                    {r.trial_start_date ? new Date(r.trial_start_date).toLocaleDateString('en-AU') : '—'}
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: 12, color: '#7BAED4' }}>
                    {r.trial_end_date ? new Date(r.trial_end_date).toLocaleDateString('en-AU') : '—'}
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: 13, fontWeight: 700, color: dayColor }}>
                    {days === null ? '—' : `${days} day${days === 1 ? '' : 's'}`}
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <button onClick={() => action(r.id, 'convert-trial', { plan: r.plan ?? 'starter' })} disabled={busy === k + 'convert-trial'} style={btn('#22C55E')}>
                        {busy === k + 'convert-trial' ? '…' : 'Convert'}
                      </button>
                      <button onClick={() => action(r.id, 'extend-trial')} disabled={busy === k + 'extend-trial'} style={btn('#4A9FE8')}>
                        {busy === k + 'extend-trial' ? '…' : '+3 days'}
                      </button>
                      <button onClick={() => action(r.id, 'end-trial')} disabled={busy === k + 'end-trial'} style={btn('#EF4444', true)}>
                        {busy === k + 'end-trial' ? '…' : 'End'}
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

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

function btn(color: string, subtle = false): React.CSSProperties {
  return {
    padding: '6px 12px', borderRadius: 7, fontSize: 11, fontWeight: 700,
    background: subtle ? 'transparent' : color,
    border: `1px solid ${color}`,
    color: subtle ? color : 'white',
    cursor: 'pointer', fontFamily: 'Outfit, sans-serif',
    whiteSpace: 'nowrap' as const,
  }
}
