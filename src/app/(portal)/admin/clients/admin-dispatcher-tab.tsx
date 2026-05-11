'use client'

// Session 10 — Dispatcher tab inside the admin edit-client modal.
// Shows enable/disable toggle, counts of vehicles/drivers/active jobs,
// dispatch_config summary, and a link to the client's portal for full
// management.

import { useEffect, useState } from 'react'
import type { AdminBusiness } from './types'

interface DispatchSummary {
  dispatch_enabled: boolean
  dispatch_config: Record<string, unknown>
  plan: string
  industry: string | null
  counts: { vehicles: number; drivers: number; active_jobs: number }
}

export function AdminDispatcherTab({ business }: { business: AdminBusiness }) {
  const [data, setData] = useState<DispatchSummary | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/admin/businesses/${business.id}/dispatch`)
      .then(r => r.json())
      .then(d => { if (d.ok) setData({
        dispatch_enabled: d.dispatch_enabled,
        dispatch_config: d.dispatch_config ?? {},
        plan: d.plan ?? 'starter',
        industry: d.industry ?? null,
        counts: d.counts ?? { vehicles: 0, drivers: 0, active_jobs: 0 },
      }) })
  }, [business.id])

  if (!data) return <p style={{ fontSize: 12, color: '#7BAED4' }}>Loading…</p>

  async function toggleEnabled() {
    if (!data) return
    setBusy(true); setErr(null)
    try {
      const res = await fetch(`/api/admin/businesses/${business.id}/dispatch`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dispatch_enabled: !data.dispatch_enabled }),
      })
      const d = await res.json()
      if (!d.ok) throw new Error(d.error ?? 'Failed')
      setData(s => s ? { ...s, dispatch_enabled: !!d.dispatch_enabled } : s)
      setSavedAt(new Date().toLocaleTimeString('en-AU'))
    } catch (e) {
      setErr((e as Error).message)
    } finally { setBusy(false) }
  }

  const cfg = data.dispatch_config as Record<string, unknown>
  const jobTypes = Array.isArray(cfg.job_types) ? (cfg.job_types as string[]) : []
  const overbookingAction = String(cfg.overbooking_action ?? 'queue')
  const waitMinutes = typeof cfg.default_wait_minutes === 'number' ? cfg.default_wait_minutes : 45
  const autoWait = cfg.auto_wait_calculation !== false

  return (
    <div>
      <p style={{ fontSize: 12, color: '#7BAED4', margin: 0, marginBottom: 14 }}>
        Industry: <strong style={{ color: 'white' }}>{data.industry ?? '—'}</strong>{' · '}
        Plan: <strong style={{ color: 'white' }}>{data.plan}</strong>
      </p>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '12px 14px', borderRadius: 10, background: data.dispatch_enabled ? 'rgba(34,197,94,0.10)' : '#071829', border: `1px solid ${data.dispatch_enabled ? 'rgba(34,197,94,0.30)' : 'rgba(255,255,255,0.05)'}`, marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: data.dispatch_enabled ? '#22C55E' : '#7BAED4' }}>
            Dispatcher is {data.dispatch_enabled ? 'ENABLED' : 'disabled'}
          </div>
          <div style={{ fontSize: 11, color: '#7BAED4', marginTop: 3 }}>
            {data.industry === 'towing'
              ? 'Towing client — full dispatch board available in their portal.'
              : `Industry "${data.industry ?? 'unknown'}" — enabling this turns on dispatch features anyway.`}
          </div>
        </div>
        <button onClick={toggleEnabled} disabled={busy} style={{ padding: '8px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700, background: data.dispatch_enabled ? '#EF4444' : '#22C55E', border: 'none', color: 'white', cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>
          {busy ? '…' : data.dispatch_enabled ? 'Disable' : 'Enable'}
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 14 }}>
        <Stat label="Vehicles" value={data.counts.vehicles} accent="#4A9FE8" />
        <Stat label="Drivers" value={data.counts.drivers} accent="#E8622A" />
        <Stat label="Active jobs" value={data.counts.active_jobs} accent="#22C55E" />
      </div>

      <div style={{ padding: 14, borderRadius: 9, background: '#071829', border: '1px solid rgba(255,255,255,0.05)', marginBottom: 14 }}>
        <div style={{ fontSize: 10, fontWeight: 800, color: '#7BAED4', textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: 8 }}>Config summary</div>
        <Row label="Job types">{jobTypes.length === 0 ? '— (all)' : jobTypes.length}</Row>
        <Row label="Overbooking action">{overbookingAction}</Row>
        <Row label="Default wait">{waitMinutes} min</Row>
        <Row label="Auto-calculate wait">{autoWait ? 'yes' : 'no'}</Row>
      </div>

      <p style={{ fontSize: 12, color: '#7BAED4', margin: 0 }}>
        Vehicle, driver, and shift management lives in the client's portal at <code>/dispatch</code>.
        Impersonate the client from the Clients tab to make changes on their behalf.
      </p>

      {err && <div style={{ marginTop: 10, padding: '8px 12px', background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.35)', borderRadius: 8, color: '#FCA5A5', fontSize: 12 }}>{err}</div>}
      {savedAt && <p style={{ fontSize: 11, color: '#22C55E', marginTop: 8 }}>Saved {savedAt}</p>}
    </div>
  )
}

function Stat({ label, value, accent }: { label: string; value: number; accent: string }) {
  return (
    <div style={{ padding: 10, background: '#071829', borderRadius: 8, border: '1px solid rgba(255,255,255,0.04)' }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: '#7BAED4', textTransform: 'uppercase' as const, letterSpacing: '0.06em' }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color: accent, marginTop: 4 }}>{value}</div>
    </div>
  )
}
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 12 }}>
      <span style={{ color: '#7BAED4' }}>{label}</span>
      <span style={{ color: 'white', fontWeight: 600 }}>{children}</span>
    </div>
  )
}
