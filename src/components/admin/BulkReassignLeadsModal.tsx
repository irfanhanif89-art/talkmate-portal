'use client'

import { useState } from 'react'
import ModalShell from '@/components/sales/modal-shell'

interface RepOption {
  id: string
  full_name: string
  status: string
}

interface Props {
  sourceRep: {
    id: string
    full_name: string
    status: string
    open_lead_count: number   // number of open leads currently assigned
  }
  destinationReps: RepOption[]
  onClose: () => void
  onSuccess: (moved: number, commissionRowsMoved: number) => void
}

export default function BulkReassignLeadsModal({
  sourceRep, destinationReps, onClose, onSuccess,
}: Props) {
  const [newRepId, setNewRepId] = useState<string>('')
  const [reason, setReason] = useState('')
  const [moveCommission, setMoveCommission] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    if (!newRepId) {
      setError('Pick a destination rep.')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/leads/bulk-reassign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source_rep_id: sourceRep.id,
          new_rep_id: newRepId,
          reason: reason.trim() || undefined,
          move_commission: moveCommission,
        }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok || !body?.ok) {
        setError(body?.error ?? 'Could not bulk-reassign leads.')
        return
      }
      onSuccess(body.moved as number, body.commission_rows_moved as number)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <ModalShell
      title={`Reassign ${sourceRep.open_lead_count} open lead${sourceRep.open_lead_count === 1 ? '' : 's'}`}
      subtitle={`Move every open lead assigned to ${sourceRep.full_name} to another rep. Open statuses: New, Contacted, Demo Booked, Demo Done, Proposal Sent. Won/lost/nurture/bad-lead are not affected.`}
      onClose={onClose}
      maxWidth={500}
    >
      <Label>Reassign to</Label>
      <select
        value={newRepId}
        onChange={e => setNewRepId(e.target.value)}
        style={input}
      >
        <option value="">Choose a rep…</option>
        {destinationReps.map(r => (
          <option key={r.id} value={r.id}>{r.full_name}</option>
        ))}
      </select>

      <Label style={{ marginTop: 16 }}>Reason (optional, shown to both reps)</Label>
      <textarea
        value={reason}
        onChange={e => setReason(e.target.value)}
        placeholder="e.g. Rep on extended leave"
        rows={2}
        style={{ ...input, fontFamily: 'inherit', resize: 'vertical' }}
      />

      <div style={{
        marginTop: 16, padding: 14,
        background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.3)',
        borderRadius: 9,
      }}>
        <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={moveCommission}
            onChange={e => setMoveCommission(e.target.checked)}
            style={{ marginTop: 3, accentColor: '#E8622A' }}
          />
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'white', marginBottom: 4 }}>
              Move commission credit on any included won leads
            </div>
            <div style={{ fontSize: 12, color: '#7BAED4', lineHeight: 1.55 }}>
              Bulk reassign only moves open leads by default. If any won lead with a pending commission is also in scope (unusual), this toggle decides whether the commission credit moves with it.
            </div>
          </div>
        </label>
      </div>

      {error && (
        <div style={{
          marginTop: 14, padding: '10px 12px', borderRadius: 8,
          background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)',
          color: '#ef4444', fontSize: 13,
        }}>{error}</div>
      )}

      <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
        <button onClick={onClose} style={cancelBtn}>Cancel</button>
        <button
          onClick={submit}
          disabled={submitting || !newRepId || sourceRep.open_lead_count === 0}
          style={{
            flex: 1, padding: '11px 16px', borderRadius: 9, border: 'none',
            background: submitting || !newRepId || sourceRep.open_lead_count === 0 ? '#7a4a2a' : '#E8622A',
            color: 'white',
            fontFamily: 'Outfit, sans-serif', fontSize: 14, fontWeight: 700,
            cursor: submitting || !newRepId || sourceRep.open_lead_count === 0 ? 'not-allowed' : 'pointer',
          }}
        >
          {submitting ? 'Reassigning…' : `Reassign all ${sourceRep.open_lead_count}`}
        </button>
      </div>
    </ModalShell>
  )
}

function Label({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <label style={{
      display: 'block', fontSize: 11, fontWeight: 800, color: '#E8622A',
      letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6, ...style,
    }}>{children}</label>
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
