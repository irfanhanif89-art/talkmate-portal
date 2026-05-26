'use client'

import { useState } from 'react'
import ModalShell from '@/components/sales/modal-shell'

interface Props {
  currentStart: string | null
  currentEnd: string | null
  currentTarget: number | null
  onClose: () => void
  onSaved: (next: { sprint_start: string; sprint_end: string; mrr_target: number }) => void
}

export default function EditSprintModal({
  currentStart, currentEnd, currentTarget, onClose, onSaved,
}: Props) {
  const [start, setStart] = useState(currentStart ?? '')
  const [end, setEnd] = useState(currentEnd ?? '')
  const [target, setTarget] = useState(currentTarget != null ? String(currentTarget) : '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/sales-sprint', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sprint_start: start,
          sprint_end: end,
          mrr_target: Number.parseInt(target, 10),
        }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok || !body?.ok) {
        setError(body?.error ?? 'Could not save sprint settings.')
        return
      }
      onSaved({
        sprint_start: body.sprint_start,
        sprint_end: body.sprint_end,
        mrr_target: body.mrr_target,
      })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <ModalShell
      title="Edit sprint"
      subtitle="Sprint dates and MRR target shown on the admin Sales Pipeline page. Used to scope the 'closed this sprint' metric."
      onClose={onClose}
      maxWidth={460}
    >
      <Field label="Sprint start (AEST)">
        <input
          type="date"
          value={start}
          onChange={e => setStart(e.target.value)}
          style={input}
        />
      </Field>
      <Field label="Sprint end (AEST)">
        <input
          type="date"
          value={end}
          onChange={e => setEnd(e.target.value)}
          style={input}
        />
      </Field>
      <Field label="MRR target (AUD/month)">
        <input
          type="number"
          inputMode="numeric"
          value={target}
          onChange={e => setTarget(e.target.value)}
          min={1}
          step={1000}
          style={input}
        />
        <div style={{ fontSize: 11, color: '#7BAED4', marginTop: 6 }}>
          Total monthly recurring revenue you want closed during this sprint.
        </div>
      </Field>

      {error && (
        <div style={{
          marginTop: 6, marginBottom: 14, padding: '10px 12px', borderRadius: 8,
          background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)',
          color: '#ef4444', fontSize: 13,
        }}>{error}</div>
      )}

      <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
        <button onClick={onClose} style={cancelBtn}>Cancel</button>
        <button onClick={save} disabled={saving} style={{
          flex: 1, padding: '11px 16px', borderRadius: 9, border: 'none',
          background: saving ? '#7a4a2a' : '#E8622A', color: 'white',
          fontFamily: 'Outfit, sans-serif', fontSize: 14, fontWeight: 700,
          cursor: saving ? 'wait' : 'pointer',
        }}>
          {saving ? 'Saving…' : 'Save sprint'}
        </button>
      </div>
    </ModalShell>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{
        display: 'block', fontSize: 11, fontWeight: 800, color: '#E8622A',
        letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6,
      }}>{label}</label>
      {children}
    </div>
  )
}

const input: React.CSSProperties = {
  width: '100%', padding: '10px 12px', borderRadius: 8,
  background: '#061322', border: '1px solid rgba(255,255,255,0.12)',
  color: 'white', fontSize: 14, fontFamily: 'Outfit, sans-serif',
  outline: 'none',
}

const cancelBtn: React.CSSProperties = {
  padding: '11px 18px', borderRadius: 9, cursor: 'pointer',
  background: 'transparent', color: '#7BAED4', border: '1px solid rgba(255,255,255,0.12)',
  fontFamily: 'Outfit, sans-serif', fontSize: 13, fontWeight: 600,
}
