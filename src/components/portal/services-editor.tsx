'use client'

// Reusable Services and Pricing editor.
//
// Drives the new businesses.services JSONB column. Used by:
//   - Admin Agent Builder tab on /admin/clients/[id] (admin mode)
//   - Client Settings → AI Voice Agent tab (client mode)
//
// Admin mode: edit names, prices, units, toggle, add custom, delete custom,
// pick trade_type for trades industry.
// Client mode: name+unit on template rows are read-only, custom rows fully
// editable, trade_type is read-only label.

import { useMemo, useState } from 'react'
import {
  Service,
  TRADE_TYPE_OPTIONS,
  getInitialServices,
  templateToServices,
  TRADE_TEMPLATES,
} from '@/lib/service-templates'

export type { Service } from '@/lib/service-templates'

export interface ServicesEditorProps {
  industry: string | null
  trade_type: string | null
  saved: Service[] | null | undefined
  mode: 'admin' | 'client'
  onChange: (next: { services: Service[]; trade_type: string | null }) => void
}

function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

const card: React.CSSProperties = {
  background: 'rgba(255,255,255,0.03)',
  border: '1px solid rgba(255,255,255,0.07)',
  borderRadius: 12,
  padding: '16px 18px',
}

const headerStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 700,
  color: 'white',
  marginBottom: 4,
}

const subStyle: React.CSSProperties = {
  fontSize: 12,
  color: '#4A7FBB',
  lineHeight: 1.55,
  marginTop: 0,
  marginBottom: 14,
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  background: '#071829',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 7,
  color: 'white',
  fontSize: 13,
  fontFamily: 'Outfit, sans-serif',
  outline: 'none',
  boxSizing: 'border-box',
}

const readonlyStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  background: 'rgba(255,255,255,0.02)',
  border: '1px solid rgba(255,255,255,0.04)',
  borderRadius: 7,
  color: 'rgba(255,255,255,0.85)',
  fontSize: 13,
  fontFamily: 'Outfit, sans-serif',
  boxSizing: 'border-box',
  display: 'flex',
  alignItems: 'center',
  minHeight: 34,
}

const unitChip: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: '#7BAED4',
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.06)',
  padding: '7px 10px',
  borderRadius: 7,
  whiteSpace: 'nowrap',
  boxSizing: 'border-box',
  minHeight: 34,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
}

function Toggle({ checked, onChange, disabled }: {
  checked: boolean
  onChange: (v: boolean) => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={() => !disabled && onChange(!checked)}
      disabled={disabled}
      aria-pressed={checked}
      style={{
        width: 38, height: 22, borderRadius: 11, border: 'none',
        cursor: disabled ? 'not-allowed' : 'pointer',
        padding: 2, position: 'relative',
        background: checked ? '#22C55E' : 'rgba(255,255,255,0.15)',
        flexShrink: 0,
        transition: 'background 0.18s',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <span style={{
        display: 'block',
        width: 18, height: 18, borderRadius: 9,
        background: 'white',
        position: 'absolute', top: 2,
        left: checked ? 18 : 2,
        transition: 'left 0.18s',
      }} />
    </button>
  )
}

export default function ServicesEditor({
  industry, trade_type, saved, mode, onChange,
}: ServicesEditorProps) {
  // The brief: templates only fill in when nothing is saved. Keep this
  // computation memoised so re-renders don't churn ids.
  const initial = useMemo(
    () => getInitialServices({ industry, trade_type, saved }),
    // saved/trade_type changes should refresh, but only on actual identity change
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  const [services, setServices] = useState<Service[]>(initial)
  const [tradeTypeLocal, setTradeTypeLocal] = useState<string | null>(trade_type)

  function emit(nextServices: Service[], nextTradeType: string | null = tradeTypeLocal) {
    onChange({ services: nextServices, trade_type: nextTradeType })
  }

  function setRow(id: string, patch: Partial<Service>) {
    const next = services.map(s => s.id === id ? { ...s, ...patch } : s)
    setServices(next)
    emit(next)
  }

  function addCustom() {
    const next: Service[] = [
      ...services,
      { id: newId(), name: '', price: '', unit: '', enabled: true, custom: true },
    ]
    setServices(next)
    emit(next)
  }

  function removeRow(id: string) {
    const next = services.filter(s => s.id !== id)
    setServices(next)
    emit(next)
  }

  function pickTradeType(value: string) {
    setTradeTypeLocal(value)
    // Only seed defaults when there are no saved/custom rows yet.
    const fresh = templateToServices(TRADE_TEMPLATES[value] ?? [])
    const next = services.length === 0 ? fresh : services
    setServices(next)
    emit(next, value)
  }

  // ── Trades sub-type selector ─────────────────────────────────────────────

  const isTrades = industry === 'trades'

  if (isTrades && !tradeTypeLocal) {
    if (mode === 'client') {
      return (
        <div style={card}>
          <div style={headerStyle}>Services and Pricing</div>
          <p style={subStyle}>
            Your account isn&apos;t set up with a trade type yet. Ask your TalkMate admin to set this for you so the agent
            can answer pricing questions.
          </p>
        </div>
      )
    }
    return (
      <div style={card}>
        <div style={headerStyle}>Services and Pricing</div>
        <p style={subStyle}>
          What type of trade is this business? We use this to load the right service template.
        </p>
        <select
          value=""
          onChange={e => e.target.value && pickTradeType(e.target.value)}
          style={{ ...inputStyle, padding: '10px 12px', maxWidth: 320 }}
        >
          <option value="" disabled>Choose a trade type…</option>
          {TRADE_TYPE_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>
    )
  }

  // ── Main editor ──────────────────────────────────────────────────────────

  const tradeTypeLabel = TRADE_TYPE_OPTIONS.find(o => o.value === tradeTypeLocal)?.label ?? null

  return (
    <div style={card}>
      <div style={headerStyle}>Services and Pricing</div>
      <p style={subStyle}>
        These services are loaded into the agent&apos;s knowledge base so it can answer pricing questions accurately on every call.
      </p>

      {/* Trade type — admin can change, client sees a read-only label */}
      {isTrades && (
        <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, color: '#4A7FBB', fontWeight: 600 }}>Trade type:</span>
          {mode === 'admin' ? (
            <select
              value={tradeTypeLocal ?? ''}
              onChange={e => {
                const v = e.target.value
                setTradeTypeLocal(v)
                emit(services, v)
              }}
              style={{ ...inputStyle, maxWidth: 240 }}
            >
              {TRADE_TYPE_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          ) : (
            <span style={{
              fontSize: 12, fontWeight: 700, color: 'white',
              padding: '5px 10px', borderRadius: 99,
              background: 'rgba(74,159,232,0.12)', border: '1px solid rgba(74,159,232,0.25)',
            }}>{tradeTypeLabel ?? '—'}</span>
          )}
        </div>
      )}

      {services.length === 0 && mode === 'client' && (
        <p style={{ fontSize: 13, color: '#7BAED4', lineHeight: 1.6 }}>
          Your agent uses this list to answer pricing questions on calls. Add your prices below to get started.
        </p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {services.map(s => {
          const canEditName = mode === 'admin' || s.custom
          const canEditUnit = mode === 'admin' || s.custom
          const canDelete = mode === 'admin' ? s.custom : s.custom
          return (
            <div
              key={s.id}
              style={{
                display: 'grid',
                gridTemplateColumns: '44px minmax(0, 2.4fr) 110px 130px 36px',
                gap: 8, alignItems: 'center',
              }}
              className="services-row"
            >
              <Toggle checked={s.enabled} onChange={v => setRow(s.id, { enabled: v })} />

              {/* Name */}
              {canEditName ? (
                <input
                  style={inputStyle}
                  value={s.name}
                  onChange={e => setRow(s.id, { name: e.target.value })}
                  placeholder={s.custom ? 'Service name' : ''}
                />
              ) : (
                <div style={readonlyStyle}>{s.name}</div>
              )}

              {/* Price */}
              <div style={{ position: 'relative' }}>
                <span style={{
                  position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)',
                  fontSize: 13, color: '#7BAED4', pointerEvents: 'none',
                }}>$</span>
                <input
                  style={{ ...inputStyle, paddingLeft: 22 }}
                  value={s.price}
                  inputMode="decimal"
                  onChange={e => setRow(s.id, { price: e.target.value })}
                  placeholder="0.00"
                />
              </div>

              {/* Unit */}
              {canEditUnit ? (
                <input
                  style={inputStyle}
                  value={s.unit}
                  onChange={e => setRow(s.id, { unit: e.target.value })}
                  placeholder="per job"
                />
              ) : (
                <div style={unitChip}>{s.unit || '—'}</div>
              )}

              {/* Delete (custom rows only) */}
              {canDelete ? (
                <button
                  type="button"
                  onClick={() => removeRow(s.id)}
                  aria-label="Delete service"
                  style={{
                    width: 32, height: 32, borderRadius: 7,
                    background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.25)',
                    color: '#EF4444', cursor: 'pointer', fontSize: 14, lineHeight: 1,
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >🗑</button>
              ) : (
                <span aria-hidden="true" />
              )}
            </div>
          )
        })}
      </div>

      <button
        type="button"
        onClick={addCustom}
        style={{
          marginTop: 12, width: '100%', padding: '10px',
          background: 'transparent',
          border: '1px dashed rgba(74,159,232,0.3)',
          borderRadius: 9, color: '#4A9FE8',
          fontFamily: 'Outfit, sans-serif',
          fontSize: 13, fontWeight: 600, cursor: 'pointer',
        }}
      >
        + Add custom service
      </button>

      {/* Mobile: collapse the row grid for narrow screens */}
      <style>{`
        @media (max-width: 640px) {
          .services-row {
            grid-template-columns: 44px minmax(0, 1fr) 36px !important;
            grid-template-areas:
              "toggle name delete"
              "toggle price unit" !important;
            row-gap: 6px !important;
          }
          .services-row > :nth-child(1) { grid-area: toggle; }
          .services-row > :nth-child(2) { grid-area: name; }
          .services-row > :nth-child(3) { grid-area: price; }
          .services-row > :nth-child(4) { grid-area: unit; }
          .services-row > :nth-child(5) { grid-area: delete; }
        }
      `}</style>
    </div>
  )
}
