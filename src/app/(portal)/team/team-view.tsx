'use client'

import { useEffect, useState } from 'react'
import { silentSyncAgent } from '@/components/portal/sync-agent-button'

interface TeamMember {
  id: string
  name: string
  role: string
  department: string | null
  phone: string
  extension: string | null
  is_escalation_contact: boolean
  active: boolean
  sort_order: number
}

interface MemberDraft {
  name: string
  role: string
  department: string
  phone: string
  extension: string
  is_escalation_contact: boolean
  active: boolean
}

const emptyDraft: MemberDraft = {
  name: '', role: '', department: '', phone: '', extension: '',
  is_escalation_contact: false, active: true,
}

export default function TeamView({
  plan, transferEnabled,
}: { plan: string; transferEnabled: boolean }) {
  const [team, setTeam] = useState<TeamMember[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<TeamMember | null>(null)
  const [draftOpen, setDraftOpen] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => { reload() }, [])

  async function reload() {
    setLoading(true); setError(null)
    try {
      const res = await fetch('/api/portal/team')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to load team')
      setTeam(data.team ?? [])
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  function showToast(m: string) { setToast(m); setTimeout(() => setToast(null), 3000) }

  async function deleteMember(id: string) {
    if (!confirm('Remove this team member?')) return
    const res = await fetch(`/api/portal/team/${id}`, { method: 'DELETE' })
    if (res.ok) {
      setTeam(t => t.filter(m => m.id !== id))
      showToast('Removed')
      silentSyncAgent()
    }
  }

  async function toggleActive(m: TeamMember) {
    const res = await fetch(`/api/portal/team/${m.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: !m.active }),
    })
    if (res.ok) {
      setTeam(t => t.map(x => x.id === m.id ? { ...x, active: !x.active } : x))
      silentSyncAgent()
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 22, gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: '1.6rem', fontWeight: 800, color: 'white', margin: 0 }}>Team</h1>
          <p style={{ fontSize: 13, color: '#7BAED4', margin: '4px 0 0 0' }}>
            Add your team members so TalkMate knows who to transfer calls to.
          </p>
        </div>
        <button
          onClick={() => { setEditing(null); setDraftOpen(true) }}
          style={primaryBtn()}
        >+ Add team member</button>
      </div>

      {plan === 'starter' && !transferEnabled && (
        <div style={{
          marginBottom: 18, padding: '12px 16px', borderRadius: 10,
          background: 'rgba(232,98,42,0.08)', border: '1px solid rgba(232,98,42,0.30)',
          color: '#E8622A', fontSize: 13, fontWeight: 600,
        }}>
          Live call transfer is available on the Growth plan. Upgrade to activate transfers for your team.
        </div>
      )}

      {error && <div style={errorBoxStyle}>{error}</div>}

      <div style={{ background: '#0A1E38', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#071829' }}>
              {['Name', 'Role / Department', 'Phone', 'Escalation', 'Active', 'Actions'].map(h => (
                <th key={h} style={th()}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={6} style={emptyCell()}>Loading…</td></tr>
            )}
            {!loading && team.length === 0 && (
              <tr>
                <td colSpan={6} style={emptyCell()}>
                  Add your team members so TalkMate knows who to transfer calls to. Callers can ask for a
                  specific person or department and your agent will connect them.
                </td>
              </tr>
            )}
            {team.map((m, i) => (
              <tr key={m.id} style={rowStyle(i)}>
                <td style={td()}>
                  <div style={{ fontWeight: 600, color: 'white' }}>{m.name}</div>
                  {m.extension && <div style={{ fontSize: 11, color: '#7BAED4', marginTop: 2 }}>ext. {m.extension}</div>}
                </td>
                <td style={td()}>
                  <div style={{ color: 'white' }}>{m.role}</div>
                  {m.department && <div style={{ fontSize: 11, color: '#7BAED4', marginTop: 2 }}>{m.department}</div>}
                </td>
                <td style={td()}><span style={{ color: '#7BAED4' }}>{m.phone}</span></td>
                <td style={td()}>
                  {m.is_escalation_contact && (
                    <span style={badge('#E8622A')}>ESCALATION</span>
                  )}
                </td>
                <td style={td()}>
                  <button onClick={() => toggleActive(m)} style={toggleBtn(m.active)}>
                    {m.active ? 'Active' : 'Inactive'}
                  </button>
                </td>
                <td style={td()}>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={() => { setEditing(m); setDraftOpen(true) }} style={iconBtn('#4A9FE8')}>✎</button>
                    <button onClick={() => deleteMember(m.id)} style={iconBtn('#EF4444')}>✕</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {draftOpen && (
        <MemberModal
          initial={editing}
          onClose={() => { setDraftOpen(false); setEditing(null) }}
          onSaved={() => { setDraftOpen(false); setEditing(null); reload(); showToast(editing ? 'Saved' : 'Added'); silentSyncAgent() }}
        />
      )}

      {toast && (
        <div style={toastStyle}>{toast}</div>
      )}
    </div>
  )
}

function MemberModal({
  initial, onClose, onSaved,
}: {
  initial: TeamMember | null
  onClose: () => void
  onSaved: () => void
}) {
  const [draft, setDraft] = useState<MemberDraft>(initial ? {
    name: initial.name, role: initial.role, department: initial.department ?? '',
    phone: initial.phone, extension: initial.extension ?? '',
    is_escalation_contact: initial.is_escalation_contact, active: initial.active,
  } : emptyDraft)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function save() {
    setBusy(true); setErr(null)
    try {
      const url = initial ? `/api/portal/team/${initial.id}` : '/api/portal/team'
      const method = initial ? 'PATCH' : 'POST'
      const res = await fetch(url, {
        method, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Save failed')
      onSaved()
    } catch (e) {
      setErr((e as Error).message)
      setBusy(false)
    }
  }

  return (
    <ModalShell onClose={onClose}>
      <h2 style={{ fontSize: 18, fontWeight: 800, color: 'white', margin: 0, marginBottom: 16 }}>
        {initial ? 'Edit team member' : 'Add team member'}
      </h2>
      <Field label="Full name"><Input value={draft.name} onChange={v => setDraft(d => ({ ...d, name: v }))} /></Field>
      <Field label="Role"><Input value={draft.role} onChange={v => setDraft(d => ({ ...d, role: v }))} placeholder="e.g. Senior Accountant, Dispatcher" /></Field>
      <Field label="Department (optional)"><Input value={draft.department} onChange={v => setDraft(d => ({ ...d, department: v }))} placeholder="e.g. Tax, New Clients" /></Field>
      <Field label="Phone number"><Input value={draft.phone} onChange={v => setDraft(d => ({ ...d, phone: v }))} placeholder="0412 345 678" /></Field>
      <Field label="Extension (optional)"><Input value={draft.extension} onChange={v => setDraft(d => ({ ...d, extension: v }))} /></Field>

      <label style={checkboxRow}>
        <input type="checkbox" checked={draft.is_escalation_contact}
          onChange={e => setDraft(d => ({ ...d, is_escalation_contact: e.target.checked }))} />
        <div>
          <div style={{ fontWeight: 700, color: 'white', fontSize: 13 }}>Mark as escalation contact</div>
          <div style={{ fontSize: 11, color: '#7BAED4' }}>Only one escalation contact allowed per business. Setting this here replaces the current one.</div>
        </div>
      </label>

      {err && <div style={errorBoxStyle}>{err}</div>}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 18 }}>
        <button onClick={onClose} style={ghostBtn()}>Cancel</button>
        <button onClick={save} disabled={busy} style={primaryBtn()}>{busy ? 'Saving…' : 'Save'}</button>
      </div>
    </ModalShell>
  )
}

// ---------- shared atoms ----------

export function ModalShell({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
      backdropFilter: 'blur(6px)', display: 'flex',
      alignItems: 'center', justifyContent: 'center',
      zIndex: 200, padding: 20, fontFamily: 'Outfit, sans-serif',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: '#0A1E38', border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 16, padding: 26, maxWidth: 520, width: '100%',
        maxHeight: '90vh', overflowY: 'auto' as const,
        boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
      }}>
        {children}
      </div>
    </div>
  )
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'block', marginBottom: 12 }}>
      <span style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#7BAED4', textTransform: 'uppercase' as const, letterSpacing: '0.05em', marginBottom: 6 }}>{label}</span>
      {children}
    </label>
  )
}

export function Input({ value, onChange, placeholder, type = 'text' }: { value: string; onChange: (v: string) => void; placeholder?: string; type?: string }) {
  return (
    <input
      type={type}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      style={{
        width: '100%', padding: '10px 12px', borderRadius: 9,
        background: '#071829', border: '1px solid rgba(255,255,255,0.10)',
        color: 'white', fontSize: 13, fontFamily: 'Outfit, sans-serif', outline: 'none',
      }}
    />
  )
}

// ---------- styles ----------

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

function badge(color: string): React.CSSProperties {
  return {
    fontSize: 10, fontWeight: 800, letterSpacing: '0.04em',
    padding: '3px 8px', borderRadius: 99,
    background: `${color}22`, color, textTransform: 'uppercase' as const,
  }
}

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
    width: 28, height: 28, borderRadius: 7,
    background: `${color}1A`, border: `1px solid ${color}55`,
    color, cursor: 'pointer', fontSize: 13, fontWeight: 700,
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    fontFamily: 'Outfit, sans-serif',
  }
}

function primaryBtn(): React.CSSProperties {
  return {
    padding: '9px 16px', borderRadius: 9, fontSize: 13, fontWeight: 700,
    background: '#E8622A', border: 'none', color: 'white',
    cursor: 'pointer', fontFamily: 'Outfit, sans-serif',
  }
}

function ghostBtn(): React.CSSProperties {
  return {
    padding: '9px 16px', borderRadius: 9, fontSize: 13, fontWeight: 600,
    background: 'transparent', border: '1px solid rgba(255,255,255,0.15)',
    color: '#7BAED4', cursor: 'pointer', fontFamily: 'Outfit, sans-serif',
  }
}

const checkboxRow: React.CSSProperties = {
  display: 'flex', gap: 10, alignItems: 'flex-start',
  padding: 12, borderRadius: 9,
  background: '#071829', border: '1px solid rgba(255,255,255,0.06)',
  cursor: 'pointer', marginBottom: 6,
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
