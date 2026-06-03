'use client'

// AI Email Responder card — Session 3C. Lives in Settings > Automation.
// Plan-gated (Growth+Pro), consent-gated, auto-send OFF by default.
// Self-contained: fetches its own config and saves via /api/email/config.

import { useCallback, useEffect, useState } from 'react'

const ORANGE = '#E8622A'
const cardStyle: React.CSSProperties = {
  background: '#071829', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: 24, marginBottom: 16,
}
const lbl: React.CSSProperties = { fontSize: 12, color: '#4A7FBB', fontWeight: 600, display: 'block', marginBottom: 6 }
const inp: React.CSSProperties = {
  background: '#071829', border: '1px solid rgba(255,255,255,0.1)', color: 'white', borderRadius: 10,
  padding: '11px 14px', width: '100%', fontFamily: 'Outfit,sans-serif', fontSize: 14,
}

function Toggle({ checked, disabled, onChange }: { checked: boolean; disabled?: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" disabled={disabled} onClick={() => !disabled && onChange(!checked)}
      style={{
        width: 44, height: 24, borderRadius: 12, border: 'none', cursor: disabled ? 'default' : 'pointer', padding: 2,
        background: checked ? ORANGE : 'rgba(255,255,255,0.15)', position: 'relative', transition: 'background 0.2s', opacity: disabled ? 0.5 : 1,
      }}>
      <div style={{ width: 20, height: 20, borderRadius: 10, background: 'white', position: 'absolute', top: 2, left: checked ? 22 : 2, transition: 'left 0.2s' }} />
    </button>
  )
}

function withAdmin(path: string, adminClientId?: string | null): string {
  if (!adminClientId) return path
  const sep = path.includes('?') ? '&' : '?'
  return `${path}${sep}adminClientId=${encodeURIComponent(adminClientId)}`
}

export default function EmailResponderCard({ adminClientId }: { adminClientId?: string | null }) {
  const [loading, setLoading] = useState(true)
  const [planAllowed, setPlanAllowed] = useState(true)
  const [enabled, setEnabled] = useState(false)
  const [address, setAddress] = useState<string | null>(null)
  const [fromName, setFromName] = useState('')
  const [autoSend, setAutoSend] = useState(false)
  const [consent, setConsent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await fetch(withAdmin('/api/email/config', adminClientId))
      const j = await res.json()
      if (j.ok) {
        setPlanAllowed(j.planAllowed); setEnabled(j.enabled); setAddress(j.inboundEmailAddress)
        setFromName(j.fromName ?? ''); setAutoSend(j.autoSend); setConsent(j.consent)
      }
    } catch { /* ignore */ }
    setLoading(false)
  }, [adminClientId])

  useEffect(() => { load() }, [load])

  async function patch(payload: Record<string, unknown>, successMsg?: string) {
    setBusy(true); setErr(null); setMsg(null)
    try {
      const res = await fetch(withAdmin('/api/email/config', adminClientId), {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      })
      const j = await res.json()
      if (!res.ok || !j.ok) { setErr(j.error || 'Could not save.'); setBusy(false); return false }
      if (j.inboundEmailAddress) setAddress(j.inboundEmailAddress)
      if (successMsg) setMsg(successMsg)
      setBusy(false)
      return true
    } catch { setErr('Network error.'); setBusy(false); return false }
  }

  if (loading) return <div style={cardStyle}><div style={{ color: '#4A7FBB', fontSize: 14 }}>Loading email responder...</div></div>

  if (!planAllowed) {
    return (
      <div style={cardStyle}>
        <h3 style={{ fontSize: 16, fontWeight: 700, color: 'white', margin: '0 0 4px' }}>AI Email Responder</h3>
        <p style={{ fontSize: 13, color: '#4A7FBB', marginTop: 0, marginBottom: 14 }}>
          Customers email your TalkMate address and AI drafts a reply from your knowledge base.
        </p>
        <div style={{ fontSize: 13, color: '#FBBF24', background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.25)', borderRadius: 10, padding: '10px 14px' }}>
          Available on Growth and Pro plans. <a href="/billing" style={{ color: '#4A9FE8' }}>Upgrade</a>
        </div>
      </div>
    )
  }

  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'white', marginBottom: 4 }}>AI Email Responder</div>
          <div style={{ fontSize: 12, color: '#7BAED4' }}>Customers email your TalkMate address. AI drafts a reply from your knowledge base.</div>
        </div>
        <Toggle checked={enabled} onChange={(v) => patch({ enabled: v }, v ? 'Enabled' : 'Disabled').then((ok) => ok && setEnabled(v))} />
      </div>

      {enabled && (
        <>
          {address && (
            <div style={{ marginBottom: 14 }}>
              <label style={lbl}>Your TalkMate email address</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input readOnly value={address} style={{ ...inp, color: '#C8D8EA' }} />
                <button type="button" onClick={() => { navigator.clipboard?.writeText(address); setCopied(true); setTimeout(() => setCopied(false), 1500) }}
                  style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.15)', color: '#C8D8EA', borderRadius: 10, padding: '0 14px', cursor: 'pointer', fontSize: 13 }}>
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
            </div>
          )}

          <div style={{ marginBottom: 14 }}>
            <label style={lbl}>From name for outbound emails</label>
            <input value={fromName} onChange={(e) => setFromName(e.target.value)} onBlur={() => patch({ fromName }, 'Saved')} placeholder="e.g. Glen, GM Towing" style={inp} />
          </div>

          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'white' }}>Send AI replies automatically</div>
              <div style={{ fontSize: 12, color: autoSend ? '#FBBF24' : '#7BAED4' }}>
                {autoSend ? 'On — replies send without review. Use with care.' : 'Off — replies wait for your approval (recommended).'}
              </div>
            </div>
            <Toggle checked={autoSend} disabled={!consent} onChange={(v) => patch({ autoSend: v }).then((ok) => ok && setAutoSend(v))} />
          </div>

          {!consent && (
            <div style={{ fontSize: 12, color: '#FBBF24', background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.25)', borderRadius: 10, padding: '10px 14px' }}>
              Awaiting consent confirmation. Your account manager will enable sending once you have confirmed TalkMate can email customers on your behalf.
            </div>
          )}
        </>
      )}

      {msg && <div style={{ marginTop: 12, fontSize: 13, color: '#22C55E' }}>{msg}</div>}
      {err && <div style={{ marginTop: 12, fontSize: 13, color: '#EF4444' }}>{err}</div>}
    </div>
  )
}
