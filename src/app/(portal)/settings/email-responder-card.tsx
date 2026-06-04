'use client'

// AI Email Responder card — Session 3C. Lives in Settings > Automation.
// Plan-gated (Growth+Pro), consent-gated, auto-send OFF by default.
// Self-contained: fetches its own config and saves via /api/email/config.
// Styling uses design-system tokens so it adapts to dark/light.

import { useCallback, useEffect, useState } from 'react'
import { Panel } from '@/components/portal/ui-v2/panel'
import { Switch } from '@/components/portal/ui-v2/switch'

const fieldCls =
  'w-full rounded-[10px] border border-[var(--line-strong)] bg-card-2 px-3.5 py-[11px] ' +
  'text-[14px] text-text font-sans outline-none transition-colors ' +
  'focus:border-orange focus:shadow-[0_0_0_3px_rgba(238,106,44,.15)]'
const labelCls = 'block text-[13px] font-bold text-dim mb-[7px]'

function withAdmin(path: string, adminClientId?: string | null): string {
  if (!adminClientId) return path
  const sep = path.includes('?') ? '&' : '?'
  return `${path}${sep}adminClientId=${encodeURIComponent(adminClientId)}`
}

export default function EmailResponderCard({ adminClientId }: { adminClientId?: string | null }) {
  const [loading, setLoading] = useState(true)
  const [planAllowed, setPlanAllowed] = useState(true)
  const [enabled, setEnabled] = useState(false)
  const [address, setAddress] = useState<string | null>(null)
  const [fromName, setFromName] = useState('')
  const [autoSend, setAutoSend] = useState(false)
  const [consent, setConsent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await fetch(withAdmin('/api/email/config', adminClientId))
      const j = await res.json()
      if (j.ok) {
        setPlanAllowed(j.planAllowed); setEnabled(j.enabled); setAddress(j.inboundEmailAddress)
        setFromName(j.fromName ?? ''); setAutoSend(j.autoSend); setConsent(j.consent)
      }
    } catch { /* ignore */ }
    setLoading(false)
  }, [adminClientId])

  useEffect(() => { load() }, [load])

  async function patch(payload: Record<string, unknown>, successMsg?: string) {
    setBusy(true); setErr(null); setMsg(null)
    try {
      const res = await fetch(withAdmin('/api/email/config', adminClientId), {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      })
      const j = await res.json()
      if (!res.ok || !j.ok) { setErr(j.error || 'Could not save.'); setBusy(false); return false }
      if (j.inboundEmailAddress) setAddress(j.inboundEmailAddress)
      if (successMsg) setMsg(successMsg)
      setBusy(false)
      return true
    } catch { setErr('Network error.'); setBusy(false); return false }
  }

  if (loading) return <Panel><div className="text-[14px] text-dim">Loading email responder…</div></Panel>

  if (!planAllowed) {
    return (
      <Panel>
        <h3 className="mb-1 text-[16px] font-bold text-text">AI Email Responder</h3>
        <p className="mb-3.5 text-[13px] text-dim">
          Customers email your TalkMate address and AI drafts a reply from your knowledge base.
        </p>
        <div className="rounded-[10px] border border-gold/25 bg-gold/[.08] px-3.5 py-2.5 text-[13px] text-gold">
          Available on Growth and Pro plans. <a href="/billing" className="text-blue">Upgrade</a>
        </div>
      </Panel>
    )
  }

  return (
    <Panel>
      <div className="mb-3.5 flex items-start justify-between gap-4">
        <div>
          <div className="mb-1 text-[16px] font-bold text-text">AI Email Responder</div>
          <div className="text-[12px] text-dim">Customers email your TalkMate address. AI drafts a reply from your knowledge base.</div>
        </div>
        <Switch
          checked={enabled}
          onChange={(v) => patch({ enabled: v }, v ? 'Enabled' : 'Disabled').then((ok) => ok && setEnabled(v))}
          variant="orange"
          aria-label="Enable AI Email Responder"
        />
      </div>

      {enabled && (
        <>
          {address && (
            <div className="mb-3.5">
              <label className={labelCls}>Your TalkMate email address</label>
              <div className="flex gap-2">
                <input readOnly value={address} className={fieldCls + ' text-dim'} />
                <button
                  type="button"
                  onClick={() => { navigator.clipboard?.writeText(address); setCopied(true); setTimeout(() => setCopied(false), 1500) }}
                  className="shrink-0 rounded-[10px] border border-line-strong px-3.5 text-[13px] text-dim transition hover:text-text"
                >
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
            </div>
          )}

          <div className="mb-3.5">
            <label className={labelCls}>From name for outbound emails</label>
            <input value={fromName} onChange={(e) => setFromName(e.target.value)} onBlur={() => patch({ fromName }, 'Saved')} placeholder="e.g. Glen, GM Towing" className={fieldCls} />
          </div>

          <div className="mb-3 flex items-start justify-between gap-4">
            <div>
              <div className="text-[14px] font-semibold text-text">Send AI replies automatically</div>
              <div className={`text-[12px] ${autoSend ? 'text-gold' : 'text-dim'}`}>
                {autoSend ? 'On — replies send without review. Use with care.' : 'Off — replies wait for your approval (recommended).'}
              </div>
            </div>
            <Switch checked={autoSend} disabled={!consent} onChange={(v) => patch({ autoSend: v }).then((ok) => ok && setAutoSend(v))} variant="orange" aria-label="Auto-send AI replies" />
          </div>

          {!consent && (
            <div className="rounded-[10px] border border-gold/25 bg-gold/[.08] px-3.5 py-2.5 text-[12px] text-gold">
              Awaiting consent confirmation. Your account manager will enable sending once you have confirmed TalkMate can email customers on your behalf.
            </div>
          )}
        </>
      )}

      {msg && <div className="mt-3 text-[13px] text-green">{msg}</div>}
      {err && <div className="mt-3 text-[13px] text-red">{err}</div>}
    </Panel>
  )
}
