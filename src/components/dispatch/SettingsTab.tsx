'use client'

import { useEffect, useState } from 'react'

interface Settings {
  dispatch_enabled: boolean
  dispatch_response_timeout_mins: number
  customer_sms_on_accept: boolean
  customer_sms_on_enroute: boolean
  customer_sms_on_complete: boolean
}

export function SettingsTab({ onChanged }: { onChanged?: () => void } = {}) {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/dispatch/settings')
      .then(r => r.json())
      .then(d => { if (d.ok) setSettings(d.settings) })
  }, [])

  async function patch(update: Partial<Settings>) {
    if (!settings) return
    const prev = settings
    setSettings({ ...settings, ...update })
    setSaving(true)
    const res = await fetch('/api/dispatch/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(update),
    })
    const data = await res.json()
    setSaving(false)
    if (data.ok) {
      setSettings(data.settings)
      setSavedAt(new Date().toLocaleTimeString('en-AU'))
      onChanged?.()
    } else {
      setSettings(prev)
      alert(data.error ?? 'Save failed')
    }
  }

  if (!settings) return <div style={{ color: '#94a3b8', padding: 20 }}>Loading settings…</div>

  return (
    <div style={{ maxWidth: 600, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Toggle
        label="Enable Dispatcher"
        description="Turn the dispatch system on for this business."
        checked={settings.dispatch_enabled}
        onChange={v => patch({ dispatch_enabled: v })}
      />

      <div style={card}>
        <div style={{ fontSize: 14, fontWeight: 600 }}>Response timeout</div>
        <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>
          How many minutes a driver has to accept before the job auto-reassigns.
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 12 }}>
          <input
            type="range"
            min={5}
            max={60}
            step={1}
            value={settings.dispatch_response_timeout_mins}
            onChange={e => patch({ dispatch_response_timeout_mins: parseInt(e.target.value, 10) })}
            style={{ flex: 1, accentColor: '#E8622A' }}
          />
          <span style={{ fontWeight: 700, color: '#F2F6FB', minWidth: 56, textAlign: 'right' }}>
            {settings.dispatch_response_timeout_mins} min
          </span>
        </div>
      </div>

      <Toggle
        label="Customer SMS on driver acceptance"
        description="When a driver accepts a job, text the customer their ETA."
        checked={settings.customer_sms_on_accept}
        onChange={v => patch({ customer_sms_on_accept: v })}
      />
      <Toggle
        label="Customer SMS on en route"
        description="When the driver leaves for pickup, text the customer."
        checked={settings.customer_sms_on_enroute}
        onChange={v => patch({ customer_sms_on_enroute: v })}
      />
      <Toggle
        label="Customer SMS on job complete"
        description="When the job is complete, text the customer a thank-you."
        checked={settings.customer_sms_on_complete}
        onChange={v => patch({ customer_sms_on_complete: v })}
      />

      <div style={{ fontSize: 11, color: '#94a3b8' }}>
        {saving ? 'Saving…' : savedAt ? `Saved at ${savedAt}` : ''}
      </div>
    </div>
  )
}

function Toggle({ label, description, checked, onChange }: {
  label: string; description: string; checked: boolean; onChange: (v: boolean) => void
}) {
  return (
    <label style={{ ...card, display: 'flex', alignItems: 'center', gap: 14, cursor: 'pointer' }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 14, fontWeight: 600 }}>{label}</div>
        <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>{description}</div>
      </div>
      <span style={{
        width: 44, height: 24, borderRadius: 999,
        background: checked ? '#22C55E' : 'rgba(255,255,255,0.18)',
        position: 'relative',
        transition: 'background 150ms',
        flexShrink: 0,
      }}>
        <span style={{
          position: 'absolute', top: 2, left: checked ? 22 : 2,
          width: 20, height: 20, borderRadius: '50%', background: '#fff',
          transition: 'left 150ms',
        }} />
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={e => onChange(e.target.checked)}
        style={{ display: 'none' }}
      />
    </label>
  )
}

const card: React.CSSProperties = {
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 10,
  padding: 16,
}
