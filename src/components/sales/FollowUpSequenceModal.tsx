'use client'

import { useState } from 'react'
import ModalShell from './modal-shell'

interface SequenceItem {
  type: 'email' | 'call_reminder'
  day: number
  label: string
  detail: string
  enabled: boolean
  email_subject?: string
  email_body?: string
}

interface Props {
  leadId: string
  onClose: () => void
  onSaved: () => void
}

const DEFAULT_SEQUENCE: SequenceItem[] = [
  {
    type: 'call_reminder',
    day: 1,
    label: 'Day 1: Call reminder',
    detail: 'Check in, did they receive the proposal?',
    enabled: true,
  },
  {
    type: 'email',
    day: 3,
    label: 'Day 3: Auto email',
    detail: 'Quick follow-up nudge sent automatically',
    enabled: true,
    email_subject: 'Just checking in',
    email_body: 'Wanted to make sure the proposal landed okay. Happy to answer any questions or walk you through how TalkMate would work for your business specifically. Just reply to this email.',
  },
  {
    type: 'call_reminder',
    day: 7,
    label: 'Day 7: Call reminder',
    detail: 'Final follow-up if no response',
    enabled: true,
  },
]

export default function FollowUpSequenceModal({ leadId, onClose, onSaved }: Props) {
  const [items, setItems] = useState<SequenceItem[]>(DEFAULT_SEQUENCE)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function toggle(idx: number) {
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, enabled: !it.enabled } : it))
  }

  async function save() {
    const enabled = items.filter(i => i.enabled)
    if (enabled.length === 0) {
      onClose()
      return
    }
    setSaving(true); setError(null)
    const res = await fetch(`/api/sales/leads/${leadId}/followups`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: enabled.map(({ type, day, email_subject, email_body }) => ({
          type, day, email_subject, email_body,
        })),
      }),
    })
    const body = await res.json().catch(() => ({}))
    if (!res.ok || !body.ok) {
      setError(body?.error ?? 'Could not save sequence.')
      setSaving(false)
      return
    }
    onSaved()
  }

  return (
    <ModalShell
      title="Set up follow-up reminders"
      subtitle="Automated reminders keep deals from going cold."
      onClose={onClose}
      maxWidth={520}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 18 }}>
        {items.map((item, idx) => (
          <label key={idx} style={{
            display: 'flex', gap: 12, padding: 14, borderRadius: 9, cursor: 'pointer',
            background: item.enabled ? 'rgba(232,98,42,0.05)' : '#061322',
            border: `1px solid ${item.enabled ? 'rgba(232,98,42,0.25)' : 'rgba(255,255,255,0.08)'}`,
          }}>
            <input
              type="checkbox" checked={item.enabled} onChange={() => toggle(idx)}
              style={{ marginTop: 3, accentColor: '#E8622A' }}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'white' }}>{item.label}</div>
              <div style={{ fontSize: 12, color: '#7BAED4', marginTop: 3, lineHeight: 1.5 }}>{item.detail}</div>
              {item.type === 'email' && item.enabled && (
                <details style={{ marginTop: 8 }}>
                  <summary style={{ fontSize: 11, color: '#4A7FBB', cursor: 'pointer' }}>Preview email</summary>
                  <div style={{
                    marginTop: 8, padding: 10, borderRadius: 7,
                    background: '#061322', border: '1px solid rgba(255,255,255,0.08)',
                    fontSize: 12, color: '#7BAED4', lineHeight: 1.55,
                  }}>
                    <div style={{ fontWeight: 700, color: 'white', marginBottom: 4 }}>{item.email_subject}</div>
                    {item.email_body}
                  </div>
                </details>
              )}
            </div>
          </label>
        ))}
      </div>

      {error && (
        <div style={{
          marginBottom: 12, padding: '10px 14px', borderRadius: 9,
          background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)',
          color: '#ef4444', fontSize: 13,
        }}>{error}</div>
      )}

      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
        <button
          onClick={onClose}
          style={{
            padding: '10px 16px', borderRadius: 9,
            background: 'rgba(255,255,255,0.04)', color: '#7BAED4',
            border: '1px solid rgba(255,255,255,0.12)',
            fontFamily: 'Outfit, sans-serif', fontSize: 13, fontWeight: 700, cursor: 'pointer',
          }}
        >Skip</button>
        <button
          onClick={save}
          disabled={saving}
          style={{
            padding: '10px 18px', borderRadius: 9, border: 'none',
            background: saving ? '#7B3A1A' : '#E8622A',
            color: 'white', fontFamily: 'Outfit, sans-serif',
            fontSize: 13, fontWeight: 700,
            cursor: saving ? 'not-allowed' : 'pointer',
          }}
        >{saving ? 'Saving...' : 'Confirm'}</button>
      </div>
    </ModalShell>
  )
}
