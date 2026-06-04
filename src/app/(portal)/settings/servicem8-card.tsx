'use client'

// ServiceM8 integration card — Session 3B. Self-contained: fetches its own
// status on mount and manages connect / disconnect / default-status. Lives in
// the Settings > Integrations tab. Works for the owner (cookie auth); pass
// adminClientId for the admin-as-client view.

import { useCallback, useEffect, useState } from 'react'

const ORANGE = '#E8622A'
const cardStyle: React.CSSProperties = {
  background: '#071829', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14,
  padding: 24, marginBottom: 16,
}
const lbl: React.CSSProperties = { fontSize: 12, color: '#4A7FBB', fontWeight: 600, display: 'block', marginBottom: 6 }
const inp: React.CSSProperties = {
  background: '#071829', border: '1px solid rgba(255,255,255,0.1)', color: 'white', borderRadius: 10,
  padding: '11px 14px', width: '100%', fontFamily: 'Outfit,sans-serif', fontSize: 14,
}
const STATUSES = ['Quote', 'Work Order', 'In Progress']

function withAdmin(path: string, adminClientId?: string | null): string {
  if (!adminClientId) return path
  const sep = path.includes('?') ? '&' : '?'
  return `${path}${sep}adminClientId=${encodeURIComponent(adminClientId)}`
}

export default function ServiceM8Card({ adminClientId }: { adminClientId?: string | null }) {
  const [loading, setLoading] = useState(true)
  const [enabled, setEnabled] = useState(false)
  const [defaultStatus, setDefaultStatus] = useState('Quote')
  const [jobsThisMonth, setJobsThisMonth] = useState(0)
  const [apiKey, setApiKey] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [showHelp, setShowHelp] = useState(false)

  const loadStatus = useCallback(async () => {
    try {
      const res = await fetch(withAdmin('/api/servicem8/status', adminClientId))
      const json = await res.json()
      if (json.ok) {
        setEnabled(json.enabled)
        setDefaultStatus(json.defaultStatus ?? 'Quote')
        setJobsThisMonth(json.jobsThisMonth ?? 0)
      }
    } catch { /* ignore */ }
    setLoading(false)
  }, [adminClientId])

  useEffect(() => { loadStatus() }, [loadStatus])

  async function connect() {
    setBusy(true); setErr(null); setMsg(null)
    try {
      const res = await fetch(withAdmin('/api/servicem8/connect', adminClientId), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: apiKey.trim() }),
      })
      const json = await res.json()
      if (!res.ok || !json.ok) { setErr(json.error || 'Could not connect.'); setBusy(false); return }
      setApiKey('')
      setMsg(json.companyName ? `Connected to ${json.companyName}` : 'ServiceM8 connected')
      await loadStatus()
    } catch { setErr('Network error. Try again.') }
    setBusy(false)
  }

  async function disconnect() {
    setBusy(true); setErr(null); setMsg(null)
    try {
      await fetch(withAdmin('/api/servicem8/disconnect', adminClientId), { method: 'POST' })
      await loadStatus()
      setMsg('Disconnected')
    } catch { setErr('Network error. Try again.') }
    setBusy(false)
  }

  async function saveStatus(next: string) {
    setDefaultStatus(next)
    try {
      await fetch(withAdmin('/api/servicem8/status', adminClientId), {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ defaultStatus: next }),
      })
    } catch { /* ignore */ }
  }

  if (loading) {
    return <div style={cardStyle}><div style={{ color: '#4A7FBB', fontSize: 14 }}>Loading ServiceM8...</div></div>
  }

  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 4 }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, color: 'white', margin: 0 }}>ServiceM8</h3>
        {enabled && (
          <span style={{
            fontSize: 12, fontWeight: 700, color: '#22C55E', background: 'rgba(34,197,94,0.12)',
            padding: '4px 10px', borderRadius: 999,
          }}>Connected</span>
        )}
      </div>
      <p style={{ fontSize: 13, color: '#4A7FBB', marginTop: 0, marginBottom: 20 }}>
        When TalkMate books a job, it automatically creates the job in ServiceM8. No double entry.
      </p>

      {!enabled ? (
        <>
          <div style={{ marginBottom: 12 }}>
            <label style={lbl}>ServiceM8 API key</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Paste your API key"
                style={inp}
              />
              <button
                type="button"
                onClick={() => setShowKey((s) => !s)}
                style={{
                  background: 'transparent', border: '1px solid rgba(255,255,255,0.15)', color: '#C8D8EA',
                  borderRadius: 10, padding: '0 14px', cursor: 'pointer', fontSize: 13, fontFamily: 'Outfit,sans-serif',
                }}
              >{showKey ? 'Hide' : 'Show'}</button>
            </div>
          </div>
          <button
            type="button"
            disabled={busy || !apiKey.trim()}
            onClick={connect}
            style={{
              background: ORANGE, color: 'white', border: 'none', padding: '12px 28px', borderRadius: 10,
              fontFamily: 'Outfit,sans-serif', fontWeight: 600, fontSize: 15,
              cursor: busy || !apiKey.trim() ? 'default' : 'pointer', opacity: busy || !apiKey.trim() ? 0.6 : 1,
            }}
          >{busy ? 'Connecting...' : 'Connect'}</button>

          <button
            type="button"
            onClick={() => setShowHelp((s) => !s)}
            style={{
              display: 'block', marginTop: 14, background: 'none', border: 'none', color: '#4A9FE8',
              cursor: 'pointer', fontSize: 13, fontFamily: 'Outfit,sans-serif', padding: 0,
            }}
          >Where do I find my API key?</button>
          {showHelp && (
            <div style={{ marginTop: 10 }}>
              {[
                'Log into your ServiceM8 account',
                'Go to Settings then API Keys',
                'Create a new key with Jobs read and write permission',
                'Copy and paste it here',
              ].map((step, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
                  <span style={{ color: ORANGE, fontWeight: 700, flexShrink: 0 }}>{i + 1}.</span>
                  <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: 14 }}>{step}</span>
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          <div style={{ marginBottom: 16 }}>
            <label style={lbl}>Default job status</label>
            <select value={defaultStatus} onChange={(e) => saveStatus(e.target.value)} style={{ ...inp, cursor: 'pointer' }}>
              {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div style={{ fontSize: 13, color: '#C8D8EA', marginBottom: 16 }}>
            Jobs pushed this month: <strong style={{ color: 'white' }}>{jobsThisMonth}</strong>
          </div>
          <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
            <a href="/settings/servicem8-log" style={{ color: '#4A9FE8', fontSize: 13, textDecoration: 'none' }}>View push log</a>
            <button
              type="button"
              disabled={busy}
              onClick={disconnect}
              style={{ background: 'none', border: 'none', color: '#EF4444', cursor: 'pointer', fontSize: 13, fontFamily: 'Outfit,sans-serif', padding: 0 }}
            >Disconnect</button>
          </div>
        </>
      )}

      {msg && <div style={{ marginTop: 12, fontSize: 13, color: '#22C55E' }}>{msg}</div>}
      {err && <div style={{ marginTop: 12, fontSize: 13, color: '#EF4444' }}>{err}</div>}
    </div>
  )
}
