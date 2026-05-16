'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import SyncAgentButton, { silentSyncAgent } from '@/components/portal/sync-agent-button'

// Session 15 — Accounts + VIP Callers shared page.
// Accounts (trade/company clients with linked numbers) live in
// vip_callers where account_type='account'. VIP bypass callers
// (personal contacts, direct transfer) live in the same table where
// account_type='vip' AND vip_bypass=true. They share the table because
// check_caller needs to match an inbound phone against both shapes in
// one query.

type Tab = 'accounts' | 'vip'

interface LinkedNumber {
  phone: string
  name?: string | null
  is_primary?: boolean
}

interface Account {
  id: string
  company_name: string | null
  abn: string | null
  billing_contact_name: string | null
  billing_contact_email: string | null
  linked_numbers: LinkedNumber[]
  active: boolean
}

interface Vip {
  id: string
  phone: string
  name: string | null
  note: string | null
  action: 'transfer_escalation' | 'transfer_to_member' | 'take_message' | 'skip_queue'
  transfer_to_member_id: string | null
  active: boolean
  vip_bypass: boolean
}

interface VipViewProps {
  plan: string
  transferEnabled: boolean
  hasAgent?: boolean
  initialLastSyncedAt?: string | null
  adminClientId?: string | null
}

export default function VipView(props: VipViewProps) {
  const router = useRouter()
  const params = useSearchParams()
  const tabParam = params.get('tab')
  const initialTab: Tab = tabParam === 'vip' ? 'vip' : 'accounts'
  const [tab, setTab] = useState<Tab>(initialTab)
  const [toast, setToast] = useState<string | null>(null)

  function showToast(m: string) { setToast(m); setTimeout(() => setToast(null), 3000) }

  function selectTab(next: Tab) {
    setTab(next)
    const search = new URLSearchParams(params.toString())
    search.set('tab', next)
    router.replace(`?${search.toString()}`, { scroll: false })
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 22, gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: '1.6rem', fontWeight: 800, color: 'white', margin: 0 }}>VIP Callers</h1>
          <p style={{ fontSize: 13, color: '#7BAED4', margin: '4px 0 0 0' }}>
            Accounts and direct-transfer VIPs. Inbound calls are matched to either.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <SyncAgentButton
            hasAgent={props.hasAgent ?? true}
            initialLastSyncedAt={props.initialLastSyncedAt ?? null}
            adminClientId={props.adminClientId}
          />
        </div>
      </div>

      <div style={tabBarStyle}>
        <TabButton active={tab === 'accounts'} onClick={() => selectTab('accounts')}>Accounts</TabButton>
        <TabButton active={tab === 'vip'} onClick={() => selectTab('vip')}>VIP Callers</TabButton>
      </div>

      {tab === 'accounts' && (
        <AccountsTab
          adminClientId={props.adminClientId}
          onToast={showToast}
        />
      )}
      {tab === 'vip' && (
        <VipsTab
          plan={props.plan}
          transferEnabled={props.transferEnabled}
          adminClientId={props.adminClientId}
          onToast={showToast}
        />
      )}

      {toast && <div style={toastStyle}>{toast}</div>}
    </div>
  )
}

// ─── ACCOUNTS TAB ───────────────────────────────────────────────────

function AccountsTab({ adminClientId, onToast }: { adminClientId?: string | null; onToast: (m: string) => void }) {
  const base = adminClientId
    ? `/api/admin/businesses/${adminClientId}/accounts`
    : '/api/portal/accounts'

  const [list, setList] = useState<Account[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<Account | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [historyAccount, setHistoryAccount] = useState<Account | null>(null)

  useEffect(() => { reload() }, [adminClientId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function reload() {
    setLoading(true)
    try {
      const res = await fetch(base)
      if (res.ok) {
        const d = await res.json()
        setList((d.accounts ?? []) as Account[])
      }
    } finally { setLoading(false) }
  }

  async function toggleActive(a: Account) {
    const res = await fetch(`${base}/${a.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: !a.active }),
    })
    if (res.ok) {
      setList(l => l.map(x => x.id === a.id ? { ...x, active: !x.active } : x))
      silentSyncAgent(adminClientId ?? null)
    }
  }

  async function deleteAccount(a: Account) {
    if (!confirm(`Remove account "${a.company_name ?? 'this account'}"?`)) return
    const res = await fetch(`${base}/${a.id}`, { method: 'DELETE' })
    if (res.ok) {
      setList(l => l.filter(x => x.id !== a.id))
      onToast('Account removed')
      silentSyncAgent(adminClientId ?? null)
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 800, color: 'white', margin: 0 }}>Accounts</h2>
          <p style={{ fontSize: 12, color: '#7BAED4', margin: '4px 0 0 0' }}>
            Trade and account clients. Jobs are automatically billed to the account holder.
          </p>
        </div>
        <button onClick={() => { setEditing(null); setDrawerOpen(true) }} style={primaryBtn()}>+ Add Account</button>
      </div>

      {loading && <div style={{ color: '#7BAED4', padding: 16 }}>Loading…</div>}
      {!loading && list.length === 0 && (
        <div style={emptyCardStyle}>
          No accounts yet. Add your trade clients to automatically apply account rates when they call.
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))', gap: 14 }}>
        {list.map(a => (
          <AccountCard
            key={a.id}
            account={a}
            onEdit={() => { setEditing(a); setDrawerOpen(true) }}
            onHistory={() => setHistoryAccount(a)}
            onToggle={() => toggleActive(a)}
            onDelete={() => deleteAccount(a)}
          />
        ))}
      </div>

      {drawerOpen && (
        <AccountModal
          initial={editing}
          baseUrl={base}
          onClose={() => { setDrawerOpen(false); setEditing(null) }}
          onSaved={() => {
            setDrawerOpen(false); setEditing(null); reload()
            onToast(editing ? 'Account saved' : 'Account added')
            silentSyncAgent(adminClientId ?? null)
          }}
        />
      )}

      {historyAccount && (
        <AccountHistoryDrawer
          account={historyAccount}
          baseUrl={base}
          onClose={() => setHistoryAccount(null)}
        />
      )}
    </div>
  )
}

function AccountCard({ account, onEdit, onHistory, onToggle, onDelete }: {
  account: Account
  onEdit: () => void
  onHistory: () => void
  onToggle: () => void
  onDelete: () => void
}) {
  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: 'white', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>
            {account.company_name ?? '—'}
          </div>
          {account.abn && (
            <div style={{ fontSize: 11, color: '#7BAED4', marginTop: 2 }}>ABN {account.abn}</div>
          )}
        </div>
        <button onClick={onToggle} style={toggleBtn(account.active)}>{account.active ? 'Active' : 'Inactive'}</button>
      </div>

      {(account.billing_contact_name || account.billing_contact_email) && (
        <div style={{ fontSize: 12, color: '#C8D8EA', marginBottom: 10 }}>
          {account.billing_contact_name ?? ''}
          {account.billing_contact_name && account.billing_contact_email ? ' · ' : ''}
          {account.billing_contact_email ?? ''}
        </div>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 6, marginBottom: 14 }}>
        {(account.linked_numbers ?? []).map((n, i) => (
          <span key={i} style={chipStyle(n.is_primary === true)}>
            {n.name ? `${n.name} ` : ''}{n.phone}
          </span>
        ))}
        {(account.linked_numbers ?? []).length === 0 && (
          <span style={{ fontSize: 11, color: '#7BAED4' }}>No linked numbers yet</span>
        )}
      </div>

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button onClick={onHistory} style={ghostBtn()}>View history</button>
        <button onClick={onEdit} style={ghostBtn()}>Edit</button>
        <button onClick={onDelete} style={dangerBtn()}>Remove</button>
      </div>
    </div>
  )
}

function AccountModal({ initial, baseUrl, onClose, onSaved }: {
  initial: Account | null
  baseUrl: string
  onClose: () => void
  onSaved: () => void
}) {
  const [companyName, setCompanyName] = useState(initial?.company_name ?? '')
  const [abn, setAbn] = useState(initial?.abn ?? '')
  const [billingName, setBillingName] = useState(initial?.billing_contact_name ?? '')
  const [billingEmail, setBillingEmail] = useState(initial?.billing_contact_email ?? '')
  const [linked, setLinked] = useState<LinkedNumber[]>(
    initial?.linked_numbers && initial.linked_numbers.length > 0
      ? initial.linked_numbers
      : [{ phone: '', name: '', is_primary: true }],
  )
  const [active, setActive] = useState(initial?.active ?? true)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  function updateNumber(i: number, patch: Partial<LinkedNumber>) {
    setLinked(arr => arr.map((n, idx) => idx === i ? { ...n, ...patch } : n))
  }
  function setPrimary(i: number) {
    setLinked(arr => arr.map((n, idx) => ({ ...n, is_primary: idx === i })))
  }
  function removeNumber(i: number) {
    setLinked(arr => arr.length === 1 ? arr : arr.filter((_, idx) => idx !== i))
  }
  function addNumber() {
    setLinked(arr => [...arr, { phone: '', name: '', is_primary: false }])
  }

  async function save() {
    setBusy(true); setErr(null)
    try {
      const url = initial ? `${baseUrl}/${initial.id}` : baseUrl
      const method = initial ? 'PATCH' : 'POST'
      const payload = {
        company_name: companyName,
        abn,
        billing_contact_name: billingName,
        billing_contact_email: billingEmail,
        linked_numbers: linked.filter(n => n.phone.trim()),
        active,
      }
      const res = await fetch(url, {
        method, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
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
        {initial ? 'Edit account' : 'Add account'}
      </h2>
      <Field label="Company name"><Input value={companyName} onChange={setCompanyName} placeholder="e.g. AAA Smash Repairs" /></Field>
      <Field label="ABN (optional)"><Input value={abn} onChange={setAbn} placeholder="11 digit ABN" /></Field>
      <Field label="Billing contact name"><Input value={billingName} onChange={setBillingName} placeholder="Who do we invoice?" /></Field>
      <Field label="Billing contact email"><Input value={billingEmail} onChange={setBillingEmail} placeholder="billing@company.com.au" /></Field>

      <div style={{ marginTop: 4, marginBottom: 14 }}>
        <span style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#7BAED4', textTransform: 'uppercase' as const, letterSpacing: '0.05em', marginBottom: 8 }}>Linked phone numbers</span>
        {linked.map((n, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto auto', gap: 8, marginBottom: 8, alignItems: 'center' }}>
            <input value={n.phone} onChange={e => updateNumber(i, { phone: e.target.value })} placeholder="0412 345 678" style={inputStyle} />
            <input value={n.name ?? ''} onChange={e => updateNumber(i, { name: e.target.value })} placeholder="Label (e.g. Dave — driver)" style={inputStyle} />
            <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center', fontSize: 11, color: '#7BAED4', cursor: 'pointer' }}>
              <input type="radio" name="primary-number" checked={n.is_primary === true} onChange={() => setPrimary(i)} />
              Primary
            </label>
            <button type="button" onClick={() => removeNumber(i)} style={iconBtn('#EF4444')}>✕</button>
          </div>
        ))}
        <button type="button" onClick={addNumber} style={{ ...ghostBtn(), marginTop: 4 }}>+ Add another number</button>
      </div>

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

interface HistoryJob {
  id: string
  scheduled_start: string | null
  description: string | null
  pickup_address: string | null
  dropoff_address: string | null
  truck_type: string | null
  status: string
  estimated_value: number | null
}
interface HistoryCall {
  id: string
  caller_phone: string
  outcome: string | null
  duration_seconds: number | null
  summary: string | null
  started_at: string | null
  created_at: string
}

function AccountHistoryDrawer({ account, baseUrl, onClose }: {
  account: Account
  baseUrl: string
  onClose: () => void
}) {
  const [tab, setTab] = useState<'jobs' | 'calls'>('jobs')
  const [jobs, setJobs] = useState<HistoryJob[]>([])
  const [calls, setCalls] = useState<HistoryCall[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      try {
        const res = await fetch(`${baseUrl}/${account.id}/history`)
        if (!cancelled && res.ok) {
          const d = await res.json()
          setJobs((d.jobs ?? []) as HistoryJob[])
          setCalls((d.calls ?? []) as HistoryCall[])
        }
      } finally { if (!cancelled) setLoading(false) }
    }
    load()
    return () => { cancelled = true }
  }, [account.id, baseUrl])

  return (
    <div onClick={onClose} style={{ position: 'fixed' as const, inset: 0, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)', zIndex: 200 }}>
      <aside onClick={e => e.stopPropagation()} style={{ position: 'fixed' as const, top: 0, bottom: 0, right: 0, width: 560, maxWidth: '95vw', background: '#0A1E38', borderLeft: '1px solid rgba(255,255,255,0.06)', boxShadow: '-20px 0 40px rgba(0,0,0,0.4)', padding: 24, overflowY: 'auto' as const, fontFamily: 'Outfit, sans-serif' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <h2 style={{ fontSize: 18, fontWeight: 800, color: 'white', margin: 0 }}>{account.company_name ?? 'Account'} history</h2>
          <button onClick={onClose} style={ghostBtn()}>Close</button>
        </div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <TabButton active={tab === 'jobs'} onClick={() => setTab('jobs')}>Jobs</TabButton>
          <TabButton active={tab === 'calls'} onClick={() => setTab('calls')}>Calls</TabButton>
        </div>

        {loading && <div style={{ color: '#7BAED4' }}>Loading…</div>}
        {!loading && tab === 'jobs' && (
          <div>
            {jobs.length === 0 && <div style={{ color: '#7BAED4' }}>No jobs yet for this account.</div>}
            {jobs.map(j => (
              <div key={j.id} style={historyRow}>
                <div style={{ fontSize: 12, color: '#7BAED4', marginBottom: 4 }}>{j.scheduled_start ? new Date(j.scheduled_start).toLocaleString('en-AU') : '—'}</div>
                <div style={{ fontWeight: 700, color: 'white', marginBottom: 4 }}>{j.description ?? 'Job'}</div>
                <div style={{ fontSize: 12, color: '#C8D8EA' }}>
                  {(j.pickup_address ?? '—')} → {(j.dropoff_address ?? '—')}
                </div>
                <div style={{ display: 'flex', gap: 10, fontSize: 11, color: '#7BAED4', marginTop: 6 }}>
                  <span>{j.truck_type ?? '—'}</span>
                  <span style={{ textTransform: 'capitalize' as const }}>{j.status}</span>
                  {j.estimated_value != null && <span style={{ color: '#22C55E', fontWeight: 700 }}>${j.estimated_value}</span>}
                </div>
              </div>
            ))}
          </div>
        )}
        {!loading && tab === 'calls' && (
          <div>
            {calls.length === 0 && <div style={{ color: '#7BAED4' }}>No calls yet from linked numbers.</div>}
            {calls.map(c => (
              <div key={c.id} style={historyRow}>
                <div style={{ fontSize: 12, color: '#7BAED4', marginBottom: 4 }}>{c.started_at ? new Date(c.started_at).toLocaleString('en-AU') : new Date(c.created_at).toLocaleString('en-AU')}</div>
                <div style={{ fontWeight: 700, color: 'white', marginBottom: 4 }}>{c.caller_phone}</div>
                <div style={{ fontSize: 12, color: '#C8D8EA' }}>{c.summary ?? '—'}</div>
                <div style={{ display: 'flex', gap: 10, fontSize: 11, color: '#7BAED4', marginTop: 6 }}>
                  <span>{c.outcome ?? '—'}</span>
                  {c.duration_seconds != null && <span>{Math.round(c.duration_seconds / 60)} min</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </aside>
    </div>
  )
}

// ─── VIP TAB ────────────────────────────────────────────────────────

const ACTION_LABELS: Record<Vip['action'], string> = {
  transfer_escalation: 'Direct transfer (default)',
  transfer_to_member: 'Direct transfer to a team member',
  take_message: 'Take message (priority)',
  skip_queue: 'Skip queue',
}

function VipsTab({ plan, transferEnabled, adminClientId, onToast }: {
  plan: string
  transferEnabled: boolean
  adminClientId?: string | null
  onToast: (m: string) => void
}) {
  const base = adminClientId
    ? `/api/admin/businesses/${adminClientId}/vip-callers`
    : '/api/portal/vip-callers'
  const teamBase = adminClientId
    ? `/api/admin/businesses/${adminClientId}/team`
    : '/api/portal/team'

  const [list, setList] = useState<Vip[]>([])
  const [team, setTeam] = useState<Array<{ id: string; name: string; role: string }>>([])
  const [loading, setLoading] = useState(true)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [editing, setEditing] = useState<Vip | null>(null)

  useEffect(() => { reload() }, [adminClientId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function reload() {
    setLoading(true)
    try {
      const [vipRes, teamRes] = await Promise.all([fetch(base), fetch(teamBase)])
      if (vipRes.ok) { const d = await vipRes.json(); setList((d.callers ?? []) as Vip[]) }
      if (teamRes.ok) { const d = await teamRes.json(); setTeam(d.team ?? []) }
    } finally { setLoading(false) }
  }

  async function deleteVip(id: string) {
    if (!confirm('Remove this VIP caller?')) return
    const res = await fetch(`${base}/${id}`, { method: 'DELETE' })
    if (res.ok) {
      setList(l => l.filter(x => x.id !== id))
      onToast('VIP removed')
      silentSyncAgent(adminClientId ?? null)
    }
  }

  async function toggleActive(v: Vip) {
    const res = await fetch(`${base}/${v.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: !v.active }),
    })
    if (res.ok) {
      setList(l => l.map(x => x.id === v.id ? { ...x, active: !x.active } : x))
      silentSyncAgent(adminClientId ?? null)
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 800, color: 'white', margin: 0 }}>VIP Callers</h2>
          <p style={{ fontSize: 12, color: '#7BAED4', margin: '4px 0 0 0' }}>
            Personal contacts who bypass the agent and connect directly to you. Family, friends, key people.
          </p>
        </div>
        <button onClick={() => { setEditing(null); setDrawerOpen(true) }} style={primaryBtn()}>+ Add VIP</button>
      </div>

      {plan === 'starter' && !transferEnabled && (
        <div style={noticeStyle}>
          Live call transfer is available on the Growth plan. VIP callers still get logged so you can review them.
        </div>
      )}

      <div style={tableWrap}>
        <table style={{ width: '100%', borderCollapse: 'collapse' as const }}>
          <thead>
            <tr style={{ background: '#071829' }}>
              {['Name', 'Phone', 'Note', 'Bypass', 'Active', 'Actions'].map(h =>
                <th key={h} style={th()}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={6} style={emptyCell()}>Loading…</td></tr>}
            {!loading && list.length === 0 && (
              <tr><td colSpan={6} style={emptyCell()}>
                No VIP callers yet. Add personal contacts to connect them directly to you, bypassing the agent.
              </td></tr>
            )}
            {list.map((v, i) => (
              <tr key={v.id} style={rowStyle(i)}>
                <td style={td()}><div style={{ fontWeight: 600, color: 'white' }}>{v.name ?? '—'}</div></td>
                <td style={td()}><span style={{ color: '#7BAED4' }}>{v.phone}</span></td>
                <td style={td()}><span style={{ color: '#7BAED4' }}>{v.note ?? '—'}</span></td>
                <td style={td()}>
                  {v.vip_bypass ? (
                    <span style={bypassBadge}>Direct Transfer</span>
                  ) : (
                    <span style={{ fontSize: 12, color: '#7BAED4' }}>{ACTION_LABELS[v.action]}</span>
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
          baseUrl={base}
          onClose={() => { setDrawerOpen(false); setEditing(null) }}
          onSaved={() => { setDrawerOpen(false); setEditing(null); reload(); onToast(editing ? 'Saved' : 'Added'); silentSyncAgent(adminClientId ?? null) }}
        />
      )}
    </div>
  )
}

function VipModal({ initial, team, baseUrl, onClose, onSaved }: {
  initial: Vip | null
  team: Array<{ id: string; name: string; role: string }>
  baseUrl: string
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
      const url = initial ? `${baseUrl}/${initial.id}` : baseUrl
      const method = initial ? 'PATCH' : 'POST'
      const body: Record<string, unknown> = { phone, name, note, action, active, vip_bypass: true }
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
      <h2 style={{ fontSize: 18, fontWeight: 800, color: 'white', margin: 0, marginBottom: 6 }}>
        {initial ? 'Edit VIP caller' : 'Add VIP caller'}
      </h2>
      <div style={infoBannerStyle}>
        This number will bypass the agent and transfer directly to your phone. If you do not answer twice, the agent will take a message.
      </div>
      <Field label="Name"><Input value={name} onChange={setName} placeholder="e.g. Mum, Wife Sarah" /></Field>
      <Field label="Phone number"><Input value={phone} onChange={setPhone} placeholder="0412 345 678" /></Field>
      <Field label="Note (optional)"><Input value={note} onChange={setNote} placeholder="Relationship or context" /></Field>
      <Field label="If you do not answer">
        <select value={action} onChange={e => setAction(e.target.value as Vip['action'])} style={selectStyle}>
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

// ─── styled atoms ───────────────────────────────────────────────────

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} style={{
      padding: '10px 18px', borderRadius: 9, fontSize: 13, fontWeight: 700,
      background: active ? 'white' : 'transparent', color: active ? '#061322' : '#7BAED4',
      border: 'none', cursor: 'pointer', fontFamily: 'Outfit, sans-serif',
    }}>{children}</button>
  )
}

function ModalShell({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div onClick={onClose} style={{
      position: 'fixed' as const, inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(6px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 20,
      fontFamily: 'Outfit, sans-serif',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: '#0A1E38', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16,
        padding: 26, maxWidth: 560, width: '100%', maxHeight: '90vh', overflowY: 'auto' as const,
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
    <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} style={inputStyle} />
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 12px', borderRadius: 9, background: '#071829',
  border: '1px solid rgba(255,255,255,0.10)', color: 'white', fontSize: 13,
  fontFamily: 'Outfit, sans-serif', outline: 'none', boxSizing: 'border-box' as const,
}
const selectStyle: React.CSSProperties = {
  width: '100%', padding: '10px 12px', borderRadius: 9, background: '#071829',
  border: '1px solid rgba(255,255,255,0.10)', color: 'white', fontSize: 13,
  fontFamily: 'Outfit, sans-serif', cursor: 'pointer',
}
const tabBarStyle: React.CSSProperties = {
  display: 'flex', gap: 4, padding: 4, background: 'rgba(255,255,255,0.04)',
  borderRadius: 12, width: 'fit-content', marginBottom: 22,
}
const cardStyle: React.CSSProperties = {
  background: '#0A1E38', border: '1px solid rgba(255,255,255,0.07)',
  borderRadius: 14, padding: 18,
}
const emptyCardStyle: React.CSSProperties = {
  padding: '32px 24px', background: '#0A1E38', border: '1px dashed rgba(255,255,255,0.08)',
  borderRadius: 14, textAlign: 'center' as const, color: '#7BAED4', fontSize: 13,
}
const tableWrap: React.CSSProperties = {
  background: '#0A1E38', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, overflow: 'auto' as const,
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
    padding: '8px 14px', borderRadius: 9, fontSize: 12, fontWeight: 600,
    background: 'transparent', border: '1px solid rgba(255,255,255,0.15)',
    color: '#7BAED4', cursor: 'pointer', fontFamily: 'Outfit, sans-serif',
  }
}
function dangerBtn(): React.CSSProperties {
  return {
    padding: '8px 14px', borderRadius: 9, fontSize: 12, fontWeight: 600,
    background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
    color: '#EF4444', cursor: 'pointer', fontFamily: 'Outfit, sans-serif',
  }
}
function chipStyle(primary: boolean): React.CSSProperties {
  return {
    display: 'inline-flex' as const, padding: '4px 10px',
    background: primary ? 'rgba(232,98,42,0.15)' : 'rgba(74,159,232,0.12)',
    color: primary ? '#E8622A' : '#4A9FE8',
    borderRadius: 99, fontSize: 11, fontWeight: 700,
  }
}
const bypassBadge: React.CSSProperties = {
  display: 'inline-flex' as const, padding: '4px 10px',
  background: 'rgba(34,197,94,0.15)', color: '#22C55E',
  borderRadius: 99, fontSize: 11, fontWeight: 700,
  letterSpacing: '0.02em',
}
const noticeStyle: React.CSSProperties = {
  marginBottom: 18, padding: '12px 16px', borderRadius: 10,
  background: 'rgba(232,98,42,0.08)', border: '1px solid rgba(232,98,42,0.30)',
  color: '#E8622A', fontSize: 13, fontWeight: 600,
}
const infoBannerStyle: React.CSSProperties = {
  padding: '12px 14px', marginBottom: 14, borderRadius: 10,
  background: 'rgba(74,159,232,0.08)', border: '1px solid rgba(74,159,232,0.3)',
  color: '#4A9FE8', fontSize: 12, lineHeight: 1.5,
}
const checkboxRow: React.CSSProperties = {
  display: 'flex' as const, gap: 10, alignItems: 'center' as const,
  padding: 12, borderRadius: 9, background: '#071829',
  border: '1px solid rgba(255,255,255,0.06)', cursor: 'pointer', marginBottom: 6,
}
const errorBoxStyle: React.CSSProperties = {
  marginTop: 10, padding: '10px 14px', borderRadius: 9,
  background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.35)',
  color: '#FCA5A5', fontSize: 13,
}
const toastStyle: React.CSSProperties = {
  position: 'fixed' as const, bottom: 24, right: 24, zIndex: 100,
  padding: '12px 18px', background: '#0A1E38',
  border: '1px solid rgba(34,197,94,0.4)', borderRadius: 10,
  color: '#22C55E', fontSize: 13, fontWeight: 600,
  boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
}
const historyRow: React.CSSProperties = {
  background: '#071829', border: '1px solid rgba(255,255,255,0.06)',
  borderRadius: 10, padding: 14, marginBottom: 10,
}
