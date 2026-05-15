'use client'

import { useEffect, useState } from 'react'
import { silentSyncAgent } from '@/components/portal/sync-agent-button'

interface Vip {
  id: string
  phone: string
  name: string | null
  note: string | null
  action: 'transfer_escalation' | 'transfer_to_member' | 'take_message' | 'skip_queue'
  transfer_to_member_id: string | null
  active: boolean
}

interface TeamMember { id: string; name: string; role: string }

const ACTION_LABELS: Record<Vip['action'], string> = {
  transfer_escalation: 'Transfer to escalation contact',
  transfer_to_member: 'Transfer to a specific team member',
  take_message: 'Take message (priority)',
  skip_queue: 'Skip queue',
}

export default function VipView({ plan, transferEnabled }: { plan: string; transferEnabled: boolean }) {
  const [list, setList] = useState<Vip[]>([])
  const [team, setTeam] = useState<TeamMember[]>([])
  const [loading, setLoading] = useState(true)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [editing, setEditing] = useState<Vip | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => { reload() }, [])

  async function reload() {
    setLoading(true)
    try {
      const [vipRes, teamRes] = await Promise.all([
        fetch('/api/portal/vip-callers'),
        fetch('/api/portal/team'),
      ])
      if (vipRes.ok) { const d = await vipRes.json(); setList(d.callers ?? []) }
      if (teamRes.ok) { const d = await teamRes.json(); setTeam(d.team ?? []) }
    } finally { setLoading(false) }
  }

  function showToast(m: string) { setToast(m); setTimeout(() => setToast(null), 3000) }

  async function deleteVip(id: string) {
    if (!confirm('Remove this VIP caller?')) return
    const res = await fetch(`/api/portal/vip-callers/${id}`, { method: 'DELETE' })
    if (res.ok) {
      setList(l => l.filter(x => x.id !== id))
      showToast('Removed')
      silentSyncAgent()
    }
  }

  async function toggleActive(v: Vip) {
    const res = await fetch(`/api/portal/vip-callers/${v.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: !v.active }),
    })
    if (res.ok) {
      setList(l => l.map(x => x.id === v.id ? { ...x, active: !x.active } : x))
      silentSyncAgent()
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 22, gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: '1.6rem', fontWeight: 800, color: 'white', margin: 0 }}>VIP Callers</h1>
          <p style={{ fontSize: 13, color: '#7BAED4', margin: '4px 0 0 0' }}>
            Phone numbers that get priority treatment when they call.
          </p>
        </div>
        <button onClick={() => { setEditing(null); setDrawerOpen(true) }} style={primaryBtn()}>+ Add VIP caller</button>
      </div>

      {plan === 'starter' && !transferEnabled && (
        <div style={noticeStyle}>
          Live call transfer is available on the Growth plan. VIP callers still get logged so you can review them.
        </div>
      )}

      <div style={tableWrap}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#071829' }}>
              {['Name', 'Phone', 'Note', 'When they call', 'Active', 'Actions'].map(h =>
                <th key={h} style={th()}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={6} style={emptyCell()}>Loading…</td></tr>}
            {!loading && list.length === 0 && (
              <tr><td colSpan={6} style={emptyCell()}>
                Add phone numbers that should receive priority treatment. VIP callers skip the standard flow and get connected immediately.
              </td></tr>
            )}
            {list.map((v, i) => (
              <tr key={v.id} style={rowStyle(i)}>
                <td style={td()}><div style={{ fontWeight: 600, color: 'white' }}>{v.name ?? '—'}</div></td>
                <td style={td()}><span style={{ color: '#7BAED4' }}>{v.phone}</span></td>
                <td style={td()}><span style={{ color: '#7BAED4' }}>{v.note ?? '—'}</span></td>
                <td style={td()}>
                  <span style={{ fontSize: 12, color: 'white' }}>{ACTION_LABELS[v.action]}</span>
                  {v.action === 'transfer_to_member' && v.transfer_to_member_id && (
                    <div style={{ fontSize: 11, color: '#7BAED4', marginTop: 2 }}>
                      → {team.find(t => t.id === v.transfer_to_member_id)?.name ?? 'Unknown member'}
                    </div>
                  )}
                </td>
                <td style={td()}>
                  <button onClick={() => toggleActive(v)} style={toggleBtn(v.active)}>{v.active ? 'Active' : 'Inactive'}</button>
                </td>
                <td style={td()}>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={() => { setEditing(v); setDrawerOpen(true) }} style={iconBtn('#4A9FE8')}>✎</button>
                    <button onClick={() => deleteVip(v.id)} style={iconBtn('#EF4444')}>✕</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {drawerOpen && (
        <VipModal
          initial={editing}
          team={team}
          onClose={() => { setDrawerOpen(false); setEditing(null) }}
          onSaved={() => { setDrawerOpen(false); setEditing(null); reload(); showToast(editing ? 'Saved' : 'Added'); silentSyncAgent() }}
        />
      )}
      {toast && <div style={toastStyle}>{toast}</div>}
    </div>
  )
}

function VipModal({ initial, team, onClose, onSaved }: {
  initial: Vip | null
  team: TeamMember[]
  onClose: () => void
  onSaved: () => void
}) {
  const [phone, setPhone] = useState(initial?.phone ?? '')
  const [name, setName] = useState(initial?.name ?? '')
  const [note, setNote] = useState(initial?.note ?? '')
  const [action, setAction] = useState<Vip['action']>(initial?.action ?? 'transfer_escalation')
  const [transferToMemberId, setTransferToMemberId] = useState(initial?.transfer_to_member_id ?? '')
  const [active, setActive] = useState(initial?.active ?? true)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function save() {
    setBusy(true); setErr(null)
    try {
      const url = initial ? `/api/portal/vip-callers/${initial.id}` : '/api/portal/vip-callers'
      const method = initial ? 'PATCH' : 'POST'
      const body: Record<string, unknown> = { phone, name, note, action, active }
      if (action === 'transfer_to_member') body.transfer_to_member_id = transferToMemberId
      else body.transfer_to_member_id = null
      const res = await fetch(url, {
        method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Save failed')
      onSaved()
    } catch (e) {
      setErr((e as Error).message); setBusy(false)
    }
  }

  return (
    <ModalShell onClose={onClose}>
      <h2 style={{ fontSize: 18, fontWeight: 800, color: 'white', margin: 0, marginBottom: 16 }}>
        {initial ? 'Edit VIP caller' : 'Add VIP caller'}
      </h2>
      <Field label="Phone number"><Input value={phone} onChange={setPhone} placeholder="0412 345 678" /></Field>
      <Field label="Name (optional)"><Input value={name} onChange={setName} /></Field>
      <Field label="Note (optional)"><Input value={note} onChange={setNote} placeholder="e.g. Owner's wife" /></Field>
      <Field label="When this number calls">
        <select value={action} onChange={e => setAction(e.target.value as Vip['action'])}
          style={selectStyle}>
          {(Object.keys(ACTION_LABELS) as Vip['action'][]).map(a => (
            <option key={a} value={a} style={{ background: '#0A1E38' }}>{ACTION_LABELS[a]}</option>
          ))}
        </select>
      </Field>
      {action === 'transfer_to_member' && (
        <Field label="Transfer to">
          <select value={transferToMemberId} onChange={e => setTransferToMemberId(e.target.value)} style={selectStyle}>
            <option value="" style={{ background: '#0A1E38' }}>Pick a team member…</option>
            {team.map(t => <option key={t.id} value={t.id} style={{ background: '#0A1E38' }}>{t.name} — {t.role}</option>)}
          </select>
        </Field>
      )}
      <label style={checkboxRow}>
        <input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} />
        <div style={{ fontWeight: 700, color: 'white', fontSize: 13 }}>Active</div>
      </label>
      {err && <div style={errorBoxStyle}>{err}</div>}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 18 }}>
        <button onClick={onClose} style={ghostBtn()}>Cancel</button>
        <button onClick={save} disabled={busy} style={primaryBtn()}>{busy ? 'Saving…' : 'Save'}</button>
      </div>
    </ModalShell>
  )
}

// ---- shared atoms (same style as team-view) ----
function ModalShell({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(6px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 20,
      fontFamily: 'Outfit, sans-serif',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: '#0A1E38', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16,
        padding: 26, maxWidth: 520, width: '100%', maxHeight: '90vh', overflowY: 'auto' as const,
        boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
      }}>{children}</div>
    </div>
  )
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'block', marginBottom: 12 }}>
      <span style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#7BAED4', textTransform: 'uppercase' as const, letterSpacing: '0.05em', marginBottom: 6 }}>{label}</span>
      {children}
    </label>
  )
}
function Input({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
      style={{ width: '100%', padding: '10px 12px', borderRadius: 9, background: '#071829', border: '1px solid rgba(255,255,255,0.10)', color: 'white', fontSize: 13, fontFamily: 'Outfit, sans-serif', outline: 'none' }} />
  )
}
const selectStyle: React.CSSProperties = {
  width: '100%', padding: '10px 12px', borderRadius: 9, background: '#071829',
  border: '1px solid rgba(255,255,255,0.10)', color: 'white', fontSize: 13,
  fontFamily: 'Outfit, sans-serif', cursor: 'pointer',
}
const tableWrap: React.CSSProperties = {
  background: '#0A1E38', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, overflow: 'auto',
}
const th = (): React.CSSProperties => ({
  textAlign: 'left' as const, padding: '11px 16px',
  fontSize: 11, fontWeight: 700, color: '#4A7FBB',
  textTransform: 'uppercase' as const, letterSpacing: '0.06em',
})
const td = (): React.CSSProperties => ({ padding: '12px 16px', fontSize: 13 })
const rowStyle = (i: number): React.CSSProperties => ({
  borderTop: '1px solid rgba(255,255,255,0.04)',
  background: i % 2 === 0 ? '#0A1E38' : '#071829',
})
const emptyCell = (): React.CSSProperties => ({
  padding: 32, textAlign: 'center' as const, fontSize: 13, color: '#7BAED4',
})
function toggleBtn(active: boolean): React.CSSProperties {
  return {
    padding: '4px 10px', borderRadius: 99, fontSize: 11, fontWeight: 700,
    background: active ? 'rgba(34,197,94,0.15)' : 'rgba(107,114,128,0.15)',
    color: active ? '#22C55E' : '#9CA3AF',
    border: `1px solid ${active ? 'rgba(34,197,94,0.4)' : 'rgba(107,114,128,0.4)'}`,
    cursor: 'pointer', fontFamily: 'Outfit, sans-serif',
  }
}
function iconBtn(color: string): React.CSSProperties {
  return {
    width: 28, height: 28, borderRadius: 7, background: `${color}1A`, border: `1px solid ${color}55`,
    color, cursor: 'pointer', fontSize: 13, fontWeight: 700, display: 'inline-flex',
    alignItems: 'center', justifyContent: 'center', fontFamily: 'Outfit, sans-serif',
  }
}
function primaryBtn(): React.CSSProperties {
  return {
    padding: '9px 16px', borderRadius: 9, fontSize: 13, fontWeight: 700,
    background: '#E8622A', border: 'none', color: 'white', cursor: 'pointer', fontFamily: 'Outfit, sans-serif',
  }
}
function ghostBtn(): React.CSSProperties {
  return {
    padding: '9px 16px', borderRadius: 9, fontSize: 13, fontWeight: 600,
    background: 'transparent', border: '1px solid rgba(255,255,255,0.15)',
    color: '#7BAED4', cursor: 'pointer', fontFamily: 'Outfit, sans-serif',
  }
}
const noticeStyle: React.CSSProperties = {
  marginBottom: 18, padding: '12px 16px', borderRadius: 10,
  background: 'rgba(232,98,42,0.08)', border: '1px solid rgba(232,98,42,0.30)',
  color: '#E8622A', fontSize: 13, fontWeight: 600,
}
const checkboxRow: React.CSSProperties = {
  display: 'flex', gap: 10, alignItems: 'center',
  padding: 12, borderRadius: 9, background: '#071829',
  border: '1px solid rgba(255,255,255,0.06)', cursor: 'pointer', marginBottom: 6,
}
const errorBoxStyle: React.CSSProperties = {
  marginTop: 10, padding: '10px 14px', borderRadius: 9,
  background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.35)',
  color: '#FCA5A5', fontSize: 13,
}
const toastStyle: React.CSSProperties = {
  position: 'fixed', bottom: 24, right: 24, zIndex: 100,
  padding: '12px 18px', background: '#0A1E38',
  border: '1px solid rgba(34,197,94,0.4)', borderRadius: 10,
  color: '#22C55E', fontSize: 13, fontWeight: 600,
  boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
}
