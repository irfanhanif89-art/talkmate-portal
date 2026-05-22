'use client'

// Session 9 — three admin-side tabs (Team, Call Routing, Bookings)
// rendered inside the existing edit-client modal. Each one fetches from
// the corresponding /api/admin/businesses/[id]/... endpoint.
//
// These intentionally mirror the client-portal pages' shape rather than
// reusing them, because the admin endpoints return a slightly different
// envelope ({ ok, ... }) and the components live inside a modal width
// constraint.

import { useEffect, useMemo, useState } from 'react'
import type { AdminBusiness } from './types'

// ─────────────────────────── Team tab ──────────────────────────────

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

export function AdminTeamTab({ business }: { business: AdminBusiness }) {
  const [members, setMembers] = useState<TeamMember[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<TeamMember | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => { reload() }, [business.id])

  async function reload() {
    setLoading(true); setErr(null)
    try {
      const res = await fetch(`/api/admin/businesses/${business.id}/team`)
      const data = await res.json()
      if (!data.ok) throw new Error(data.error ?? 'Failed')
      setMembers(data.team ?? [])
    } catch (e) {
      setErr((e as Error).message)
    } finally { setLoading(false) }
  }

  async function delMember(id: string) {
    if (!confirm('Remove team member?')) return
    const res = await fetch(`/api/admin/businesses/${business.id}/team/${id}`, { method: 'DELETE' })
    if (res.ok) setMembers(m => m.filter(x => x.id !== id))
  }

  return (
    <div>
      <div style={headerRow}>
        <p style={muted}>{members.length} team {members.length === 1 ? 'member' : 'members'}</p>
        <button onClick={() => { setEditing(null); setCreating(true) }} style={primaryBtn}>+ Add member</button>
      </div>
      {err && <ErrBox msg={err} />}
      {loading ? <Loading /> : (
        <div style={tableWrap}>
          {members.length === 0 && <Empty>No team members yet.</Empty>}
          {members.map(m => (
            <div key={m.id} style={listRow}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, color: 'white', fontSize: 13 }}>
                  {m.name}
                  {m.is_escalation_contact && <span style={escBadge}>ESCALATION</span>}
                </div>
                <div style={{ fontSize: 11, color: '#7BAED4', marginTop: 2 }}>
                  {m.role}{m.department ? ` · ${m.department}` : ''} · {m.phone}{!m.active ? ' · inactive' : ''}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={() => setEditing(m)} style={iconBtn('#4A9FE8')}>✎</button>
                <button onClick={() => delMember(m.id)} style={iconBtn('#EF4444')}>✕</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {(creating || editing) && (
        <TeamForm
          businessId={business.id}
          initial={editing}
          onClose={() => { setCreating(false); setEditing(null) }}
          onSaved={() => { setCreating(false); setEditing(null); reload() }}
        />
      )}
    </div>
  )
}

function TeamForm({
  businessId, initial, onClose, onSaved,
}: {
  businessId: string
  initial: TeamMember | null
  onClose: () => void
  onSaved: () => void
}) {
  const [name, setName] = useState(initial?.name ?? '')
  const [role, setRole] = useState(initial?.role ?? '')
  const [department, setDepartment] = useState(initial?.department ?? '')
  const [phone, setPhone] = useState(initial?.phone ?? '')
  const [extension, setExtension] = useState(initial?.extension ?? '')
  const [isEsc, setIsEsc] = useState(initial?.is_escalation_contact ?? false)
  const [active, setActive] = useState(initial?.active ?? true)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function save() {
    setBusy(true); setErr(null)
    try {
      const url = initial
        ? `/api/admin/businesses/${businessId}/team/${initial.id}`
        : `/api/admin/businesses/${businessId}/team`
      const method = initial ? 'PATCH' : 'POST'
      const res = await fetch(url, {
        method, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name, role,
          department: department || null,
          phone,
          extension: extension || null,
          is_escalation_contact: isEsc,
          active,
        }),
      })
      const data = await res.json()
      if (!data.ok) throw new Error(data.error ?? 'Save failed')
      onSaved()
    } catch (e) {
      setErr((e as Error).message); setBusy(false)
    }
  }

  return (
    <div style={formBox}>
      <div style={{ fontSize: 13, fontWeight: 700, color: 'white', marginBottom: 12 }}>
        {initial ? 'Edit team member' : 'Add team member'}
      </div>
      <FormGrid>
        <SmallField label="Full name"><SmallInput value={name} onChange={setName} /></SmallField>
        <SmallField label="Role"><SmallInput value={role} onChange={setRole} /></SmallField>
        <SmallField label="Department"><SmallInput value={department} onChange={setDepartment} /></SmallField>
        <SmallField label="Phone"><SmallInput value={phone} onChange={setPhone} /></SmallField>
        <SmallField label="Extension"><SmallInput value={extension} onChange={setExtension} /></SmallField>
      </FormGrid>
      <div style={{ display: 'flex', gap: 16, marginTop: 8, flexWrap: 'wrap' }}>
        <label style={chkLabel}>
          <input type="checkbox" checked={isEsc} onChange={e => setIsEsc(e.target.checked)} />
          <span>Escalation contact</span>
        </label>
        <label style={chkLabel}>
          <input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} />
          <span>Active</span>
        </label>
      </div>
      {err && <ErrBox msg={err} />}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
        <button onClick={onClose} style={ghostBtn}>Cancel</button>
        <button onClick={save} disabled={busy} style={primaryBtn}>{busy ? 'Saving…' : 'Save'}</button>
      </div>
    </div>
  )
}

// ─────────────────────── Call Routing tab ──────────────────────────

interface RoutingState {
  escalation_config: Record<string, unknown>
  knowledge_base: string
  call_transfer_enabled: boolean
  plan: string
}

export function AdminCallRoutingTab({ business }: { business: AdminBusiness }) {
  const [state, setState] = useState<RoutingState | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/admin/businesses/${business.id}/escalation`)
      .then(r => r.json())
      .then(d => { if (d.ok) setState({
        escalation_config: d.escalation_config ?? {},
        knowledge_base: d.knowledge_base ?? '',
        call_transfer_enabled: !!d.call_transfer_enabled,
        plan: d.plan ?? 'starter',
      }) })
  }, [business.id])

  if (!state) return <Loading />

  const cfg = state.escalation_config as Record<string, unknown>
  const setCfg = (patch: Record<string, unknown>) => setState(s => s ? ({
    ...s, escalation_config: { ...s.escalation_config, ...patch }
  }) : s)

  async function save() {
    if (!state) return
    setBusy(true); setErr(null)
    try {
      const res = await fetch(`/api/admin/businesses/${business.id}/escalation`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          escalation_config: state.escalation_config,
          knowledge_base: state.knowledge_base,
          call_transfer_enabled: state.call_transfer_enabled,
        }),
      })
      const data = await res.json()
      if (!data.ok) throw new Error(data.error ?? 'Save failed')
      setSavedAt(new Date().toLocaleTimeString('en-AU'))
    } catch (e) {
      setErr((e as Error).message)
    } finally { setBusy(false) }
  }

  return (
    <div>
      <p style={muted}>Plan: <strong style={{ color: 'white' }}>{state.plan}</strong>. Live call transfer is{' '}
        <strong style={{ color: state.call_transfer_enabled ? '#22C55E' : '#EF4444' }}>
          {state.call_transfer_enabled ? 'enabled' : 'disabled'}
        </strong> for this client.
      </p>

      <label style={chkLabel}>
        <input
          type="checkbox"
          checked={state.call_transfer_enabled}
          onChange={e => setState(s => s ? { ...s, call_transfer_enabled: e.target.checked } : s)}
        />
        <span>Enable live call transfer</span>
      </label>

      <SmallField label="Wait time (minutes)">
        <SmallInput
          type="number"
          value={String(typeof cfg.wait_time_minutes === 'number' ? cfg.wait_time_minutes : 0)}
          onChange={v => setCfg({ wait_time_minutes: Number(v) || 0 })}
        />
      </SmallField>

      <SmallField label="Emergency keywords (one per line)">
        <textarea
          rows={4}
          value={Array.isArray(cfg.emergency_keywords) ? (cfg.emergency_keywords as string[]).join('\n') : ''}
          onChange={e => setCfg({ emergency_keywords: e.target.value.split('\n').map(s => s.trim()).filter(Boolean) })}
          style={taStyle}
        />
      </SmallField>

      <SmallField label="Knowledge base / FAQs">
        <textarea
          rows={6}
          value={state.knowledge_base}
          onChange={e => setState(s => s ? { ...s, knowledge_base: e.target.value } : s)}
          style={taStyle}
        />
      </SmallField>

      {err && <ErrBox msg={err} />}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
        <span style={{ fontSize: 11, color: '#22C55E' }}>{savedAt ? `Saved ${savedAt}` : ''}</span>
        <button onClick={save} disabled={busy} style={primaryBtn}>{busy ? 'Saving…' : 'Save'}</button>
      </div>
    </div>
  )
}

// ─────────────────────── Bookings tab ──────────────────────────────

interface AdminBooking {
  id: string
  caller_name: string | null
  caller_phone: string
  truck_type: string | null
  description: string | null
  scheduled_start: string | null
  status: string
  created_at: string
}

interface AdminCallback {
  id: string
  caller_name: string | null
  caller_phone: string
  reason: string | null
  status: string
  preferred_callback_time: string | null
  created_at: string
}

export function AdminBookingsTab({ business }: { business: AdminBusiness }) {
  const [bookings, setBookings] = useState<AdminBooking[]>([])
  const [callbacks, setCallbacks] = useState<AdminCallback[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)

  useEffect(() => { reload() }, [business.id])
  async function reload() {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/businesses/${business.id}/bookings`)
      const data = await res.json()
      if (data.ok) {
        setBookings(data.bookings ?? [])
        setCallbacks(data.callbacks ?? [])
      }
    } finally { setLoading(false) }
  }

  async function setStatus(b: AdminBooking, status: string) {
    setBusy(b.id)
    try {
      const res = await fetch(`/api/admin/businesses/${business.id}/bookings/${b.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      if (res.ok) setBookings(bs => bs.map(x => x.id === b.id ? { ...x, status } : x))
    } finally { setBusy(null) }
  }

  const pendingBookings = useMemo(() => bookings.filter(b => b.status === 'pending'), [bookings])
  const otherBookings = useMemo(() => bookings.filter(b => b.status !== 'pending'), [bookings])

  if (loading) return <Loading />

  return (
    <div>
      <SectionTitle>Pending bookings ({pendingBookings.length})</SectionTitle>
      {pendingBookings.length === 0 && <Empty>No pending bookings.</Empty>}
      {pendingBookings.map(b => (
        <div key={b.id} style={listRow}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 600, color: 'white', fontSize: 13 }}>{b.caller_name ?? 'Unknown'}</div>
            <div style={{ fontSize: 11, color: '#7BAED4', marginTop: 2 }}>
              {b.caller_phone} · {b.truck_type ?? b.description ?? '—'}
              {b.scheduled_start && ` · ${new Date(b.scheduled_start).toLocaleString('en-AU', {
                day: 'numeric', month: 'short',
                hour: '2-digit', minute: '2-digit',
              })}`}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={() => setStatus(b, 'confirmed')} disabled={busy === b.id} style={smallBtn('#22C55E')}>Confirm</button>
            <button onClick={() => setStatus(b, 'cancelled')} disabled={busy === b.id} style={smallBtn('#EF4444', true)}>Cancel</button>
          </div>
        </div>
      ))}

      {otherBookings.length > 0 && (
        <>
          <SectionTitle>Other bookings ({otherBookings.length})</SectionTitle>
          {otherBookings.map(b => (
            <div key={b.id} style={listRow}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, color: 'white', fontSize: 13 }}>{b.caller_name ?? 'Unknown'}</div>
                <div style={{ fontSize: 11, color: '#7BAED4', marginTop: 2 }}>
                  {b.caller_phone} · {b.truck_type ?? b.description ?? '—'} · {b.status}
                </div>
              </div>
            </div>
          ))}
        </>
      )}

      <SectionTitle>Callbacks ({callbacks.length})</SectionTitle>
      {callbacks.length === 0 && <Empty>No callback requests.</Empty>}
      {callbacks.map(c => (
        <div key={c.id} style={listRow}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 600, color: 'white', fontSize: 13 }}>{c.caller_name ?? 'Unknown'}</div>
            <div style={{ fontSize: 11, color: '#7BAED4', marginTop: 2 }}>
              {c.caller_phone} · {c.reason ?? '—'} · {c.status}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

// ─────────────────────── tiny atoms ────────────────────────────────

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h4 style={{ fontSize: 11, fontWeight: 700, color: '#7BAED4', textTransform: 'uppercase' as const, letterSpacing: '0.06em', margin: '14px 0 8px 0' }}>{children}</h4>
}
function Loading() { return <p style={muted}>Loading…</p> }
function Empty({ children }: { children: React.ReactNode }) {
  return <p style={{ ...muted, fontStyle: 'italic' as const }}>{children}</p>
}
function ErrBox({ msg }: { msg: string }) {
  return <div style={{ padding: '8px 12px', background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.35)', borderRadius: 8, color: '#FCA5A5', fontSize: 12, marginTop: 8 }}>{msg}</div>
}
function FormGrid({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>{children}</div>
}
function SmallField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'block', marginBottom: 8 }}>
      <span style={{ display: 'block', fontSize: 10, fontWeight: 700, color: '#7BAED4', textTransform: 'uppercase' as const, letterSpacing: '0.05em', marginBottom: 4 }}>{label}</span>
      {children}
    </label>
  )
}
function SmallInput({ value, onChange, type = 'text' }: { value: string; onChange: (v: string) => void; type?: string }) {
  return <input type={type} value={value} onChange={e => onChange(e.target.value)} style={{ width: '100%', padding: '8px 10px', borderRadius: 7, background: '#071829', border: '1px solid rgba(255,255,255,0.10)', color: 'white', fontSize: 12, fontFamily: 'Outfit, sans-serif', outline: 'none' }} />
}

// shared styles
const muted: React.CSSProperties = { fontSize: 12, color: '#7BAED4', margin: 0, marginBottom: 10 }
const headerRow: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }
const tableWrap: React.CSSProperties = { background: '#071829', borderRadius: 9, border: '1px solid rgba(255,255,255,0.05)' }
const listRow: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.04)' }
const primaryBtn: React.CSSProperties = { padding: '7px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700, background: '#E8622A', border: 'none', color: 'white', cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }
const ghostBtn: React.CSSProperties = { padding: '7px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600, background: 'transparent', border: '1px solid rgba(255,255,255,0.15)', color: '#7BAED4', cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }
function smallBtn(color: string, subtle = false): React.CSSProperties {
  return { padding: '5px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700, background: subtle ? 'transparent' : color, border: `1px solid ${color}`, color: subtle ? color : 'white', cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }
}
function iconBtn(color: string): React.CSSProperties {
  return { width: 26, height: 26, borderRadius: 6, background: `${color}1A`, border: `1px solid ${color}55`, color, cursor: 'pointer', fontSize: 12, fontWeight: 700, display: 'inline-flex' as const, alignItems: 'center' as const, justifyContent: 'center' as const, fontFamily: 'Outfit, sans-serif' }
}
const chkLabel: React.CSSProperties = { display: 'inline-flex', gap: 8, alignItems: 'center', fontSize: 12, color: 'white', cursor: 'pointer', padding: '6px 10px', background: '#071829', borderRadius: 7, border: '1px solid rgba(255,255,255,0.05)' }
const escBadge: React.CSSProperties = { fontSize: 9, fontWeight: 800, letterSpacing: '0.04em', padding: '2px 6px', borderRadius: 99, background: 'rgba(232,98,42,0.22)', color: '#E8622A', marginLeft: 8, textTransform: 'uppercase' as const }
const formBox: React.CSSProperties = { marginTop: 12, padding: 14, borderRadius: 10, background: '#071829', border: '1px solid rgba(232,98,42,0.30)' }
const taStyle: React.CSSProperties = { width: '100%', padding: '8px 10px', borderRadius: 7, background: '#071829', border: '1px solid rgba(255,255,255,0.10)', color: 'white', fontSize: 12, fontFamily: 'Outfit, sans-serif', outline: 'none', resize: 'vertical' as const }
