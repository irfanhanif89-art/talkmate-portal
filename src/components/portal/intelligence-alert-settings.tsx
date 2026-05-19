'use client'

import { useEffect, useState } from 'react'

// Session 18 — Call Intelligence alert routing.
// Self-fetches from /api/portal/settings/intelligence-alerts.
// Drops into the Settings page Notifications tab.

interface Config {
  alert_owner: boolean
  alert_dispatcher: boolean
  owner_number: string
  dispatcher_number: string
  alert_on_critical: boolean
  alert_on_warm_lead: boolean
  alert_on_missed_lead: boolean
  alert_on_dropped_call: boolean
  alert_on_vip_failure: boolean
  alert_on_agent_promise: boolean
}

const DEFAULTS: Config = {
  alert_owner: true,
  alert_dispatcher: false,
  owner_number: '',
  dispatcher_number: '',
  alert_on_critical: true,
  alert_on_warm_lead: true,
  alert_on_missed_lead: true,
  alert_on_dropped_call: false,
  alert_on_vip_failure: true,
  alert_on_agent_promise: true,
}

const ALERT_TYPE_ROWS: Array<{ key: keyof Config; label: string; sub: string }> = [
  { key: 'alert_on_warm_lead',    label: 'Warm leads',                sub: 'Caller showed interest but did not book' },
  { key: 'alert_on_missed_lead',  label: 'Missed leads',              sub: 'Pricing enquiry with no booking' },
  { key: 'alert_on_vip_failure',  label: 'VIP caller not transferred',sub: 'VIP was handled by agent instead of transferred' },
  { key: 'alert_on_agent_promise',label: 'Agent promised follow-up',  sub: 'Callback or quote promised that needs you to act' },
  { key: 'alert_on_dropped_call', label: 'Dropped calls',             sub: 'Call ended mid-conversation without a resolution' },
]

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" onClick={() => onChange(!checked)}
      style={{ width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer', padding: 2, background: checked ? '#E8622A' : 'rgba(255,255,255,0.15)', position: 'relative', flexShrink: 0, transition: 'background 0.2s' }}>
      <div style={{ width: 20, height: 20, borderRadius: 10, background: 'white', position: 'absolute', top: 2, left: checked ? 22 : 2, transition: 'left 0.2s' }} />
    </button>
  )
}

interface Props {
  // When set, the component PATCHes the admin route for this client_id
  // instead of the owner's own /api/portal route. Used in the admin
  // impersonation view.
  adminClientId?: string
}

export default function IntelligenceAlertSettings({ adminClientId }: Props) {
  const [cfg, setCfg] = useState<Config>(DEFAULTS)
  const [loaded, setLoaded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  const getUrl = adminClientId
    ? `/api/admin/businesses/${adminClientId}/intelligence-alerts`
    : '/api/portal/settings/intelligence-alerts'

  useEffect(() => {
    let cancelled = false
    fetch(getUrl)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (cancelled) return
        if (data?.intelligence_alert_config) {
          setCfg({ ...DEFAULTS, ...data.intelligence_alert_config })
        }
        setLoaded(true)
      })
      .catch(() => { if (!cancelled) setLoaded(true) })
    return () => { cancelled = true }
  }, [getUrl])

  async function save() {
    setSaving(true)
    setMsg('')
    try {
      const res = await fetch(getUrl, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ intelligence_alert_config: cfg }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? 'Save failed')
      }
      setMsg('Saved ✅')
    } catch (e) {
      setMsg((e as Error).message + ' ❌')
    } finally {
      setSaving(false)
      setTimeout(() => setMsg(''), 3000)
    }
  }

  function patch<K extends keyof Config>(key: K, value: Config[K]) {
    setCfg(c => ({ ...c, [key]: value }))
  }

  if (!loaded) {
    return (
      <div style={{ background: '#0A1E38', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 16, padding: 28, marginTop: 16 }}>
        <p style={{ fontSize: 13, color: '#4A7FBB' }}>Loading alert settings…</p>
      </div>
    )
  }

  const showAlertTypes = cfg.alert_owner || cfg.alert_dispatcher

  return (
    <div style={{ background: '#0A1E38', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 16, padding: 28, marginTop: 16 }}>
      <h3 style={{ fontSize: 16, fontWeight: 700, color: 'white', marginBottom: 4 }}>Call Intelligence Alerts</h3>
      <p style={{ fontSize: 13, color: '#4A7FBB', marginBottom: 20 }}>
        TalkMate scores every call and only texts you when something needs your attention.
      </p>

      <div style={{ maxWidth: 560 }}>
        {/* Owner */}
        <div style={cardStyle}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: cfg.alert_owner ? 12 : 0 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'white' }}>Alert me when there is an issue</div>
              <div style={{ fontSize: 12, color: '#7BAED4', marginTop: 3 }}>SMS sent to your number</div>
            </div>
            <Toggle checked={cfg.alert_owner} onChange={v => patch('alert_owner', v)} />
          </div>
          {cfg.alert_owner && (
            <div>
              <label style={lblStyle}>My number for alerts</label>
              <input type="tel" value={cfg.owner_number} onChange={e => patch('owner_number', e.target.value)}
                placeholder="+61 4XX XXX XXX" style={inpStyle} />
            </div>
          )}
        </div>

        {/* Dispatcher */}
        <div style={cardStyle}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: cfg.alert_dispatcher ? 12 : 0 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'white' }}>Also alert my dispatcher</div>
              <div style={{ fontSize: 12, color: '#7BAED4', marginTop: 3 }}>Send the same alert to a second number</div>
            </div>
            <Toggle checked={cfg.alert_dispatcher} onChange={v => patch('alert_dispatcher', v)} />
          </div>
          {cfg.alert_dispatcher && (
            <div>
              <label style={lblStyle}>Dispatcher&apos;s number</label>
              <input type="tel" value={cfg.dispatcher_number} onChange={e => patch('dispatcher_number', e.target.value)}
                placeholder="+61 4XX XXX XXX" style={inpStyle} />
            </div>
          )}
        </div>

        {/* Alert types */}
        {showAlertTypes && (
          <div style={cardStyle}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#4A7FBB', marginBottom: 14 }}>What to alert on</div>
            {ALERT_TYPE_ROWS.map((row, i) => (
              <div key={row.key} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '12px 0', borderBottom: i < ALERT_TYPE_ROWS.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
              }}>
                <div style={{ paddingRight: 12 }}>
                  <div style={{ fontSize: 14, color: 'white' }}>{row.label}</div>
                  <div style={{ fontSize: 12, color: '#7BAED4', marginTop: 2 }}>{row.sub}</div>
                </div>
                <Toggle
                  checked={!!cfg[row.key]}
                  onChange={v => patch(row.key, v as never)}
                />
              </div>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={save} disabled={saving}
            style={{ background: '#E8622A', color: 'white', border: 'none', padding: '12px 28px', borderRadius: 10, fontFamily: 'Outfit,sans-serif', fontWeight: 600, fontSize: 15, cursor: saving ? 'wait' : 'pointer', opacity: saving ? 0.7 : 1 }}>
            {saving ? 'Saving…' : 'Save Alert Settings'}
          </button>
          {msg && <span style={{ fontSize: 13, color: msg.includes('✅') ? '#22C55E' : '#EF4444' }}>{msg}</span>}
        </div>
      </div>
    </div>
  )
}

const cardStyle: React.CSSProperties = {
  background: '#071829',
  borderRadius: 14,
  padding: 16,
  marginBottom: 12,
}

const lblStyle: React.CSSProperties = {
  fontSize: 12,
  color: '#4A7FBB',
  fontWeight: 600,
  display: 'block',
  marginBottom: 6,
}

const inpStyle: React.CSSProperties = {
  background: '#071829',
  border: '1px solid rgba(255,255,255,0.1)',
  color: 'white',
  borderRadius: 10,
  padding: '11px 14px',
  width: '100%',
  fontFamily: 'Outfit,sans-serif',
  fontSize: 14,
  outline: 'none',
}
