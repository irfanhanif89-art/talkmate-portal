'use client'

// Google connect card — lets a client link their own Google account so AI email
// replies send from their Gmail (purpose="email") and bookings sync to their
// Google Calendar (purpose="calendar"). One Google connection powers both.
//
// Env-gated end to end: when the Google OAuth app isn't configured yet, the
// status route reports configured:false and this renders a clear "Connecting
// soon" state instead of a dead button — so the section reads as intentional.

import { useCallback, useEffect, useState } from 'react'

type Purpose = 'email' | 'calendar'

interface Status {
  ok: boolean
  configured: boolean
  connected: boolean
  email: string | null
  isAdmin?: boolean
}

const COPY: Record<Purpose, { title: string; blurb: string }> = {
  email: {
    title: 'Connect your Gmail',
    blurb: 'Send AI email replies from your own inbox instead of a TalkMate address.',
  },
  calendar: {
    title: 'Connect your Google Calendar',
    blurb: 'Every booking made here syncs straight to your Google Calendar.',
  },
}

function withAdmin(path: string, adminClientId?: string | null): string {
  if (!adminClientId) return path
  const sep = path.includes('?') ? '&' : '?'
  return `${path}${sep}adminClientId=${encodeURIComponent(adminClientId)}`
}

export default function GoogleConnectCard({
  purpose,
  returnPath,
  adminClientId,
}: {
  purpose: Purpose
  returnPath: string
  adminClientId?: string | null
}) {
  const [status, setStatus] = useState<Status | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch(withAdmin('/api/integrations/google/status', adminClientId))
      const j = (await res.json()) as Status
      setStatus(j)
    } catch {
      setStatus({ ok: false, configured: false, connected: false, email: null })
    }
  }, [adminClientId])

  useEffect(() => { load() }, [load])

  async function connect() {
    setBusy(true); setErr(null)
    try {
      const res = await fetch(`/api/integrations/google/connect?return=${encodeURIComponent(returnPath)}`)
      const j = await res.json()
      if (res.ok && j.url) { window.location.href = j.url as string; return }
      setErr(j.error || 'Could not start Google sign-in.')
    } catch {
      setErr('Network error. Try again.')
    }
    setBusy(false)
  }

  async function disconnect() {
    setBusy(true); setErr(null)
    try {
      const res = await fetch(withAdmin('/api/integrations/google/disconnect', adminClientId), { method: 'POST' })
      if (res.ok) { await load() } else { setErr('Could not disconnect.') }
    } catch {
      setErr('Network error. Try again.')
    }
    setBusy(false)
  }

  const copy = COPY[purpose]
  const isAdminView = Boolean(adminClientId) || status?.isAdmin

  // Right-hand action varies by state.
  let action: React.ReactNode = null
  let statusLine = copy.blurb

  if (!status) {
    action = <span className="text-[12px] text-faint">Checking…</span>
  } else if (!status.configured) {
    action = (
      <span className="rounded-[9px] border border-line bg-card-2 px-3.5 py-2 text-[12.5px] font-bold text-faint">
        Connecting soon
      </span>
    )
    statusLine = 'Google connection is being set up. This will be available shortly.'
  } else if (status.connected) {
    statusLine = status.email ? `Connected as ${status.email}` : 'Connected'
    action = isAdminView ? (
      <span className="rounded-[9px] border border-green/30 bg-green/10 px-3.5 py-2 text-[12.5px] font-bold text-green">Connected</span>
    ) : (
      <button
        type="button"
        onClick={disconnect}
        disabled={busy}
        className="rounded-[9px] border border-line bg-card-2 px-3.5 py-2 text-[12.5px] font-bold text-dim transition hover:border-line-strong disabled:opacity-50"
      >
        Disconnect
      </button>
    )
  } else if (isAdminView) {
    statusLine = 'This client has not connected their Google account yet.'
    action = <span className="rounded-[9px] border border-line bg-card-2 px-3.5 py-2 text-[12.5px] font-bold text-faint">Not connected</span>
  } else {
    action = (
      <button
        type="button"
        onClick={connect}
        disabled={busy}
        className="flex items-center gap-2 rounded-[9px] bg-white px-3.5 py-2 text-[12.5px] font-bold text-[#1f1f1f] shadow-[0_1px_4px_rgba(0,0,0,.18)] transition hover:bg-white/90 disabled:opacity-50"
      >
        <GoogleG />
        {busy ? 'Starting…' : 'Connect Google Account'}
      </button>
    )
  }

  return (
    <div className="mb-4 flex items-center gap-3.5 rounded-[12px] border border-line bg-card px-4 py-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] border border-line bg-card-2">
        <GoogleG size={18} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[13.5px] font-bold text-text">{copy.title}</div>
        <div className="truncate text-[12px] text-dim">{err ?? statusLine}</div>
      </div>
      <div className="shrink-0">{action}</div>
    </div>
  )
}

function GoogleG({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.6 2.4 30.2 0 24 0 14.6 0 6.4 5.4 2.5 13.3l7.9 6.1C12.3 13.2 17.7 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.1 5.3-4.6 7l7.1 5.5c4.2-3.9 6.6-9.6 6.6-17z" />
      <path fill="#FBBC05" d="M10.4 28.6c-.5-1.5-.8-3-.8-4.6s.3-3.2.8-4.6l-7.9-6.1C.9 16.5 0 20.1 0 24s.9 7.5 2.5 10.7l7.9-6.1z" />
      <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.1-5.5c-2 1.3-4.6 2.1-8.8 2.1-6.3 0-11.7-3.7-13.6-9.4l-7.9 6.1C6.4 42.6 14.6 48 24 48z" />
    </svg>
  )
}
