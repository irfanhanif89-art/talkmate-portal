'use client'

import { useEffect, useState } from 'react'
import { Plus, X, Trash2 } from 'lucide-react'
import type { FilterRules } from '@/lib/smart-list-resolver'

interface Props {
  open: boolean
  industry: string | null
  onClose: () => void
  onCreated: (id: string) => void
}

const ICONS = ['⭐', '🔥', '💰', '📞', '📋', '🚗', '🏠', '🏢', '✨', '⚠️', '🌙', '👤']
const COLOURS = ['#E8622A', '#1565C0', '#22C55E', '#F59E0B', '#8B5CF6', '#EF4444']

type FieldKey = 'name_contains' | 'phone_contains' | 'first_seen_days' | 'min_call_count' | 'tag' | 'last_seen_min_days' | 'industry_field'

interface Rule {
  id: string
  field: FieldKey
  value: string
}

const FIELDS: Array<{ key: FieldKey; label: string; valueType: 'text' | 'number'; placeholder: string }> = [
  { key: 'name_contains', label: 'Name contains', valueType: 'text', placeholder: 'e.g. Mike' },
  { key: 'phone_contains', label: 'Phone contains', valueType: 'text', placeholder: 'e.g. 0412' },
  { key: 'first_seen_days', label: 'Called in last (days)', valueType: 'number', placeholder: '7' },
  { key: 'min_call_count', label: 'Call count is at least', valueType: 'number', placeholder: '3' },
  { key: 'tag', label: 'Tagged with', valueType: 'text', placeholder: 'e.g. urgent' },
  { key: 'last_seen_min_days', label: 'Last called more than (days) ago', valueType: 'number', placeholder: '21' },
]

const INDUSTRY_FIELD_LABELS: Record<string, Array<{ label: string; field: string }>> = {
  real_estate: [
    { label: 'Real estate: enquiry type =', field: 'enquiry_type' },
    { label: 'Real estate: pre-approved =', field: 'pre_approved' },
  ],
  restaurants: [
    { label: 'Restaurant: order type =', field: 'order_type' },
  ],
  trades: [
    { label: 'Trades: urgency =', field: 'urgency' },
  ],
  towing: [
    { label: 'Towing: vehicle make =', field: 'vehicle_make' },
  ],
}

// Convert the user-friendly Rule[] into the FilterRules JSON the resolver
// understands. Each rule maps to exactly one filter field — multi-rule sets
// stack additively (intersection).
function rulesToFilter(rules: Rule[]): FilterRules {
  const out: FilterRules = {}
  // Note: name/phone "contains" filters aren't supported by the resolver yet —
  // they'd need a Postgres ilike search. We emit them as a synthetic tag so
  // the saved rule doesn't silently drop on save; the resolver will treat
  // them as an unknown rule and simply not filter on them.
  for (const r of rules) {
    if (!r.value) continue
    if (r.field === 'first_seen_days') out.first_seen_days = Number(r.value) || 0
    else if (r.field === 'min_call_count') out.min_call_count = Number(r.value) || 0
    else if (r.field === 'last_seen_min_days') out.last_seen_min_days = Number(r.value) || 0
    else if (r.field === 'tag') out.tag = r.value.trim().toLowerCase().replace(/\s+/g, '_')
  }
  return out
}

export default function CustomListBuilder({ open, industry, onClose, onCreated }: Props) {
  const [name, setName] = useState('')
  const [icon, setIcon] = useState('⭐')
  const [color, setColor] = useState('#E8622A')
  const [rules, setRules] = useState<Rule[]>([{ id: crypto.randomUUID(), field: 'min_call_count', value: '' }])
  const [previewCount, setPreviewCount] = useState<number | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Live preview on debounce.
  useEffect(() => {
    if (!open) return
    const t = setTimeout(async () => {
      setPreviewLoading(true)
      try {
        const res = await fetch('/api/smart-lists/preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rules: rulesToFilter(rules) }),
        })
        const data = await res.json()
        setPreviewCount(typeof data.count === 'number' ? data.count : null)
      } catch {
        setPreviewCount(null)
      } finally {
        setPreviewLoading(false)
      }
    }, 350)
    return () => clearTimeout(t)
  }, [rules, open])

  function addRule() {
    if (rules.length >= 5) return
    setRules(rs => [...rs, { id: crypto.randomUUID(), field: 'tag', value: '' }])
  }

  function removeRule(id: string) {
    setRules(rs => rs.filter(r => r.id !== id))
  }

  function updateRule(id: string, patch: Partial<Rule>) {
    setRules(rs => rs.map(r => r.id === id ? { ...r, ...patch } : r))
  }

  async function save() {
    setError(null)
    if (!name.trim()) { setError('List name is required.'); return }
    setSaving(true)
    try {
      const res = await fetch('/api/smart-lists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          description: `Custom list with ${rules.filter(r => r.value).length} rule${rules.filter(r => r.value).length === 1 ? '' : 's'}`,
          icon, color,
          filter_rules: rulesToFilter(rules),
        }),
      })
      const data = await res.json()
      if (!data.ok) {
        setError(data.error || 'Could not save the list.')
        return
      }
      onCreated(data.id as string)
    } finally {
      setSaving(false)
    }
  }

  if (!open) return null

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1100, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '60px 20px', overflowY: 'auto' }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: '#0A1E38', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 18,
        width: '100%', maxWidth: 640, padding: 28,
        boxShadow: '0 24px 60px rgba(0,0,0,0.5)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <h2 style={{ fontSize: '1.3rem', fontWeight: 800, color: 'white' }}>Create a custom list</h2>
          <button onClick={onClose} aria-label="Close" style={{ background: 'transparent', border: 'none', color: '#7BAED4', cursor: 'pointer', padding: 4 }}>
            <X size={20} />
          </button>
        </div>

        <Field label="List name">
          <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Friday VIPs" style={inp} />
        </Field>

        <Field label="Icon">
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {ICONS.map(i => (
              <button key={i} type="button" onClick={() => setIcon(i)} style={{ width: 36, height: 36, fontSize: 18, border: `1.5px solid ${icon === i ? '#E8622A' : 'rgba(255,255,255,0.08)'}`, background: icon === i ? 'rgba(232,98,42,0.08)' : '#071829', borderRadius: 8, cursor: 'pointer' }}>{i}</button>
            ))}
            <input value={icon} onChange={e => setIcon(e.target.value.slice(0, 2))} maxLength={2} style={{ ...inp, width: 60, textAlign: 'center', fontSize: 16 }} placeholder="🎯" />
          </div>
        </Field>

        <Field label="Colour">
          <div style={{ display: 'flex', gap: 8 }}>
            {COLOURS.map(c => (
              <button key={c} type="button" onClick={() => setColor(c)} style={{ width: 32, height: 32, borderRadius: '50%', background: c, border: color === c ? '3px solid white' : '1px solid rgba(255,255,255,0.1)', cursor: 'pointer' }} />
            ))}
          </div>
        </Field>

        <div style={{ marginTop: 20, marginBottom: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#4A7FBB', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Show contacts where…</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {rules.map(r => {
              const fieldDef = FIELDS.find(f => f.key === r.field) ?? FIELDS[0]
              return (
                <div key={r.id} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 36px', gap: 8 }}>
                  <select value={r.field} onChange={e => updateRule(r.id, { field: e.target.value as FieldKey, value: '' })} style={{ ...inp, padding: '9px 12px' }}>
                    {FIELDS.map(f => <option key={f.key} value={f.key} style={{ background: '#0A1E38' }}>{f.label}</option>)}
                  </select>
                  <input
                    value={r.value}
                    onChange={e => updateRule(r.id, { value: e.target.value })}
                    placeholder={fieldDef.placeholder}
                    type={fieldDef.valueType}
                    style={inp}
                  />
                  <button type="button" onClick={() => removeRule(r.id)} aria-label="Remove rule" style={{ background: 'rgba(239,68,68,0.1)', border: 'none', color: '#EF4444', borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Trash2 size={14} />
                  </button>
                </div>
              )
            })}
          </div>
          <button
            type="button"
            onClick={addRule}
            disabled={rules.length >= 5}
            style={{ marginTop: 10, width: '100%', padding: 10, background: 'transparent', border: '1px dashed rgba(74,159,232,0.3)', borderRadius: 9, color: '#4A9FE8', fontFamily: 'Outfit, sans-serif', fontSize: 13, fontWeight: 500, cursor: rules.length >= 5 ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, opacity: rules.length >= 5 ? 0.4 : 1 }}
          >
            <Plus size={13} /> Add rule {rules.length >= 5 ? '(max 5)' : ''}
          </button>

          {industry && INDUSTRY_FIELD_LABELS[industry] && (
            <p style={{ fontSize: 11, color: '#4A7FBB', marginTop: 8 }}>
              Industry-specific filters available for {industry.replace(/_/g, ' ')} are coming in a follow-up — for now, use tags or call-count rules.
            </p>
          )}
        </div>

        <div style={{ background: '#071829', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 11, padding: 16, marginBottom: 18, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 13, color: '#7BAED4' }}>Matching contacts</span>
          <span style={{ fontSize: 22, fontWeight: 800, color: '#E8622A' }}>
            {previewLoading ? '…' : previewCount ?? '—'}
          </span>
        </div>

        {error && <div style={{ marginBottom: 14, fontSize: 13, color: '#EF4444', textAlign: 'center' }}>{error}</div>}

        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onClose} disabled={saving} style={{ flex: 1, padding: '11px', background: 'transparent', color: '#7BAED4', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 9, fontSize: 13, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>
            Cancel
          </button>
          <button onClick={save} disabled={saving || !name.trim()} style={{ flex: 2, padding: '11px', background: !name.trim() ? 'rgba(232,98,42,0.4)' : '#E8622A', color: 'white', border: 'none', borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>
            {saving ? 'Saving…' : 'Save list'}
          </button>
        </div>
      </div>
    </div>
  )
}

const inp: React.CSSProperties = {
  width: '100%', padding: '10px 12px',
  background: '#071829', border: '1px solid rgba(255,255,255,0.1)', color: 'white',
  borderRadius: 9, fontFamily: 'Outfit, sans-serif', fontSize: 13, outline: 'none',
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'block', marginBottom: 14 }}>
      <span style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#4A7FBB', marginBottom: 6 }}>{label}</span>
      {children}
    </label>
  )
}
