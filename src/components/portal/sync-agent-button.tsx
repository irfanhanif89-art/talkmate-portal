'use client'

import { useEffect, useState } from 'react'

interface Props {
  // Whether the client has a Vapi agent provisioned. When false the button
  // renders disabled with an explanatory tooltip.
  hasAgent: boolean
  // ISO timestamp string for the last successful sync, if any.
  initialLastSyncedAt?: string | null
}

// Fire a sync from another page (VIPs / Team) without surfacing UI. The
// callers add/edit/delete a record and silently push the change to Vapi.
export async function silentSyncAgent(): Promise<void> {
  try {
    await fetch('/api/vapi/sync', { method: 'POST' })
  } catch (e) {
    // Auto-sync is best-effort. The user can hit the manual Sync Agent
    // button if it failed and they want to retry.
    console.error('[silentSyncAgent] failed', e)
  }
}

function formatTimestamp(iso: string | null | undefined): string {
  if (!iso) return 'Never'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return 'Never'
  return d.toLocaleString('en-AU', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
  })
}

export default function SyncAgentButton({ hasAgent, initialLastSyncedAt }: Props) {
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState<{ kind: 'success' | 'error'; text: string } | null>(null)
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(initialLastSyncedAt ?? null)

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 3000)
    return () => clearTimeout(t)
  }, [toast])

  async function onClick() {
    if (busy || !hasAgent) return
    setBusy(true)
    try {
      const res = await fetch('/api/vapi/sync', { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setToast({ kind: 'error', text: data?.error ?? 'Sync failed' })
      } else {
        setLastSyncedAt(new Date().toISOString())
        setToast({ kind: 'success', text: 'Agent updated' })
      }
    } catch (e) {
      setToast({ kind: 'error', text: (e as Error).message })
    } finally {
      setBusy(false)
    }
  }

  const disabled = busy || !hasAgent
  const tooltip = hasAgent ? undefined : 'No agent configured yet'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-start' }}>
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        title={tooltip}
        style={{
          background: disabled ? 'rgba(232,98,42,0.35)' : '#E8622A',
          color: 'white',
          border: 'none',
          padding: '11px 22px',
          borderRadius: 10,
          fontFamily: 'Outfit, sans-serif',
          fontWeight: 600,
          fontSize: 14,
          cursor: disabled ? 'not-allowed' : 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          opacity: disabled && !busy ? 0.7 : 1,
        }}
      >
        {busy ? (
          <>
            <Spinner />
            <span>Syncing…</span>
          </>
        ) : (
          <span>Sync Agent</span>
        )}
      </button>
      <div style={{ fontSize: 11, color: '#7BAED4' }}>
        Last synced: <span style={{ color: lastSyncedAt ? 'white' : '#7BAED4', fontWeight: 600 }}>{formatTimestamp(lastSyncedAt)}</span>
      </div>
      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 100,
          padding: '12px 18px', background: '#0A1E38',
          border: `1px solid ${toast.kind === 'success' ? 'rgba(34,197,94,0.4)' : 'rgba(239,68,68,0.4)'}`,
          borderRadius: 10,
          color: toast.kind === 'success' ? '#22C55E' : '#FCA5A5',
          fontSize: 13, fontWeight: 600,
          boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
          fontFamily: 'Outfit, sans-serif',
        }}>{toast.text}</div>
      )}
    </div>
  )
}

function Spinner() {
  return (
    <span
      aria-hidden
      style={{
        width: 14, height: 14, borderRadius: '50%',
        border: '2px solid rgba(255,255,255,0.4)',
        borderTopColor: 'white',
        display: 'inline-block',
        animation: 'sync-agent-spin 0.7s linear infinite',
      }}
    >
      <style>{`@keyframes sync-agent-spin { to { transform: rotate(360deg); } }`}</style>
    </span>
  )
}
