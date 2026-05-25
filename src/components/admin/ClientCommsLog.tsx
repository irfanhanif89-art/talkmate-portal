'use client'

import { useCallback, useEffect, useState } from 'react'
import { Pencil } from 'lucide-react'

interface Note {
  id: string
  note: string
  logged_by: string | null
  onboarding_stage: string | null
  created_at: string
}

interface Props {
  businessId?: string | null
  leadId?: string | null
  compact?: boolean
  stage?: string
  adminEmail: string
}

export default function ClientCommsLog({
  businessId, leadId, compact = false, stage, adminEmail,
}: Props) {
  const [notes, setNotes] = useState<Note[]>([])
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (businessId) params.set('business_id', businessId)
    if (leadId) params.set('lead_id', leadId)
    const res = await fetch(`/api/admin/comms-log?${params.toString()}`)
    if (res.ok) {
      const body = await res.json()
      setNotes((body.notes ?? []) as Note[])
    }
    setLoading(false)
  }, [businessId, leadId])

  useEffect(() => { void load() }, [load])

  async function addNote() {
    if (!draft.trim()) return
    setSaving(true)
    const res = await fetch('/api/admin/comms-log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        business_id: businessId ?? null,
        lead_id: leadId ?? null,
        note: draft.trim(),
        onboarding_stage: stage ?? null,
        logged_by: adminEmail,
      }),
    })
    if (res.ok) {
      setDraft('')
      await load()
    }
    setSaving(false)
  }

  const visible = compact ? notes.slice(0, 1) : notes

  return (
    <div style={{ fontFamily: 'Outfit, sans-serif' }}>
      {loading ? (
        <div style={{ fontSize: 12, color: '#7BAED4' }}>Loading...</div>
      ) : visible.length === 0 ? (
        <div style={{
          fontSize: 12, color: '#7BAED4',
          padding: '10px 12px', borderRadius: 8,
          border: '1px dashed rgba(255,255,255,0.08)',
        }}>No notes yet.</div>
      ) : (
        <ol style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {visible.map(n => (
            <li key={n.id} style={{
              padding: 10, borderRadius: 8, fontSize: 12, lineHeight: 1.5,
              background: '#061322', border: '1px solid rgba(255,255,255,0.06)',
            }}>
              <div style={{ color: 'white' }}>{n.note}</div>
              <div style={{ fontSize: 10, color: '#4A7FBB', marginTop: 4 }}>
                {n.logged_by ?? 'admin'} · {new Date(n.created_at).toLocaleString('en-AU')}
              </div>
            </li>
          ))}
        </ol>
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <input
          value={draft}
          onChange={e => setDraft(e.target.value)}
          placeholder="Add a note..."
          style={{
            flex: 1, padding: '8px 10px', borderRadius: 7, fontSize: 12,
            background: '#061322', border: '1px solid rgba(255,255,255,0.08)',
            color: 'white', fontFamily: 'Outfit, sans-serif', outline: 'none',
          }}
        />
        <button
          onClick={addNote}
          disabled={saving || !draft.trim()}
          style={{
            padding: '8px 12px', borderRadius: 7, border: 'none',
            background: !draft.trim() || saving ? '#7B3A1A' : '#E8622A',
            color: 'white', fontFamily: 'Outfit, sans-serif',
            fontSize: 12, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer',
            display: 'flex', alignItems: 'center', gap: 4,
          }}
        ><Pencil size={11} /> Add</button>
      </div>
    </div>
  )
}
