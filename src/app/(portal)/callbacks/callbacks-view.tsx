'use client'

import { useEffect, useMemo, useState } from 'react'

interface Callback {
  id: string
  caller_name: string | null
  caller_phone: string
  preferred_callback_time: string | null
  reason: string | null
  status: 'pending' | 'completed' | 'cancelled'
  created_at: string
}

type Tab = 'pending' | 'completed'

export default function CallbacksView() {
  const [list, setList] = useState<Callback[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>('pending')
  const [busy, setBusy] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => { reload() }, [])

  async function reload() {
    setLoading(true)
    try {
      const res = await fetch('/api/portal/callbacks')
      const data = await res.json()
      if (res.ok) setList(data.callbacks ?? [])
    } finally { setLoading(false) }
  }

  const filtered = useMemo(() => list.filter(c => c.status === tab), [list, tab])
  function showToast(m: string) { setToast(m); setTimeout(() => setToast(null), 3000) }

  async function updateStatus(c: Callback, status: 'completed' | 'cancelled') {
    setBusy(c.id)
    try {
      const res = await fetch(`/api/portal/callbacks/${c.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      if (res.ok) {
        setList(l => l.map(x => x.id === c.id ? { ...x, status } : x))
        showToast(status === 'completed' ? 'Marked complete' : 'Cancelled')
      }
    } finally { setBusy(null) }
  }

  return (
    <div>
      <div style={{ marginBottom: 22 }}>
        <h1 style={{ fontSize: '1.6rem', fontWeight: 800, color: 'white', margin: 0 }}>Callbacks</h1>
        <p style={{ fontSize: 13, color: '#7BAED4', margin: '4px 0 0 0' }}>
          Callers who asked you to call them back. Mark complete once you've made the call.
        </p>
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
        {(['pending', 'completed'] as Tab[]).map(t => (
          <button key={t} onClick={() => setTab(t)} style={tabBtn(tab === t)}>
            {t === 'pending' ? 'Pending' : 'Completed'}{' '}
            <span style={{ opacity: 0.7, fontSize: 11 }}>{list.filter(c => c.status === t).length}</span>
          </button>
        ))}
      </div>

      <div style={tableWrap}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#071829' }}>
              {['Requested', 'Caller', 'Preferred time', 'Reason', 'Action'].map(h => (
                <th key={h} style={th()}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={5} style={emptyCell()}>Loading…</td></tr>}
            {!loading && filtered.length === 0 && (
              <tr><td colSpan={5} style={emptyCell()}>Callers who request a callback appear here.</td></tr>
            )}
            {filtered.map((c, i) => (
              <tr key={c.id} style={rowStyle(i)}>
                <td style={td()}>
                  <span style={{ color: '#7BAED4', fontSize: 12 }}>
                    {new Date(c.created_at).toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </span>
                </td>
                <td style={td()}>
                  <div style={{ fontWeight: 600, color: 'white' }}>{c.caller_name ?? 'Unknown'}</div>
                  <div style={{ fontSize: 11, color: '#7BAED4', marginTop: 2 }}>{c.caller_phone}</div>
                </td>
                <td style={td()}>
                  <span style={{ color: '#7BAED4', fontSize: 12 }}>
                    {c.preferred_callback_time ? new Date(c.preferred_callback_time).toLocaleString('en-AU') : '—'}
                  </span>
                </td>
                <td style={td()}><span style={{ color: 'white' }}>{c.reason ?? '—'}</span></td>
                <td style={td()}>
                  {c.status === 'pending' ? (
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button onClick={() => updateStatus(c, 'completed')} disabled={busy === c.id} style={btn('#22C55E')}>
                        {busy === c.id ? '…' : 'Mark complete'}
                      </button>
                      <button onClick={() => updateStatus(c, 'cancelled')} disabled={busy === c.id} style={btn('#EF4444', true)}>Cancel</button>
                    </div>
                  ) : (
                    <span style={{ color: '#22C55E', fontSize: 11, fontWeight: 700 }}>✓ COMPLETED</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {toast && <div style={toastStyle}>{toast}</div>}
    </div>
  )
}

function tabBtn(active: boolean): React.CSSProperties {
  return {
    padding: '7px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700,
    background: active ? '#E8622A' : 'rgba(255,255,255,0.04)',
    border: `1px solid ${active ? '#E8622A' : 'rgba(255,255,255,0.08)'}`,
    color: active ? 'white' : '#7BAED4', cursor: 'pointer',
    fontFamily: 'Outfit, sans-serif',
  }
}
function btn(color: string, subtle = false): React.CSSProperties {
  return {
    padding: '6px 12px', borderRadius: 7, fontSize: 11, fontWeight: 700,
    background: subtle ? 'transparent' : color, border: `1px solid ${color}`,
    color: subtle ? color : 'white', cursor: 'pointer',
    fontFamily: 'Outfit, sans-serif',
  }
}
const tableWrap: React.CSSProperties = {
  background: '#0A1E38', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, overflow: 'auto',
}
const th = (): React.CSSProperties => ({
  textAlign: 'left' as const, padding: '11px 16px',
  fontSize: 11, fontWeight: 700, color: '#4A7FBB',
  textTransform: 'uppercase' as const, letterSpacing: '0.06em',
})
const td = (): React.CSSProperties => ({ padding: '12px 16px', fontSize: 13 })
const rowStyle = (i: number): React.CSSProperties => ({
  borderTop: '1px solid rgba(255,255,255,0.04)',
  background: i % 2 === 0 ? '#0A1E38' : '#071829',
})
const emptyCell = (): React.CSSProperties => ({
  padding: 32, textAlign: 'center' as const, fontSize: 13, color: '#7BAED4',
})
const toastStyle: React.CSSProperties = {
  position: 'fixed', bottom: 24, right: 24, zIndex: 100,
  padding: '12px 18px', background: '#0A1E38',
  border: '1px solid rgba(34,197,94,0.4)', borderRadius: 10,
  color: '#22C55E', fontSize: 13, fontWeight: 600,
  boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
}
