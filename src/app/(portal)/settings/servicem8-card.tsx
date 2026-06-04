'use client'

// ServiceM8 integration card — Session 3B. Self-contained: fetches its own
// status on mount and manages connect / disconnect / default-status. Lives in
// the Settings > Automation tab. Works for the owner (cookie auth); pass
// adminClientId for the admin-as-client view.
// Styling uses design-system tokens so it adapts to dark/light.

import { useCallback, useEffect, useState } from 'react'
import { Panel } from '@/components/portal/ui-v2/panel'
import { ButtonV2 } from '@/components/portal/ui-v2/button'

const fieldCls =
  'w-full rounded-[10px] border border-[var(--line-strong)] bg-card-2 px-3.5 py-[11px] ' +
  'text-[14px] text-text font-sans outline-none transition-colors ' +
  'focus:border-orange focus:shadow-[0_0_0_3px_rgba(238,106,44,.15)]'
const labelCls = 'block text-[13px] font-bold text-dim mb-[7px]'
const STATUSES = ['Quote', 'Work Order', 'In Progress']

function withAdmin(path: string, adminClientId?: string | null): string {
  if (!adminClientId) return path
  const sep = path.includes('?') ? '&' : '?'
  return `${path}${sep}adminClientId=${encodeURIComponent(adminClientId)}`
}

export default function ServiceM8Card({ adminClientId }: { adminClientId?: string | null }) {
  const [loading, setLoading] = useState(true)
  const [enabled, setEnabled] = useState(false)
  const [defaultStatus, setDefaultStatus] = useState('Quote')
  const [jobsThisMonth, setJobsThisMonth] = useState(0)
  const [apiKey, setApiKey] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [showHelp, setShowHelp] = useState(false)

  const loadStatus = useCallback(async () => {
    try {
      const res = await fetch(withAdmin('/api/servicem8/status', adminClientId))
      const json = await res.json()
      if (json.ok) {
        setEnabled(json.enabled)
        setDefaultStatus(json.defaultStatus ?? 'Quote')
        setJobsThisMonth(json.jobsThisMonth ?? 0)
      }
    } catch { /* ignore */ }
    setLoading(false)
  }, [adminClientId])

  useEffect(() => { loadStatus() }, [loadStatus])

  async function connect() {
    setBusy(true); setErr(null); setMsg(null)
    try {
      const res = await fetch(withAdmin('/api/servicem8/connect', adminClientId), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: apiKey.trim() }),
      })
      const json = await res.json()
      if (!res.ok || !json.ok) { setErr(json.error || 'Could not connect.'); setBusy(false); return }
      setApiKey('')
      setMsg(json.companyName ? `Connected to ${json.companyName}` : 'ServiceM8 connected')
      await loadStatus()
    } catch { setErr('Network error. Try again.') }
    setBusy(false)
  }

  async function disconnect() {
    setBusy(true); setErr(null); setMsg(null)
    try {
      await fetch(withAdmin('/api/servicem8/disconnect', adminClientId), { method: 'POST' })
      await loadStatus()
      setMsg('Disconnected')
    } catch { setErr('Network error. Try again.') }
    setBusy(false)
  }

  async function saveStatus(next: string) {
    setDefaultStatus(next)
    try {
      await fetch(withAdmin('/api/servicem8/status', adminClientId), {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ defaultStatus: next }),
      })
    } catch { /* ignore */ }
  }

  if (loading) {
    return <Panel><div className="text-[14px] text-dim">Loading ServiceM8…</div></Panel>
  }

  return (
    <Panel>
      <div className="mb-1 flex items-center justify-between gap-3">
        <h3 className="text-[16px] font-bold text-text">ServiceM8</h3>
        {enabled && (
          <span className="rounded-full bg-green/10 px-2.5 py-1 text-[12px] font-bold text-green">Connected</span>
        )}
      </div>
      <p className="mb-5 text-[13px] text-dim">
        When TalkMate books a job, it automatically creates the job in ServiceM8. No double entry.
      </p>

      {!enabled ? (
        <>
          <div className="mb-3">
            <label className={labelCls}>ServiceM8 API key</label>
            <div className="flex gap-2">
              <input
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Paste your API key"
                className={fieldCls}
              />
              <button
                type="button"
                onClick={() => setShowKey((s) => !s)}
                className="shrink-0 rounded-[10px] border border-line-strong px-3.5 text-[13px] text-dim transition hover:text-text"
              >{showKey ? 'Hide' : 'Show'}</button>
            </div>
          </div>
          <ButtonV2 disabled={busy || !apiKey.trim()} onClick={connect} className="px-7 py-3 text-[15px]">
            {busy ? 'Connecting…' : 'Connect'}
          </ButtonV2>

          <button
            type="button"
            onClick={() => setShowHelp((s) => !s)}
            className="mt-3.5 block text-[13px] text-blue"
          >Where do I find my API key?</button>
          {showHelp && (
            <div className="mt-2.5 space-y-1.5">
              {[
                'Log into your ServiceM8 account',
                'Go to Settings then API Keys',
                'Create a new key with Jobs read and write permission',
                'Copy and paste it here',
              ].map((step, i) => (
                <div key={i} className="flex gap-2">
                  <span className="shrink-0 font-bold text-orange">{i + 1}.</span>
                  <span className="text-[14px] text-dim">{step}</span>
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          <div className="mb-4">
            <label className={labelCls}>Default job status</label>
            <select value={defaultStatus} onChange={(e) => saveStatus(e.target.value)} className={fieldCls + ' cursor-pointer'}>
              {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="mb-4 text-[13px] text-dim">
            Jobs pushed this month: <strong className="text-text">{jobsThisMonth}</strong>
          </div>
          <div className="flex items-center gap-4">
            <a href="/settings/servicem8-log" className="text-[13px] text-blue no-underline">View push log</a>
            <button
              type="button"
              disabled={busy}
              onClick={disconnect}
              className="text-[13px] text-red disabled:opacity-50"
            >Disconnect</button>
          </div>
        </>
      )}

      {msg && <div className="mt-3 text-[13px] text-green">{msg}</div>}
      {err && <div className="mt-3 text-[13px] text-red">{err}</div>}
    </Panel>
  )
}
