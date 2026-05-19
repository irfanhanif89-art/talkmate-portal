'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  AUTO_CHECK_KEYS, AUTO_CHECK_LABELS, AUTO_CHECK_REMEDIES,
  MANUAL_CHECK_KEYS, MANUAL_CHECK_LABELS,
  type AutoCheckKey, type AutoCheckResult, type ManualCheckKey,
} from '@/lib/golive-checks'

// Session 20 — interactive Go-Live checklist UI. The parent server page
// has already computed auto checks and upserted them; we render that
// state and PATCH manual toggles on the fly.

interface ChecklistRow {
  notes: string | null
  verified_at: string | null
  verified_by: string | null
  updated_at: string
  [key: string]: unknown
}

interface Props {
  businessId: string
  businessName: string
  plan: string | null
  accountStatus: string | null
  initialChecklist: ChecklistRow | null
  initialAutoResult: AutoCheckResult
}

const TOTAL_AUTO = AUTO_CHECK_KEYS.length
const TOTAL_MANUAL = MANUAL_CHECK_KEYS.length

export default function GoLiveChecklistView({
  businessId, businessName, plan, accountStatus,
  initialChecklist, initialAutoResult,
}: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  // Local checklist mirror so toggles render instantly. PATCH responses
  // overwrite this with the canonical row.
  const [checklist, setChecklist] = useState<ChecklistRow>(() => ({
    notes: initialChecklist?.notes ?? '',
    verified_at: initialChecklist?.verified_at ?? null,
    verified_by: initialChecklist?.verified_by ?? null,
    updated_at: initialChecklist?.updated_at ?? new Date().toISOString(),
    ...Object.fromEntries(AUTO_CHECK_KEYS.map(k => [k, initialAutoResult[k] === true])),
    ...Object.fromEntries(MANUAL_CHECK_KEYS.map(k => [k, initialChecklist?.[k] === true])),
  }))

  const [notes, setNotes] = useState<string>((initialChecklist?.notes as string | null) ?? '')
  const [saving, setSaving] = useState<string | null>(null)
  const [resetting, setResetting] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  const autoPass = useMemo(
    () => AUTO_CHECK_KEYS.reduce((n, k) => n + (checklist[k] === true ? 1 : 0), 0),
    [checklist],
  )
  const manualPass = useMemo(
    () => MANUAL_CHECK_KEYS.reduce((n, k) => n + (checklist[k] === true ? 1 : 0), 0),
    [checklist],
  )
  const totalPass = autoPass + manualPass
  const totalChecks = TOTAL_AUTO + TOTAL_MANUAL
  const pct = Math.round((totalPass / totalChecks) * 100)

  const isVerified = autoPass === TOTAL_AUTO && manualPass === TOTAL_MANUAL
  const overallBadge = isVerified
    ? { label: 'Verified', color: '#22C55E', bg: 'rgba(34,197,94,0.14)' }
    : totalPass > 0
      ? { label: 'Partially complete', color: '#F59E0B', bg: 'rgba(245,158,11,0.14)' }
      : { label: 'Not verified', color: '#EF4444', bg: 'rgba(239,68,68,0.14)' }

  const failingAutoKeys = AUTO_CHECK_KEYS.filter(k => checklist[k] !== true)

  async function patchManual(key: ManualCheckKey, value: boolean) {
    setSaving(key)
    setChecklist(c => ({ ...c, [key]: value }))
    try {
      const res = await fetch(`/api/admin/golive-checklist/${businessId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [key]: value }),
      })
      const data = await res.json()
      if (res.ok && data.checklist) {
        setChecklist(data.checklist as ChecklistRow)
      }
    } catch {
      // Revert on error.
      setChecklist(c => ({ ...c, [key]: !value }))
    } finally {
      setSaving(null)
    }
  }

  async function saveNotes() {
    if (notes === (checklist.notes ?? '')) return
    setSaving('notes')
    try {
      await fetch(`/api/admin/golive-checklist/${businessId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes }),
      })
      setChecklist(c => ({ ...c, notes }))
    } finally {
      setSaving(null)
    }
  }

  function runAutoChecks() {
    setRefreshing(true)
    // The server page recomputes on every load, so a router refresh is
    // the simplest way to rerun: the page re-renders with fresh state.
    startTransition(() => router.refresh())
    setTimeout(() => setRefreshing(false), 600)
  }

  async function reset() {
    if (!confirm('Reset all manual checks and clear the verified stamp? Auto checks will recompute on next load.')) return
    setResetting(true)
    try {
      await fetch(`/api/admin/golive-checklist/${businessId}/reset`, { method: 'POST' })
      startTransition(() => router.refresh())
    } finally {
      setResetting(false)
    }
  }

  return (
    <div style={{ padding: 28, maxWidth: 1280, margin: '0 auto', color: '#F2F6FB' }}>
      <Link href="/admin/clients" style={{ fontSize: 13, color: '#7BAED4', textDecoration: 'none' }}>
        ← Admin / Clients
      </Link>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16, margin: '14px 0 22px' }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#E8622A', marginBottom: 4 }}>
            Go-Live Verification
          </div>
          <h1 style={{ fontSize: '1.8rem', fontWeight: 800, color: 'white', margin: 0 }}>{businessName}</h1>
          <div style={{ fontSize: 13, color: '#7BAED4', marginTop: 6 }}>
            Plan: <span style={{ color: 'white' }}>{plan ?? '—'}</span>
            <span style={{ margin: '0 10px', opacity: 0.4 }}>·</span>
            Account: <span style={{ color: 'white' }}>{accountStatus ?? '—'}</span>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
          <span style={{
            fontSize: 12, fontWeight: 700, padding: '6px 14px', borderRadius: 99,
            background: overallBadge.bg, color: overallBadge.color,
          }}>
            {overallBadge.label}
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={runAutoChecks} disabled={refreshing || isPending}
              style={btn('#4A9FE8', refreshing || isPending)}>
              {refreshing || isPending ? 'Running…' : 'Run Auto Checks'}
            </button>
            <button onClick={reset} disabled={resetting}
              style={btn('#EF4444', resetting)}>
              {resetting ? 'Resetting…' : 'Reset Checklist'}
            </button>
          </div>
        </div>
      </div>

      {/* Progress bar */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 12, color: '#7BAED4' }}>
          <span>Progress</span>
          <span><strong style={{ color: 'white' }}>{totalPass}</strong> / {totalChecks} ({pct}%)</span>
        </div>
        <div style={{ height: 8, background: 'rgba(255,255,255,0.06)', borderRadius: 99, overflow: 'hidden' }}>
          <div style={{
            width: `${pct}%`, height: '100%',
            background: isVerified ? '#22C55E' : pct >= 50 ? '#F59E0B' : '#EF4444',
            transition: 'width 0.3s',
          }} />
        </div>
      </div>

      {/* Verified banner */}
      {isVerified && checklist.verified_at && (
        <div style={{
          background: 'rgba(34,197,94,0.10)',
          border: '1px solid rgba(34,197,94,0.40)',
          borderRadius: 14, padding: 18, marginBottom: 24,
          display: 'flex', alignItems: 'center', gap: 14,
        }}>
          <div style={{ fontSize: 28 }}>✅</div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#22C55E' }}>Go-Live Verified</div>
            <div style={{ fontSize: 13, color: '#C8D8EA', marginTop: 2 }}>
              {businessName} was verified on {new Date(checklist.verified_at).toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' })}
              {checklist.verified_by ? ` by ${checklist.verified_by}` : ''}. All systems confirmed.
            </div>
          </div>
        </div>
      )}

      {/* Two-column grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 20 }}>
        {/* LEFT — auto checks */}
        <div style={panelStyle}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 4 }}>
            <h2 style={panelHeader}>Automated checks</h2>
            <span style={{ fontSize: 12, color: '#7BAED4' }}>{autoPass} / {TOTAL_AUTO}</span>
          </div>
          <p style={panelSub}>These are verified automatically by the system.</p>

          {/* Failing items summary */}
          {failingAutoKeys.length > 0 && (
            <div style={{
              background: 'rgba(239,68,68,0.08)',
              border: '1px solid rgba(239,68,68,0.30)',
              borderRadius: 10, padding: '12px 14px', marginBottom: 14,
            }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#EF4444', marginBottom: 8 }}>
                {failingAutoKeys.length} item{failingAutoKeys.length === 1 ? '' : 's'} need attention
              </div>
              <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
                {failingAutoKeys.map(k => (
                  <li key={k} style={{ fontSize: 12, color: '#C8D8EA', lineHeight: 1.5 }}>
                    <span style={{ color: '#EF4444', fontWeight: 700 }}>{AUTO_CHECK_LABELS[k]}:</span>{' '}
                    {AUTO_CHECK_REMEDIES[k]}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {AUTO_CHECK_KEYS.map(k => (
              <AutoRow key={k} ok={checklist[k] === true} label={AUTO_CHECK_LABELS[k]} />
            ))}
          </div>

          <div style={{ marginTop: 14, fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>
            Last checked: {checklist.updated_at ? new Date(checklist.updated_at).toLocaleString('en-AU', { dateStyle: 'short', timeStyle: 'short' }) : '—'}
          </div>
        </div>

        {/* RIGHT — manual checks */}
        <div style={panelStyle}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 4 }}>
            <h2 style={panelHeader}>Manual checks</h2>
            <span style={{ fontSize: 12, color: '#7BAED4' }}>{manualPass} / {TOTAL_MANUAL}</span>
          </div>
          <p style={panelSub}>Tick each item after you have personally verified it. Saves automatically.</p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {MANUAL_CHECK_KEYS.map(k => (
              <ManualRow
                key={k}
                checked={checklist[k] === true}
                label={MANUAL_CHECK_LABELS[k]}
                saving={saving === k}
                onToggle={v => patchManual(k as ManualCheckKey, v)}
              />
            ))}
          </div>

          <div style={{ marginTop: 18 }}>
            <label style={{ display: 'block', fontSize: 12, color: '#4A7FBB', fontWeight: 600, marginBottom: 6 }}>Notes</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              onBlur={saveNotes}
              placeholder="Anything Irfan should remember about this client's go-live…"
              rows={4}
              style={{
                width: '100%', background: '#061322',
                border: '1px solid rgba(255,255,255,0.10)', borderRadius: 10,
                color: 'white', padding: '10px 12px', fontFamily: 'inherit', fontSize: 13,
                resize: 'vertical', outline: 'none',
              }}
            />
            {saving === 'notes' && <div style={{ fontSize: 11, color: '#4A9FE8', marginTop: 4 }}>Saving…</div>}
          </div>
        </div>
      </div>
    </div>
  )
}

function AutoRow({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '8px 12px', borderRadius: 8,
      background: ok ? 'rgba(34,197,94,0.06)' : 'rgba(239,68,68,0.04)',
    }}>
      <span style={{
        width: 18, height: 18, borderRadius: '50%',
        background: ok ? '#22C55E' : '#EF4444',
        color: 'white', fontSize: 11, fontWeight: 700,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
      }}>{ok ? '✓' : '✕'}</span>
      <span style={{ fontSize: 13, color: ok ? '#C8D8EA' : 'white' }}>{label}</span>
    </div>
  )
}

function ManualRow({
  checked, label, saving, onToggle,
}: { checked: boolean; label: string; saving: boolean; onToggle: (v: boolean) => void }) {
  return (
    <label style={{
      display: 'flex', alignItems: 'flex-start', gap: 10,
      padding: '10px 12px', borderRadius: 8, cursor: 'pointer',
      background: checked ? 'rgba(34,197,94,0.06)' : 'transparent',
      transition: 'background 0.15s',
    }}>
      <input
        type="checkbox"
        checked={checked}
        onChange={e => onToggle(e.target.checked)}
        disabled={saving}
        style={{ width: 18, height: 18, marginTop: 1, accentColor: '#22C55E', flexShrink: 0 }}
      />
      <span style={{ fontSize: 13, color: checked ? '#C8D8EA' : 'white', lineHeight: 1.5 }}>
        {label}
        {saving && <span style={{ marginLeft: 8, fontSize: 11, color: '#4A9FE8' }}>saving…</span>}
      </span>
    </label>
  )
}

const panelStyle: React.CSSProperties = {
  background: '#0A1E38',
  border: '1px solid rgba(255,255,255,0.06)',
  borderRadius: 16,
  padding: 22,
}

const panelHeader: React.CSSProperties = {
  fontSize: 16, fontWeight: 800, color: 'white', margin: 0,
}

const panelSub: React.CSSProperties = {
  fontSize: 13, color: '#7BAED4', margin: '4px 0 14px',
}

function btn(color: string, disabled: boolean): React.CSSProperties {
  return {
    background: disabled ? 'rgba(255,255,255,0.06)' : `${color}22`,
    border: `1px solid ${color}55`,
    color: disabled ? '#4A7FBB' : color,
    fontFamily: 'Outfit, sans-serif',
    fontSize: 12,
    fontWeight: 700,
    padding: '8px 14px',
    borderRadius: 8,
    cursor: disabled ? 'wait' : 'pointer',
  }
}
