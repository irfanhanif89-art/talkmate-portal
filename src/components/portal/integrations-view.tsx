'use client'

// Settings > Integrations tab body (Session 78). Renders one card per
// integration, grouped by category. Each card self-fetches its status. Works
// for the owner (cookie auth); pass adminClientId for the admin-as-client view.

import { useCallback, useEffect, useState } from 'react'
import { Panel } from '@/components/portal/ui-v2/panel'
import IntegrationCard, { LetterLogo } from '@/components/portal/IntegrationCard'
import ServiceM8Card from '@/app/(portal)/settings/servicem8-card'

function withAdmin(path: string, adminClientId?: string | null): string {
  if (!adminClientId) return path
  const sep = path.includes('?') ? '&' : '?'
  return `${path}${sep}adminClientId=${encodeURIComponent(adminClientId)}`
}

const fieldCls =
  'w-full rounded-[10px] border border-[var(--line-strong)] bg-card-2 px-3.5 py-[11px] ' +
  'text-[14px] text-text font-sans outline-none transition-colors ' +
  'focus:border-orange focus:shadow-[0_0_0_3px_rgba(238,106,44,.15)]'

function SectionHeader({ children }: { children: React.ReactNode }) {
  return <p className="mb-3 mt-2 text-[11px] font-bold uppercase tracking-[.1em] text-dim">{children}</p>
}

// ── Zapier ──────────────────────────────────────────────────────────────────

function ZapierCard({ adminClientId }: { adminClientId?: string | null }) {
  const [url, setUrl] = useState('')
  const [connected, setConnected] = useState(false)
  const [lastTriggered, setLastTriggered] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const r = await fetch(withAdmin('/api/integrations/zapier/status', adminClientId))
      const j = await r.json()
      if (j.ok) { setUrl(j.webhook_url ?? ''); setConnected(j.connected); setLastTriggered(j.last_triggered_at) }
    } catch { /* ignore */ }
  }, [adminClientId])
  useEffect(() => { load() }, [load])

  async function save(clear = false) {
    setBusy(true); setMsg(null)
    try {
      const r = await fetch(withAdmin('/api/integrations/zapier/save', adminClientId), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ webhook_url: clear ? null : url.trim() }),
      })
      const j = await r.json()
      if (!r.ok || !j.ok) { setMsg(j.error || 'Could not save.'); setBusy(false); return }
      if (clear) setUrl('')
      setMsg(clear ? 'Disconnected' : 'Saved')
      await load()
    } catch { setMsg('Network error.') }
    setBusy(false)
  }

  async function test() {
    setBusy(true); setMsg(null)
    try {
      const r = await fetch(withAdmin('/api/integrations/zapier/test', adminClientId), { method: 'POST' })
      const j = await r.json()
      setMsg(j.ok ? `Test sent (status ${j.status})` : (j.error || 'Test failed'))
      await load()
    } catch { setMsg('Network error.') }
    setBusy(false)
  }

  return (
    <IntegrationCard
      logo={<LetterLogo letter="Z" color="#FF4A00" />}
      name="Zapier"
      description="Send every call to 5,000+ apps via a Zapier webhook."
      connected={connected}
      connectedLabel={lastTriggered ? `Active · last fired ${new Date(lastTriggered).toLocaleString('en-AU')}` : 'Active'}
    >
      <div>
        <label className="block text-[13px] font-bold text-dim mb-[7px]">Your Zapier Webhook URL</label>
        <input
          className={fieldCls}
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://hooks.zapier.com/hooks/catch/..."
        />
        <div className="mt-3 flex flex-wrap items-center gap-2.5">
          <button type="button" disabled={busy} onClick={() => save(false)}
            className="rounded-[10px] bg-orange px-4 py-2 text-[13px] font-semibold text-white transition hover:brightness-110 disabled:opacity-50">
            {busy ? 'Working…' : 'Save'}
          </button>
          <button type="button" disabled={busy || !connected} onClick={test}
            className="rounded-[10px] border border-line-strong px-4 py-2 text-[13px] font-semibold text-text transition hover:border-orange/40 disabled:opacity-40">
            Test
          </button>
          {connected && (
            <button type="button" disabled={busy} onClick={() => save(true)}
              className="text-[13px] font-semibold text-red disabled:opacity-50">Disconnect</button>
          )}
        </div>
        {msg && <p className="mt-2.5 text-[12.5px] text-dim">{msg}</p>}
      </div>
    </IntegrationCard>
  )
}

// ── HubSpot ─────────────────────────────────────────────────────────────────

function HubSpotCard({ adminClientId }: { adminClientId?: string | null }) {
  const [configured, setConfigured] = useState(false)
  const [connected, setConnected] = useState(false)
  const [portalId, setPortalId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      const r = await fetch(withAdmin('/api/integrations/hubspot/status', adminClientId))
      const j = await r.json()
      if (j.ok) { setConfigured(j.configured); setConnected(j.connected); setPortalId(j.portal_id) }
    } catch { /* ignore */ }
  }, [adminClientId])
  useEffect(() => { load() }, [load])

  async function disconnect() {
    setBusy(true)
    try { await fetch(withAdmin('/api/integrations/hubspot/disconnect', adminClientId), { method: 'POST' }); await load() }
    catch { /* ignore */ }
    setBusy(false)
  }

  return (
    <IntegrationCard
      logo={<LetterLogo letter="H" color="#FF7A59" />}
      name="HubSpot"
      description="Auto-create contacts and log call notes in your CRM."
      connected={connected}
      connectedLabel={portalId ? `Connected · portal ${portalId}` : 'Connected'}
      badge={!configured ? 'coming-soon' : undefined}
      connecting={busy}
      onConnect={() => { window.location.href = '/api/integrations/hubspot/connect' }}
      onDisconnect={disconnect}
    />
  )
}

// ── MYOB ────────────────────────────────────────────────────────────────────

function MyobCard({ adminClientId }: { adminClientId?: string | null }) {
  const [configured, setConfigured] = useState(false)
  const [connected, setConnected] = useState(false)
  const [companyName, setCompanyName] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      const r = await fetch(withAdmin('/api/integrations/myob/status', adminClientId))
      const j = await r.json()
      if (j.ok) { setConfigured(j.configured); setConnected(j.connected); setCompanyName(j.company_name) }
    } catch { /* ignore */ }
  }, [adminClientId])
  useEffect(() => { load() }, [load])

  async function disconnect() {
    setBusy(true)
    try { await fetch(withAdmin('/api/integrations/myob/disconnect', adminClientId), { method: 'POST' }); await load() }
    catch { /* ignore */ }
    setBusy(false)
  }

  return (
    <IntegrationCard
      logo={<LetterLogo letter="M" color="#6C2EB7" />}
      name="MYOB"
      description="Create a customer record from every qualifying call."
      connected={connected}
      connectedLabel={companyName ? `Connected · ${companyName}` : 'Connected'}
      badge={!configured ? 'coming-soon' : undefined}
      connecting={busy}
      onConnect={() => { window.location.href = '/api/integrations/myob/connect' }}
      onDisconnect={disconnect}
    />
  )
}

// ── Google Business Profile ───────────────────────────────────────────────────

interface GbpLoc { locationResourceName: string; displayName: string; address: string | null }

function GbpCard({ adminClientId }: { adminClientId?: string | null }) {
  const [googleConnected, setGoogleConnected] = useState(false)
  const [connected, setConnected] = useState(false)
  const [bizName, setBizName] = useState<string | null>(null)
  const [locations, setLocations] = useState<GbpLoc[]>([])
  const [chosen, setChosen] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const r = await fetch(withAdmin('/api/integrations/google-business/status', adminClientId))
      const j = await r.json()
      if (j.ok) { setGoogleConnected(j.google_connected); setConnected(j.connected); setBizName(j.business_name) }
    } catch { /* ignore */ }
  }, [adminClientId])
  useEffect(() => { load() }, [load])

  async function loadLocations() {
    setBusy(true); setMsg(null)
    try {
      const r = await fetch(withAdmin('/api/integrations/google-business/locations', adminClientId))
      const j = await r.json()
      if (j.ok) { setLocations(j.locations ?? []); if (!j.locations?.length) setMsg('No business locations found on your Google account.') }
      else setMsg(j.message || 'Could not load locations.')
    } catch { setMsg('Network error.') }
    setBusy(false)
  }

  async function selectLocation() {
    if (!chosen) return
    setBusy(true); setMsg(null)
    try {
      const r = await fetch(withAdmin('/api/integrations/google-business/select', adminClientId), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ location_resource_name: chosen }),
      })
      const j = await r.json()
      if (j.ok) { setMsg(`Connected: ${j.name ?? 'location'}`); await load() } else setMsg(j.error || 'Could not connect.')
    } catch { setMsg('Network error.') }
    setBusy(false)
  }

  async function pull() {
    setBusy(true); setMsg(null)
    try {
      const r = await fetch(withAdmin('/api/integrations/google-business/pull', adminClientId), { method: 'POST' })
      const j = await r.json()
      setMsg(j.ok ? `Pulled: ${j.pulled?.name ?? ''} ${j.pulled?.address ?? ''}`.trim() : (j.error || 'Pull failed'))
    } catch { setMsg('Network error.') }
    setBusy(false)
  }

  async function disconnect() {
    setBusy(true); setMsg(null)
    try { await fetch(withAdmin('/api/integrations/google-business/disconnect', adminClientId), { method: 'POST' }); await load() }
    catch { /* ignore */ }
    setBusy(false)
  }

  return (
    <IntegrationCard
      logo={<LetterLogo letter="G" color="#4285F4" />}
      name="Google Business Profile"
      description="Pull your business name, address, phone and hours from Google."
      connected={connected}
      connectedLabel={bizName ? `Connected: ${bizName}` : 'Connected'}
    >
      <div className="text-[13px]">
        {!googleConnected ? (
          <p className="text-dim">Connect your Google account first (under the Email or Bookings tab) to enable Google Business Profile.</p>
        ) : !connected ? (
          <div className="space-y-2.5">
            {locations.length === 0 ? (
              <button type="button" disabled={busy} onClick={loadLocations}
                className="rounded-[10px] border border-line-strong px-4 py-2 text-[13px] font-semibold text-text transition hover:border-orange/40 disabled:opacity-50">
                {busy ? 'Loading…' : 'Find my business locations'}
              </button>
            ) : (
              <>
                <select className={fieldCls + ' cursor-pointer'} value={chosen} onChange={(e) => setChosen(e.target.value)}>
                  <option value="">Select your business location…</option>
                  {locations.map((l) => (
                    <option key={l.locationResourceName} value={l.locationResourceName}>
                      {l.displayName}{l.address ? ` — ${l.address}` : ''}
                    </option>
                  ))}
                </select>
                <button type="button" disabled={busy || !chosen} onClick={selectLocation}
                  className="rounded-[10px] bg-orange px-4 py-2 text-[13px] font-semibold text-white transition hover:brightness-110 disabled:opacity-50">
                  Connect Business Profile
                </button>
              </>
            )}
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2.5">
            <button type="button" disabled={busy} onClick={pull}
              className="rounded-[10px] border border-line-strong px-4 py-2 text-[13px] font-semibold text-text transition hover:border-orange/40 disabled:opacity-50">
              {busy ? 'Working…' : 'Pull latest info'}
            </button>
            <button type="button" disabled={busy} onClick={disconnect} className="text-[13px] font-semibold text-red disabled:opacity-50">Disconnect</button>
          </div>
        )}
        {msg && <p className="mt-2.5 text-[12.5px] text-dim">{msg}</p>}
        <p className="mt-3 text-[11.5px] text-dim">TalkMate only reads your Google listing. Your data on Google is never modified.</p>
      </div>
    </IntegrationCard>
  )
}

// ── View ──────────────────────────────────────────────────────────────────────

export default function IntegrationsView({ adminClientId }: { adminClientId?: string | null }) {
  return (
    <div className="space-y-2">
      <Panel className="bg-transparent border-0 p-0 shadow-none">
        <p className="text-[13.5px] text-dim">
          Connect TalkMate to the tools you already use. Your calls, contacts, and jobs sync automatically.
        </p>
      </Panel>

      <SectionHeader>Job Management</SectionHeader>
      <ServiceM8Card adminClientId={adminClientId} />

      <SectionHeader>CRM</SectionHeader>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <HubSpotCard adminClientId={adminClientId} />
      </div>

      <SectionHeader>Accounting</SectionHeader>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <MyobCard adminClientId={adminClientId} />
        <IntegrationCard
          logo={<LetterLogo letter="X" color="#13B5EA" />}
          name="Xero"
          description="Sync paid invoices and revenue back into TalkMate."
          connected={false}
          badge="coming-soon"
        />
      </div>

      <SectionHeader>Automation</SectionHeader>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <ZapierCard adminClientId={adminClientId} />
      </div>

      <SectionHeader>Google</SectionHeader>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <GbpCard adminClientId={adminClientId} />
      </div>
    </div>
  )
}
