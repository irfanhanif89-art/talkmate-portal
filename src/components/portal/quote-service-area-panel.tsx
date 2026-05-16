'use client'

import { useEffect, useState } from 'react'
import { silentSyncAgent } from '@/components/portal/sync-agent-button'

// Session 14 — Service Area + Quote settings panel.
// Renders for both the client portal (/settings/service-area) and the
// admin portal (/admin/clients/[clientId]/portal/settings/service-area).
// When `adminClientId` is set, calls go through the admin endpoint
// scoped to that client; otherwise the regular /api/portal endpoint.

type Mode = 'radius' | 'postcodes'

export interface QuoteConfig {
  enabled?: boolean
  quote_validity_minutes?: number
  after_hours_surcharge_percent?: number
  minimum_job_fee?: number
  poa_threshold_km?: number
  currency?: string
}

interface PanelState {
  service_area_mode: Mode
  service_area_radius: number
  service_area_postcodes: string[]
  quote_config: QuoteConfig
  business_address: string | null
  plan: string
}

interface Props {
  adminClientId?: string | null
}

const inp: React.CSSProperties = {
  background: '#071829',
  border: '1px solid rgba(255,255,255,0.1)',
  color: 'white',
  borderRadius: 10,
  padding: '11px 14px',
  width: '100%',
  fontFamily: 'Outfit, sans-serif',
  fontSize: 14,
  outline: 'none',
}
const lbl: React.CSSProperties = {
  fontSize: 12,
  color: '#4A7FBB',
  fontWeight: 600,
  display: 'block',
  marginBottom: 6,
}
const card: React.CSSProperties = {
  background: '#0A1E38',
  border: '1px solid rgba(255,255,255,0.06)',
  borderRadius: 16,
  padding: 24,
  marginBottom: 16,
}

const VALIDITY_OPTIONS: Array<{ minutes: number; label: string }> = [
  { minutes: 60, label: '1 hour' },
  { minutes: 120, label: '2 hours' },
  { minutes: 240, label: '4 hours' },
  { minutes: 480, label: '8 hours' },
]

function getUrl(adminClientId: string | null | undefined): string {
  if (adminClientId) return `/api/admin/businesses/${encodeURIComponent(adminClientId)}/quote-config`
  return '/api/portal/quote-config'
}

function isPostcode(s: string): boolean {
  return /^\d{4}$/.test(s.trim())
}

export default function QuoteServiceAreaPanel({ adminClientId }: Props) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [postcodeDraft, setPostcodeDraft] = useState('')
  const [state, setState] = useState<PanelState>({
    service_area_mode: 'radius',
    service_area_radius: 100,
    service_area_postcodes: [],
    quote_config: { enabled: true, quote_validity_minutes: 120, after_hours_surcharge_percent: 0, minimum_job_fee: 0, currency: 'AUD' },
    business_address: null,
    plan: 'starter',
  })

  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(getUrl(adminClientId))
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error ?? 'Could not load service area settings')
      setState({
        service_area_mode: (data.service_area_mode ?? 'radius') as Mode,
        service_area_radius: data.service_area_radius ?? 100,
        service_area_postcodes: Array.isArray(data.service_area_postcodes) ? data.service_area_postcodes.map((s: unknown) => String(s)) : [],
        quote_config: (data.quote_config ?? {}) as QuoteConfig,
        business_address: data.business_address ?? null,
        plan: data.plan ?? 'starter',
      })
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  function addPostcode() {
    const raw = postcodeDraft.trim()
    if (!raw) return
    if (state.service_area_postcodes.includes(raw)) {
      setPostcodeDraft('')
      return
    }
    if (state.service_area_postcodes.length >= 200) {
      setError('Maximum 200 entries')
      return
    }
    setState(s => ({ ...s, service_area_postcodes: [...s.service_area_postcodes, raw] }))
    setPostcodeDraft('')
  }

  function removePostcode(value: string) {
    setState(s => ({ ...s, service_area_postcodes: s.service_area_postcodes.filter(p => p !== value) }))
  }

  async function save() {
    if (saving) return
    setSaving(true)
    setError(null)
    setSuccess(null)
    try {
      const res = await fetch(getUrl(adminClientId), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          service_area_mode: state.service_area_mode,
          service_area_radius: state.service_area_radius,
          service_area_postcodes: state.service_area_postcodes,
          quote_config: state.quote_config,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error ?? 'Save failed')
      setSuccess('Service area saved')
      // Fire silent sync so the agent picks up the changes immediately.
      void silentSyncAgent(adminClientId ?? null)
      setTimeout(() => setSuccess(null), 3000)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  // ---- locked starter view ------------------------------------------
  if (!loading && state.plan === 'starter') {
    return (
      <div style={{ padding: 32, maxWidth: 760, margin: '0 auto' }}>
        <h1 style={{ fontSize: '1.4rem', fontWeight: 800, color: 'white', marginBottom: 6 }}>Service Area</h1>
        <p style={{ fontSize: 13, color: '#7BAED4', marginBottom: 24 }}>Configure where your AI agent will quote jobs.</p>
        <div style={{ ...card, border: '1px solid rgba(232,98,42,0.25)', background: 'rgba(232,98,42,0.04)', textAlign: 'center' as const, padding: '36px 24px' }}>
          <div style={{ fontSize: 36, marginBottom: 8 }}>🔒</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'white', marginBottom: 6 }}>
            Service area configuration is available on Growth and Pro plans.
          </div>
          <div style={{ fontSize: 13, color: '#7BAED4', marginBottom: 18 }}>
            Upgrade to unlock distance-based quoting, postcode service area filters, and after-hours surcharges.
          </div>
          {!adminClientId && (
            <a href="/billing" style={{ display: 'inline-block', background: '#E8622A', color: 'white', padding: '11px 22px', borderRadius: 10, fontWeight: 700, textDecoration: 'none', fontSize: 14 }}>Upgrade plan</a>
          )}
        </div>
      </div>
    )
  }

  if (loading) {
    return <div style={{ padding: 32, color: '#7BAED4' }}>Loading service area…</div>
  }

  const mode = state.service_area_mode
  const radius = state.service_area_radius
  const postcodes = state.service_area_postcodes
  const cfg = state.quote_config

  return (
    <div style={{ padding: 32, maxWidth: 760, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 800, color: 'white', marginBottom: 4 }}>Service Area</h1>
          <p style={{ fontSize: 13, color: '#7BAED4', margin: 0 }}>Configure where your AI agent will quote jobs.</p>
        </div>
        {success && <span style={{ fontSize: 13, color: '#22c55e', fontWeight: 600 }}>{success}</span>}
        {error && <span style={{ fontSize: 13, color: '#ef4444', fontWeight: 600 }}>{error}</span>}
      </div>

      {/* Mode toggle */}
      <div style={card}>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'white', marginBottom: 4 }}>Service area mode</div>
        <div style={{ fontSize: 12, color: '#7BAED4', marginBottom: 14 }}>Choose how your agent decides whether a job falls inside your area.</div>
        <div style={{ display: 'flex', gap: 10 }}>
          {(['radius', 'postcodes'] as Mode[]).map(m => {
            const active = mode === m
            return (
              <button
                key={m}
                type="button"
                onClick={() => setState(s => ({ ...s, service_area_mode: m }))}
                style={{
                  flex: 1, padding: '14px 16px', borderRadius: 10,
                  border: `1.5px solid ${active ? '#E8622A' : 'rgba(255,255,255,0.1)'}`,
                  background: active ? 'rgba(232,98,42,0.1)' : '#071829',
                  color: active ? '#E8622A' : '#C8D8EA',
                  cursor: 'pointer', fontWeight: 700, fontSize: 13,
                  fontFamily: 'Outfit, sans-serif',
                  textAlign: 'left' as const,
                }}
              >
                <div style={{ fontSize: 14, marginBottom: 4 }}>{m === 'radius' ? 'Radius' : 'Postcodes / Suburbs'}</div>
                <div style={{ fontSize: 11, fontWeight: 500, color: active ? '#E8622A' : '#7BAED4', opacity: 0.85 }}>
                  {m === 'radius' ? 'Distance from your business address' : 'Specific postcodes or suburb names'}
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* Radius mode */}
      {mode === 'radius' && (
        <div style={card}>
          <label style={lbl}>Service radius (km)</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <input
              type="range"
              min={10} max={500} step={5}
              value={radius}
              onChange={e => setState(s => ({ ...s, service_area_radius: Number(e.target.value) }))}
              style={{ flex: 1 }}
            />
            <input
              type="number"
              min={10} max={500}
              value={radius}
              onChange={e => {
                const v = Number(e.target.value)
                if (!Number.isFinite(v)) return
                setState(s => ({ ...s, service_area_radius: Math.max(10, Math.min(500, Math.round(v))) }))
              }}
              style={{ ...inp, width: 100, padding: '8px 10px', textAlign: 'right' as const }}
            />
            <span style={{ fontSize: 13, color: '#7BAED4' }}>km</span>
          </div>
          <p style={{ fontSize: 12, color: '#7BAED4', marginTop: 12, marginBottom: 0 }}>
            Your agents will only quote jobs within <strong style={{ color: 'white' }}>{radius}km</strong> of your business address.
          </p>
          {state.business_address && (
            <div style={{ marginTop: 14, padding: '10px 12px', background: '#071829', border: '1px dashed rgba(255,255,255,0.08)', borderRadius: 8 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#4A7FBB', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Centre point</div>
              <div style={{ fontSize: 13, color: 'white' }}>{state.business_address}</div>
            </div>
          )}
        </div>
      )}

      {/* Postcodes mode */}
      {mode === 'postcodes' && (
        <div style={card}>
          <label style={lbl}>Add postcode or suburb</label>
          <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
            <input
              type="text"
              value={postcodeDraft}
              onChange={e => setPostcodeDraft(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addPostcode() } }}
              placeholder="e.g. 3061, Campbellfield, 3000, Melbourne CBD"
              style={{ ...inp, flex: 1 }}
            />
            <button
              type="button"
              onClick={addPostcode}
              style={{ background: '#E8622A', color: 'white', border: 'none', borderRadius: 10, padding: '0 18px', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}
            >Add</button>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 8, marginBottom: 10 }}>
            {postcodes.length === 0 && (
              <div style={{ fontSize: 12, color: '#7BAED4', padding: '8px 0' }}>No postcodes added yet. Add at least one or switch to Radius mode.</div>
            )}
            {postcodes.map(p => (
              <span key={p} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 10px', background: isPostcode(p) ? 'rgba(74,159,232,0.15)' : 'rgba(232,98,42,0.15)', color: isPostcode(p) ? '#4A9FE8' : '#E8622A', borderRadius: 99, fontSize: 12, fontWeight: 600 }}>
                {p}
                <button onClick={() => removePostcode(p)} aria-label={`Remove ${p}`} style={{ background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: 14, padding: 0, lineHeight: 1 }}>×</button>
              </span>
            ))}
          </div>
          <p style={{ fontSize: 12, color: '#7BAED4', marginTop: 6, marginBottom: 0 }}>
            Your agent will only quote jobs in these areas. Accepts 4-digit postcodes and suburb names.
          </p>
        </div>
      )}

      {/* Quote config */}
      <div style={card}>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'white', marginBottom: 14 }}>Quote settings</div>

        <div style={{ marginBottom: 16 }}>
          <label style={lbl}>Quote validity</label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' as const }}>
            {VALIDITY_OPTIONS.map(opt => {
              const active = (cfg.quote_validity_minutes ?? 120) === opt.minutes
              return (
                <button
                  key={opt.minutes}
                  type="button"
                  onClick={() => setState(s => ({ ...s, quote_config: { ...s.quote_config, quote_validity_minutes: opt.minutes } }))}
                  style={{
                    padding: '8px 16px', borderRadius: 8,
                    border: `1.5px solid ${active ? '#E8622A' : 'rgba(255,255,255,0.1)'}`,
                    background: active ? 'rgba(232,98,42,0.12)' : 'transparent',
                    color: active ? '#E8622A' : '#C8D8EA',
                    fontSize: 13, fontWeight: active ? 700 : 500,
                    cursor: 'pointer', fontFamily: 'Outfit, sans-serif',
                  }}
                >{opt.label}</button>
              )
            })}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 4 }}>
          <div>
            <label style={lbl}>After hours surcharge (%)</label>
            <input
              type="number"
              min={0} max={100} step={1}
              value={cfg.after_hours_surcharge_percent ?? 0}
              onChange={e => {
                const v = Number(e.target.value)
                if (!Number.isFinite(v)) return
                setState(s => ({ ...s, quote_config: { ...s.quote_config, after_hours_surcharge_percent: Math.max(0, Math.min(100, v)) } }))
              }}
              style={inp}
            />
            <p style={{ fontSize: 11, color: '#7BAED4', marginTop: 6, marginBottom: 0 }}>
              Applied to quotes outside your operating hours.
            </p>
          </div>
          <div>
            <label style={lbl}>Minimum job fee ($)</label>
            <input
              type="number"
              min={0} step={1}
              value={cfg.minimum_job_fee ?? 0}
              onChange={e => {
                const v = Number(e.target.value)
                if (!Number.isFinite(v)) return
                setState(s => ({ ...s, quote_config: { ...s.quote_config, minimum_job_fee: Math.max(0, v) } }))
              }}
              style={inp}
            />
            <p style={{ fontSize: 11, color: '#7BAED4', marginTop: 6, marginBottom: 0 }}>
              Quotes below this amount are bumped up to the minimum.
            </p>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <button
          onClick={save}
          disabled={saving}
          style={{
            background: saving ? 'rgba(232,98,42,0.5)' : '#E8622A',
            color: 'white', border: 'none', padding: '12px 28px', borderRadius: 10,
            fontFamily: 'Outfit, sans-serif', fontWeight: 700, fontSize: 14,
            cursor: saving ? 'not-allowed' : 'pointer',
          }}
        >{saving ? 'Saving…' : 'Save'}</button>
        <span style={{ fontSize: 12, color: '#7BAED4' }}>Changes sync to your AI agent automatically.</span>
      </div>
    </div>
  )
}
