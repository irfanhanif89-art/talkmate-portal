'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import ServicePricingEditor, { type ServicePricing } from '@/components/portal/service-pricing-editor'
import ServiceAreaEditor, { type ServiceArea } from '@/components/portal/service-area-editor'
import DivertInstructions from '@/components/portal/divert-instructions'
import ServicesEditor, { type Service } from '@/components/portal/services-editor'
import SyncAgentButton from '@/components/portal/sync-agent-button'
import IntelligenceAlertSettings from '@/components/portal/intelligence-alert-settings'
import { Switch } from '@/components/portal/ui-v2/switch'
import { ButtonV2 } from '@/components/portal/ui-v2/button'
import { Panel } from '@/components/portal/ui-v2/panel'

// ─── Types ────────────────────────────────────────────────────────────────────

type TabKey = 'business' | 'ai' | 'automation' | 'notifications' | 'team' | 'integrations'

// ─── Shared field helpers ─────────────────────────────────────────────────────

/** Shared input class — bg-card-2, border-line-strong, orange focus ring */
const fieldCls =
  'w-full rounded-[10px] border border-[var(--line-strong)] bg-card-2 px-3.5 py-[11px] ' +
  'text-[14.5px] text-text font-sans outline-none transition-colors ' +
  'focus:border-orange focus:shadow-[0_0_0_3px_rgba(238,106,44,.15)]'

const labelCls = 'block text-[13px] font-bold text-dim mb-[7px]'

function Field({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <div className={full ? 'col-span-2' : undefined}>
      <label className={labelCls}>{label}</label>
      {children}
    </div>
  )
}

function Hint({ children }: { children: React.ReactNode }) {
  return <p className="mt-1.5 text-[11px] text-dim">{children}</p>
}

// ─── Voice options ────────────────────────────────────────────────────────────

const voices = [
  { id: 'sarah', name: 'Charlotte', desc: '🇦🇺 Warm & Conversational Australian Female' },
  { id: 'james', name: 'James', desc: '🇦🇺 Friendly & Professional Australian Male' },
  { id: 'emma', name: 'Emma', desc: '🇦🇺 Warm Australian Female, early 30s' },
  { id: 'liam', name: 'Liam', desc: '🇦🇺 Deep & Energetic Australian Male' },
]

// ─── Settings sub-nav items ───────────────────────────────────────────────────

const tabs: { key: TabKey; label: string; icon: string }[] = [
  { key: 'business', label: 'Business Info', icon: '🏢' },
  { key: 'ai', label: 'AI Voice Agent', icon: '🤖' },
  { key: 'automation', label: 'Automation', icon: '⚡' },
  { key: 'notifications', label: 'Notifications', icon: '🔔' },
  { key: 'team', label: 'Team', icon: '👥' },
  { key: 'integrations', label: 'Integrations', icon: '🔗' },
]

// ─── Main component ───────────────────────────────────────────────────────────

export default function SettingsPage() {
  const supabase = createClient()
  const [tab, setTab] = useState<TabKey>('business')
  const [saved, setSaved] = useState('')
  const [biz, setBiz] = useState<Record<string, string>>({})
  const [greeting, setGreeting] = useState('')
  const [agentName, setAgentName] = useState('')
  const [voice, setVoice] = useState('sarah')
  const [faqs, setFaqs] = useState([
    { q: 'What are your opening hours?', a: '' },
    { q: 'How much does it cost?', a: '' },
  ])
  const [escalation, setEscalation] = useState(
    'Transfer if the caller asks to speak to a manager, sounds upset or angry, has a billing complaint, or requests a refund.',
  )
  const [notifs, setNotifs] = useState({
    emailOnTransfer: true,
    dailySummary: true,
    weeklyReport: true,
    email: '',
    whatsapp: false,
    whatsappNum: '',
    telegram: false,
    telegramUser: '',
    urgentCall: false,
    urgentNum: '',
  })
  const [team, setTeam] = useState<Array<{ email: string; role: string }>>([])
  const [inviteEmail, setInviteEmail] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordMsg, setPasswordMsg] = useState('')
  const [changingPw, setChangingPw] = useState(false)
  const [servicePricing, setServicePricing] = useState<ServicePricing>({})
  const [serviceArea, setServiceArea] = useState<ServiceArea>({})
  const [bizId, setBizId] = useState<string | null>(null)
  const [services, setServices] = useState<Service[] | null>(null)
  const [tradeType, setTradeType] = useState<string | null>(null)
  const [forwardTo, setForwardTo] = useState('')
  const [industry, setIndustry] = useState<string | null>(null)
  const [loadedServices, setLoadedServices] = useState(false)
  const [savingServices, setSavingServices] = useState(false)

  // Automation tab state
  const [winbackEnabled, setWinbackEnabled] = useState(true)
  const [winbackMessage, setWinbackMessage] = useState('')
  const [reviewsEnabled, setReviewsEnabled] = useState(false)
  const [googleReviewUrl, setGoogleReviewUrl] = useState('')
  const [reviewDelayHours, setReviewDelayHours] = useState(2)
  const [reviewMessage, setReviewMessage] = useState('')
  const [avgJobValue, setAvgJobValue] = useState<string>('250')
  const [savingAutomation, setSavingAutomation] = useState(false)
  const [automationStats, setAutomationStats] = useState<{ winbacks: number; reviews: number }>({
    winbacks: 0,
    reviews: 0,
  })
  const [syncing, setSyncing] = useState(false)

  // ─── Data loading ─────────────────────────────────────────────────────────

  useEffect(() => { loadData() }, [])

  async function loadData() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data: b } = await supabase.from('businesses').select('*').eq('owner_user_id', user.id).single()
    if (b) {
      const biz = b as Record<string, unknown>
      setBiz(biz as Record<string, string>)
      setBizId((biz.id as string) ?? null)
      const cfg = (biz.notifications_config ?? {}) as Record<string, unknown>
      setAgentName((cfg.agent_name as string) || (biz.agent_name as string) || '')
      setGreeting((cfg.agent_answer_phrase as string) || (biz.greeting as string) || 'Thank you for calling. How can I help you today?')
      setServicePricing((cfg.service_pricing as ServicePricing) ?? {})
      setServiceArea((cfg.service_area as ServiceArea) ?? {})
      setIndustry((biz.industry as string) ?? null)
      setTradeType((biz.trade_type as string | null) ?? null)
      const bizServices = Array.isArray(biz.services) ? biz.services as Service[] : []
      const cfgServices = Array.isArray(cfg.services)
        ? cfg.services as Array<{ name: string; price?: number; category?: string; description?: string }>
        : []
      let seeded: Service[] = bizServices
      if (bizServices.length === 0 && cfgServices.length > 0) {
        seeded = cfgServices
          .filter(s => s && typeof s.name === 'string' && s.name.trim().length > 0)
          .map(s => ({
            id: typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
              ? crypto.randomUUID()
              : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
            name: s.name,
            price: s.price != null ? String(s.price) : '',
            unit: 'per job',
            enabled: true,
            custom: true,
          }))
      }
      setServices(seeded)
      setLoadedServices(true)
      setEscalation((cfg.escalation_rules as string) || escalation)
      setForwardTo((cfg.forward_to_number as string) || (cfg.live_transfer_number as string) || '')
      if (Array.isArray(cfg.faqs) && (cfg.faqs as unknown[]).length > 0) {
        setFaqs((cfg.faqs as Array<{ question: string; answer: string }>).map(f => ({ q: f.question, a: f.answer })))
      }
      setVoice((biz.voice as string) || 'sarah')
      setNotifs({
        emailOnTransfer: (cfg.email_on_transfer as boolean) ?? true,
        dailySummary: (cfg.daily_summary as boolean) ?? true,
        weeklyReport: (cfg.weekly_report as boolean) ?? true,
        email: (cfg.notification_email as string) || '',
        whatsapp: !!(cfg.whatsapp_number as string),
        whatsappNum: (cfg.whatsapp_number as string) || '',
        telegram: !!(cfg.telegram_chat_id as string),
        telegramUser: (cfg.telegram_chat_id as string) || '',
        urgentCall: !!(cfg.urgent_call_number as string),
        urgentNum: (cfg.urgent_call_number as string) || '',
      })
      setWinbackEnabled((biz.winback_enabled as boolean | null) ?? true)
      setWinbackMessage((biz.winback_custom_message as string | null) ?? '')
      setReviewsEnabled((biz.review_requests_enabled as boolean | null) ?? false)
      setGoogleReviewUrl((biz.google_review_url as string | null) ?? '')
      setReviewDelayHours((biz.review_request_delay_hours as number | null) ?? 2)
      setReviewMessage((biz.review_request_custom_message as string | null) ?? '')
      const ajv = biz.avg_job_value as number | string | null | undefined
      setAvgJobValue(ajv != null ? String(ajv) : '250')

      void (async () => {
        const businessId = biz.id as string
        const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()
        const [winbacksRes, reviewsRes] = await Promise.all([
          supabase.from('calls').select('id', { count: 'exact', head: true })
            .eq('business_id', businessId).eq('winback_sent', true).gte('winback_sent_at', startOfMonth),
          supabase.from('review_requests').select('id', { count: 'exact', head: true })
            .eq('business_id', businessId).gte('sent_at', startOfMonth),
        ])
        setAutomationStats({ winbacks: winbacksRes.count ?? 0, reviews: reviewsRes.count ?? 0 })
      })()
    }
    const { data: members } = await supabase.from('users').select('email, role').eq('business_id', (b as Record<string, string>)?.id)
    setTeam(members || [])
  }

  // ─── Save handlers (logic unchanged) ──────────────────────────────────────

  function flash(msg: string) {
    setSaved(msg)
    setTimeout(() => setSaved(''), 3500)
  }

  async function changePassword() {
    if (newPassword !== confirmPassword) { setPasswordMsg('Passwords do not match ❌'); return }
    if (newPassword.length < 8) { setPasswordMsg('Password must be at least 8 characters ❌'); return }
    setChangingPw(true)
    const res = await fetch('/api/auth/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: newPassword }),
    })
    const data = await res.json()
    setChangingPw(false)
    if (res.ok) { setPasswordMsg('Password updated ✅'); setNewPassword(''); setConfirmPassword('') }
    else setPasswordMsg(data.error + ' ❌')
    setTimeout(() => setPasswordMsg(''), 4000)
  }

  async function saveAutomation() {
    if (!biz.id) return
    setSavingAutomation(true)
    try {
      const url = googleReviewUrl.trim()
      if (reviewsEnabled && url && !/^https?:\/\//i.test(url)) {
        flash('Review URL must start with https:// ❌')
        return
      }
      const parsedAvg = Number.parseFloat(avgJobValue)
      const patch: Record<string, unknown> = {
        winback_enabled: winbackEnabled,
        winback_custom_message: winbackMessage.trim() || null,
        review_requests_enabled: reviewsEnabled,
        google_review_url: url || null,
        review_request_delay_hours: reviewDelayHours,
        review_request_custom_message: reviewMessage.trim() || null,
        avg_job_value: Number.isFinite(parsedAvg) && parsedAvg >= 0 ? parsedAvg : 250,
      }
      const { error } = await supabase.from('businesses').update(patch).eq('id', biz.id)
      flash(error ? 'Save failed ❌' : 'Saved ✅')
    } finally {
      setSavingAutomation(false)
    }
  }

  async function saveBusiness() {
    if (!biz.id) return
    const patch: Record<string, unknown> = {
      name: biz.name ?? null,
      phone_number: biz.phone_number ?? null,
      website: biz.website ?? null,
      address: biz.address ?? null,
      abn: biz.abn ?? null,
      voice,
    }
    await supabase.from('businesses').update(patch).eq('id', biz.id)
    flash('Saved ✅')
  }

  async function saveNotifications() {
    if (!biz.id) return
    const { data: row } = await supabase.from('businesses').select('notifications_config').eq('id', biz.id).maybeSingle()
    const existingCfg = ((row?.notifications_config ?? {}) as Record<string, unknown>) ?? {}
    const nextCfg: Record<string, unknown> = {
      ...existingCfg,
      email_on_transfer: notifs.emailOnTransfer,
      daily_summary: notifs.dailySummary,
      weekly_report: notifs.weeklyReport,
      notification_email: notifs.email || null,
      whatsapp_number: notifs.whatsapp ? (notifs.whatsappNum || null) : null,
      telegram_chat_id: notifs.telegram ? (notifs.telegramUser || null) : null,
      urgent_call_number: notifs.urgentCall ? (notifs.urgentNum || null) : null,
    }
    const { error } = await supabase.from('businesses').update({ notifications_config: nextCfg }).eq('id', biz.id)
    flash(error ? (error.message ?? 'Could not save preferences') + ' ❌' : 'Preferences saved ✅')
  }

  async function saveServices(next: Service[]) {
    if (savingServices) return
    setSavingServices(true)
    try {
      const res = await fetch('/api/portal/services', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ services: next }),
      })
      const data = await res.json()
      flash(!res.ok || !data.success ? (data.error ?? 'Could not save services') + ' ❌' : 'Services saved ✅')
    } catch (e) {
      flash((e as Error).message + ' ❌')
    } finally {
      setSavingServices(false)
    }
  }

  async function syncAI() {
    setSyncing(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { data: b } = await supabase.from('businesses').select('id, notifications_config').eq('owner_user_id', user.id).single()
      if (b) {
        const existingCfg = ((b as Record<string, unknown>).notifications_config ?? {}) as Record<string, unknown>
        const faqsToSave = faqs.map(f => ({ question: f.q, answer: f.a }))
        await supabase.from('businesses').update({
          greeting,
          agent_name: agentName,
          notifications_config: {
            ...existingCfg,
            agent_name: agentName,
            agent_answer_phrase: greeting,
            escalation_rules: escalation,
            faqs: faqsToSave,
          },
        }).eq('id', b.id)
      }
    }
    const r = await fetch('/api/vapi/sync', { method: 'POST' })
    setSyncing(false)
    flash(r.ok ? 'Synced to AI agent ✅' : 'Sync failed ❌')
  }

  async function previewVoice(voiceId: string) {
    try {
      const res = await fetch(`/api/voice/preview?voice=${voiceId}&t=${Date.now()}`)
      if (!res.ok) return
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const audio = new Audio(url)
      audio.play()
      audio.onended = () => URL.revokeObjectURL(url)
    } catch (e) {
      console.error('Voice preview failed', e)
    }
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="flex min-h-screen flex-col">
      {/* Top bar */}
      <div className="flex h-[72px] flex-shrink-0 items-center justify-between border-b border-line px-8">
        <h1 className="text-[20px] font-[800] tracking-[-0.4px] text-text">Settings</h1>
        {saved && (
          <span className={`text-[13px] font-semibold ${saved.includes('❌') ? 'text-red' : 'text-green'}`}>
            {saved}
          </span>
        )}
      </div>

      {/* 2-col layout: left sub-nav + right form */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── Left sub-nav ─────────────────────────────────────────────────── */}
        <nav className="w-[220px] flex-shrink-0 border-r border-line p-4 flex flex-col gap-[2px] overflow-y-auto">
          {tabs.map(t => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={[
                'flex items-center gap-2.5 rounded-[10px] px-3 py-2.5',
                'text-[14px] font-semibold transition-colors text-left w-full',
                tab === t.key
                  ? 'bg-[rgba(238,106,44,.10)] text-text'
                  : 'text-dim hover:bg-white/[.04] hover:text-text',
              ].join(' ')}
            >
              <span className="text-base leading-none">{t.icon}</span>
              {t.label}
            </button>
          ))}
        </nav>

        {/* ── Right form area ───────────────────────────────────────────────── */}
        <div className="flex-1 min-w-0 overflow-y-auto p-8 space-y-6">

          {/* ══ Business Info ══════════════════════════════════════════════════ */}
          {tab === 'business' && (
            <>
              <div className="max-w-3xl">
                <h2 className="text-[19px] font-[800] tracking-[-0.3px] text-text">Business Information</h2>
                <p className="mt-1 text-[13.5px] text-dim">Used by your AI agent when speaking to callers.</p>
              </div>

              <Panel className="max-w-3xl">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-[18px]">
                  <Field label="Business Name">
                    <input
                      className={fieldCls}
                      value={biz.name || ''}
                      onChange={e => setBiz(b => ({ ...b, name: e.target.value }))}
                    />
                  </Field>
                  <Field label="Phone Number">
                    <input
                      className={fieldCls}
                      value={biz.phone_number || ''}
                      onChange={e => setBiz(b => ({ ...b, phone_number: e.target.value }))}
                    />
                  </Field>
                  <Field label="Website">
                    <input
                      className={fieldCls}
                      value={biz.website || ''}
                      onChange={e => setBiz(b => ({ ...b, website: e.target.value }))}
                    />
                  </Field>
                  <Field label="Address">
                    <input
                      className={fieldCls}
                      value={biz.address || ''}
                      onChange={e => setBiz(b => ({ ...b, address: e.target.value }))}
                    />
                  </Field>
                  <Field label="ABN">
                    <div>
                      <div className="relative">
                        <input
                          className={fieldCls}
                          value={biz.abn || ''}
                          onChange={e => {
                            const digits = e.target.value.replace(/\D/g, '').slice(0, 11)
                            setBiz(b => ({ ...b, abn: digits }))
                          }}
                          placeholder="11 digit ABN"
                          inputMode="numeric"
                        />
                        {(biz.abn_verified === 'true' || (biz.abn_verified as unknown) === true) && (
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold px-2 py-0.5 rounded-full bg-green/10 text-green tracking-wide">
                            ✓ Verified
                          </span>
                        )}
                      </div>
                      <Hint>Your Australian Business Number. Used for invoicing.</Hint>
                    </div>
                  </Field>
                </div>

                <div className="mt-5 flex justify-end border-t border-line pt-5">
                  <ButtonV2 onClick={saveBusiness} className="px-6 py-2.5 text-[14px]">
                    Save Changes
                  </ButtonV2>
                </div>
              </Panel>
            </>
          )}

          {/* ══ AI Voice Agent ══════════════════════════════════════════════════ */}
          {tab === 'ai' && (
            <>
              <div>
                <h2 className="text-[19px] font-[800] tracking-[-0.3px] text-text">AI Voice Agent</h2>
                <p className="mt-1 text-[13.5px] text-dim">Changes sync to your live AI agent instantly.</p>
              </div>

              <Panel>
                {/* Agent name */}
                <div className="mb-5">
                  <label className={labelCls}>Agent name</label>
                  <input
                    className={fieldCls}
                    value={agentName}
                    onChange={e => setAgentName(e.target.value)}
                    placeholder="e.g. Sarah, Jake, Alex — leave blank for no name"
                  />
                  <Hint>This is what your AI agent will call itself when answering calls.</Hint>
                </div>

                {/* Greeting */}
                <div className="mb-5">
                  <label className={labelCls}>Greeting message</label>
                  <textarea
                    className={fieldCls + ' resize-y'}
                    rows={3}
                    value={greeting}
                    onChange={e => setGreeting(e.target.value)}
                  />
                </div>

                {/* Voice selection */}
                <div className="mb-5">
                  <label className={labelCls}>Voice</label>
                  <div className="grid grid-cols-2 gap-2.5">
                    {voices.map(v => (
                      <div
                        key={v.id}
                        onClick={() => setVoice(v.id)}
                        className={[
                          'flex items-center gap-2.5 rounded-[12px] border p-3.5 cursor-pointer transition-colors',
                          voice === v.id
                            ? 'border-orange bg-orange/[.08]'
                            : 'border-[var(--line-strong)] bg-card-2 hover:border-orange/40',
                        ].join(' ')}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="text-[14px] font-semibold text-text">🎙️ {v.name}</div>
                          <div className="text-[12px] text-dim truncate">{v.desc}</div>
                        </div>
                        <button
                          type="button"
                          onClick={e => { e.stopPropagation(); previewVoice(v.id) }}
                          className={[
                            'flex-shrink-0 rounded-md px-2.5 py-1 text-[11px] font-semibold text-white transition',
                            voice === v.id
                              ? 'bg-orange hover:brightness-110'
                              : 'bg-white/10 hover:bg-white/20',
                          ].join(' ')}
                        >
                          ▶ Preview
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Custom FAQs */}
                <div className="mb-5">
                  <label className={labelCls}>Custom FAQs</label>
                  <div className="space-y-3">
                    {faqs.map((faq, i) => (
                      <div key={i} className="rounded-[12px] border border-line bg-card-2 p-3.5">
                        <div className="flex gap-2 mb-2">
                          <input
                            className={fieldCls + ' flex-1'}
                            placeholder={`Question ${i + 1}`}
                            value={faq.q}
                            onChange={e => { const f = [...faqs]; f[i] = { ...f[i], q: e.target.value }; setFaqs(f) }}
                          />
                          <button
                            type="button"
                            onClick={() => setFaqs(f => f.filter((_, j) => j !== i))}
                            className="flex-shrink-0 rounded-lg bg-red/10 px-3 text-red hover:bg-red/20 transition"
                          >
                            ✕
                          </button>
                        </div>
                        <textarea
                          className={fieldCls + ' resize-y'}
                          placeholder="Answer"
                          rows={2}
                          value={faq.a}
                          onChange={e => { const f = [...faqs]; f[i] = { ...f[i], a: e.target.value }; setFaqs(f) }}
                        />
                      </div>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => setFaqs(f => [...f, { q: '', a: '' }])}
                    className="mt-3 w-full rounded-[10px] border border-dashed border-blue/30 py-3 text-[13px] font-medium text-blue hover:border-blue/60 hover:bg-blue/5 transition"
                  >
                    + Add FAQ
                  </button>
                </div>

                {/* Call forwarding (read-only if set) */}
                {forwardTo && (
                  <div className="mb-5">
                    <label className={labelCls}>Call forwarding number</label>
                    <input className={fieldCls + ' opacity-60 cursor-default'} value={forwardTo} readOnly />
                    <Hint>Calls transferred here when escalation is triggered. Contact TalkMate to update.</Hint>
                  </div>
                )}

                {/* Escalation rules */}
                <div className="mb-5">
                  <label className={labelCls}>Escalation rules</label>
                  <textarea
                    className={fieldCls + ' resize-y'}
                    rows={4}
                    value={escalation}
                    onChange={e => setEscalation(e.target.value)}
                  />
                </div>

                {/* ServicePricingEditor (conditional) */}
                {Object.keys(servicePricing).length > 0 && (
                  <div className="mb-4">
                    <ServicePricingEditor value={servicePricing} onChange={async (v) => {
                      setServicePricing(v)
                      if (!bizId) return
                      const cfg = (biz as Record<string, unknown>).notifications_config as Record<string, unknown> ?? {}
                      await supabase.from('businesses').update({ notifications_config: { ...cfg, service_pricing: v } }).eq('id', bizId)
                    }} />
                  </div>
                )}

                {/* ServicesEditor */}
                {loadedServices && (
                  <div className="mb-4">
                    <ServicesEditor
                      mode="client"
                      industry={industry}
                      trade_type={tradeType}
                      saved={services}
                      onChange={({ services: next }) => { setServices(next); saveServices(next) }}
                    />
                  </div>
                )}

                {/* ServiceAreaEditor */}
                <div className="mb-6">
                  <ServiceAreaEditor
                    value={serviceArea}
                    businessAddress={biz.address ?? ''}
                    onChange={async (v) => {
                      setServiceArea(v)
                      if (!bizId) return
                      const cfg = (biz as Record<string, unknown>).notifications_config as Record<string, unknown> ?? {}
                      await supabase.from('businesses').update({ notifications_config: { ...cfg, service_area: v } }).eq('id', bizId)
                    }}
                  />
                </div>

                {/* Divert instructions */}
                <DivertInstructions agentNumber={(biz as Record<string, string>).agent_phone_number || undefined} />

                {/* Save bar */}
                <div className="mt-5 flex items-center gap-3 border-t border-line pt-5">
                  <ButtonV2 onClick={syncAI} disabled={syncing} className="px-6 py-2.5 text-[14px]">
                    {syncing ? 'Syncing…' : 'Save & Sync to AI'}
                  </ButtonV2>
                  <ButtonV2
                    variant="secondary"
                    onClick={() => previewVoice(greeting || 'Hi, thank you for calling!')}
                    className="px-5 py-2.5 text-[14px]"
                  >
                    🎧 Preview Voice
                  </ButtonV2>
                </div>

                {/* SyncAgentButton */}
                <div className="mt-5 border-t border-line pt-5">
                  <p className="mb-2.5 text-[13px] text-dim">
                    Push VIP callers, team members, and agent tools to your live AI agent.
                  </p>
                  <SyncAgentButton
                    hasAgent={!!biz.vapi_agent_id}
                    initialLastSyncedAt={biz.agent_last_synced_at ?? null}
                  />
                </div>
              </Panel>
            </>
          )}

          {/* ══ Automation ══════════════════════════════════════════════════════ */}
          {tab === 'automation' && (
            <>
              <div>
                <h2 className="text-[19px] font-[800] tracking-[-0.3px] text-text">Automation</h2>
                <p className="mt-1 text-[13.5px] text-dim">
                  Win back missed callers and ask happy customers for a Google review — automatically.
                </p>
              </div>

              {/* Stats row */}
              <div className="grid grid-cols-2 gap-3">
                <Panel className="flex flex-col gap-1">
                  <span className="text-[11px] font-bold uppercase tracking-[.1em] text-dim">Win-backs this month</span>
                  <span className="text-[28px] font-[800] text-orange">{automationStats.winbacks}</span>
                </Panel>
                <Panel className="flex flex-col gap-1">
                  <span className="text-[11px] font-bold uppercase tracking-[.1em] text-dim">Review requests this month</span>
                  <span className="text-[28px] font-[800] text-green">{automationStats.reviews}</span>
                </Panel>
              </div>

              {/* Win-back card */}
              <Panel>
                <div className="flex items-start justify-between gap-4 mb-4">
                  <div>
                    <p className="text-[15px] font-bold text-text mb-1">Missed Call Win-back</p>
                    <p className="text-[12px] text-dim">Sent automatically when a caller hangs up within 15 seconds.</p>
                  </div>
                  <Switch checked={winbackEnabled} onChange={setWinbackEnabled} variant="orange" />
                </div>
                {winbackEnabled && (
                  <div>
                    <label className={labelCls}>Message</label>
                    <textarea
                      className={fieldCls + ' resize-y'}
                      rows={3}
                      value={winbackMessage}
                      onChange={e => setWinbackMessage(e.target.value)}
                      placeholder="Hey, we missed your call at {business_name}. We are here to help, how can we assist?"
                    />
                    <Hint>
                      Use <code className="rounded bg-white/5 px-1 py-px text-[10px]">{'{business_name}'}</code> for your business name. Leave blank for the default message.
                    </Hint>
                  </div>
                )}
              </Panel>

              {/* Google Review card */}
              <Panel>
                <div className="flex items-start justify-between gap-4 mb-4">
                  <div>
                    <p className="text-[15px] font-bold text-text mb-1">Google Review Requests</p>
                    <p className="text-[12px] text-dim">Texts a review link to callers a few hours after their call.</p>
                  </div>
                  <Switch checked={reviewsEnabled} onChange={setReviewsEnabled} variant="orange" />
                </div>
                {reviewsEnabled && (
                  <div className="grid gap-4">
                    <div>
                      <label className={labelCls}>Google Review URL</label>
                      <input
                        type="url"
                        className={fieldCls}
                        value={googleReviewUrl}
                        onChange={e => setGoogleReviewUrl(e.target.value)}
                        placeholder="https://g.page/r/your-business/review"
                      />
                      <details className="mt-2">
                        <summary className="cursor-pointer text-[11px] text-blue">How to find your Google Review link</summary>
                        <ol className="mt-2 list-decimal pl-5 text-[12px] text-dim space-y-1">
                          <li>Search your business on Google.</li>
                          <li>Click <em>Get more reviews</em> in the business panel.</li>
                          <li>Copy the link that appears and paste it above.</li>
                        </ol>
                      </details>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className={labelCls}>Send after</label>
                        <select
                          className={fieldCls + ' cursor-pointer'}
                          value={reviewDelayHours}
                          onChange={e => setReviewDelayHours(parseInt(e.target.value, 10))}
                        >
                          <option value={1}>1 hour</option>
                          <option value={2}>2 hours</option>
                          <option value={4}>4 hours</option>
                          <option value={24}>24 hours</option>
                        </select>
                      </div>
                      <div>
                        <label className={labelCls}>Average job value (AUD)</label>
                        <input
                          type="number"
                          min={0}
                          step={1}
                          className={fieldCls}
                          value={avgJobValue}
                          onChange={e => setAvgJobValue(e.target.value)}
                        />
                      </div>
                    </div>
                    <div>
                      <label className={labelCls}>Custom message (optional)</label>
                      <textarea
                        className={fieldCls + ' resize-y'}
                        rows={3}
                        value={reviewMessage}
                        onChange={e => setReviewMessage(e.target.value)}
                        placeholder="Thanks for choosing {business_name}! Leave us a review: {review_url}"
                      />
                      <Hint>
                        Use <code className="rounded bg-white/5 px-1 py-px text-[10px]">{'{business_name}'}</code> and{' '}
                        <code className="rounded bg-white/5 px-1 py-px text-[10px]">{'{review_url}'}</code>.
                      </Hint>
                    </div>
                  </div>
                )}
              </Panel>

              <div className="flex justify-end">
                <ButtonV2
                  onClick={saveAutomation}
                  disabled={savingAutomation}
                  className="px-8 py-2.5 text-[14px]"
                >
                  {savingAutomation ? 'Saving…' : 'Save Automation Settings'}
                </ButtonV2>
              </div>
            </>
          )}

          {/* ══ Notifications ══════════════════════════════════════════════════ */}
          {tab === 'notifications' && (
            <>
              <div>
                <h2 className="text-[19px] font-[800] tracking-[-0.3px] text-text">Notifications</h2>
                <p className="mt-1 text-[13.5px] text-dim">Control when and how you get alerted.</p>
              </div>

              {/* Email card */}
              <Panel>
                <p className="mb-4 text-[11px] font-bold uppercase tracking-[.08em] text-dim">📧 Email</p>
                <div className="mb-4">
                  <label className={labelCls}>Notification email</label>
                  <input
                    type="email"
                    className={fieldCls}
                    value={notifs.email}
                    onChange={e => setNotifs(n => ({ ...n, email: e.target.value }))}
                    placeholder="you@yourbusiness.com.au"
                  />
                </div>
                {(
                  [
                    ['emailOnTransfer', 'Email on every call transfer'],
                    ['dailySummary', 'Daily summary email'],
                    ['weeklyReport', 'Weekly report email'],
                  ] as const
                ).map(([k, l]) => (
                  <div key={k} className="flex items-center justify-between border-b border-line py-3 last:border-0">
                    <span className="text-[14px] text-text">{l}</span>
                    <Switch
                      checked={!!(notifs as Record<string, unknown>)[k]}
                      onChange={v => setNotifs(n => ({ ...n, [k]: v }))}
                      variant="orange"
                    />
                  </div>
                ))}
              </Panel>

              {/* WhatsApp card */}
              <Panel>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-[.08em] text-dim">💬 WhatsApp</span>
                  <Switch checked={notifs.whatsapp} onChange={v => setNotifs(n => ({ ...n, whatsapp: v }))} variant="orange" />
                </div>
                {notifs.whatsapp && (
                  <div className="mt-4">
                    <label className={labelCls}>WhatsApp number</label>
                    <input
                      type="tel"
                      className={fieldCls}
                      value={notifs.whatsappNum}
                      onChange={e => setNotifs(n => ({ ...n, whatsappNum: e.target.value }))}
                      placeholder="+61 4XX XXX XXX"
                    />
                  </div>
                )}
              </Panel>

              {/* Telegram card */}
              <Panel>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-[.08em] text-dim">✈️ Telegram</span>
                  <Switch checked={notifs.telegram} onChange={v => setNotifs(n => ({ ...n, telegram: v }))} variant="orange" />
                </div>
                {notifs.telegram && (
                  <div className="mt-4">
                    <label className={labelCls}>Telegram Chat ID</label>
                    <input
                      className={fieldCls}
                      value={notifs.telegramUser}
                      onChange={e => setNotifs(n => ({ ...n, telegramUser: e.target.value }))}
                      placeholder="@yourusername"
                    />
                  </div>
                )}
              </Panel>

              {/* Urgent call-through card */}
              <Panel className="border-orange/25 bg-orange/[.04]">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-[.08em] text-orange">📞 Urgent Call-Through</p>
                    <p className="mt-1 text-[12px] text-dim">Call your mobile when something urgent happens</p>
                  </div>
                  <Switch checked={notifs.urgentCall} onChange={v => setNotifs(n => ({ ...n, urgentCall: v }))} variant="orange" />
                </div>
                {notifs.urgentCall && (
                  <div className="mt-4">
                    <label className={labelCls}>Mobile number</label>
                    <input
                      type="tel"
                      className={fieldCls}
                      value={notifs.urgentNum}
                      onChange={e => setNotifs(n => ({ ...n, urgentNum: e.target.value }))}
                      placeholder="+61 4XX XXX XXX"
                    />
                  </div>
                )}
              </Panel>

              <div className="flex justify-end">
                <ButtonV2 onClick={saveNotifications} className="px-6 py-2.5 text-[14px]">
                  Save Preferences
                </ButtonV2>
              </div>

              {/* Intelligence alert settings (self-fetching) */}
              <IntelligenceAlertSettings />
            </>
          )}

          {/* ══ Team ════════════════════════════════════════════════════════════ */}
          {tab === 'team' && (
            <>
              <div>
                <h2 className="text-[19px] font-[800] tracking-[-0.3px] text-text">Team Access</h2>
                <p className="mt-1 text-[13.5px] text-dim">Invite team members to access your portal.</p>
              </div>

              <Panel>
                <p className="mb-4 text-[13px] font-semibold text-text">Invite a member</p>
                <div className="flex gap-3">
                  <input
                    type="email"
                    className={fieldCls + ' flex-1'}
                    value={inviteEmail}
                    onChange={e => setInviteEmail(e.target.value)}
                    placeholder="colleague@yourbusiness.com.au"
                  />
                  <ButtonV2
                    onClick={() => { flash('Invite sent ✅'); setInviteEmail('') }}
                    className="flex-shrink-0 px-5 py-2.5"
                  >
                    Send Invite
                  </ButtonV2>
                </div>
              </Panel>

              {team.length > 0 && (
                <Panel>
                  <p className="mb-4 text-[13px] font-semibold text-text">Current members</p>
                  <div className="space-y-2">
                    {team.map((m, i) => (
                      <div key={i} className="flex items-center gap-3.5 rounded-[10px] bg-card-2 p-3.5">
                        <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-[linear-gradient(135deg,#E8622A,#4A9FE8)] text-[13px] font-bold text-white">
                          {m.email[0].toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[14px] font-semibold text-text truncate">{m.email}</p>
                          <p className="text-[12px] text-dim capitalize">{m.role}</p>
                        </div>
                        <span className="flex-shrink-0 rounded-full bg-orange/10 px-2.5 py-0.5 text-[11px] font-bold text-orange">
                          {m.role}
                        </span>
                      </div>
                    ))}
                  </div>
                </Panel>
              )}

              {/* Change Password */}
              <Panel>
                <p className="mb-1 text-[15px] font-bold text-text">Change Password</p>
                <p className="mb-5 text-[13px] text-dim">Update your portal login password.</p>
                {passwordMsg && (
                  <div className={[
                    'mb-4 rounded-[10px] px-3.5 py-2.5 text-[13px]',
                    passwordMsg.includes('✅') ? 'bg-green/10 text-green' : 'bg-red/10 text-red',
                  ].join(' ')}>
                    {passwordMsg}
                  </div>
                )}
                <div className="grid grid-cols-2 gap-4 mb-5">
                  <div>
                    <label className={labelCls}>New Password</label>
                    <input
                      type="password"
                      className={fieldCls}
                      value={newPassword}
                      onChange={e => setNewPassword(e.target.value)}
                      placeholder="Min. 8 characters"
                    />
                  </div>
                  <div>
                    <label className={labelCls}>Confirm Password</label>
                    <input
                      type="password"
                      className={fieldCls}
                      value={confirmPassword}
                      onChange={e => setConfirmPassword(e.target.value)}
                      placeholder="Repeat password"
                    />
                  </div>
                </div>
                <ButtonV2
                  onClick={changePassword}
                  disabled={changingPw || !newPassword}
                  className="px-6 py-2.5 text-[14px]"
                >
                  {changingPw ? 'Updating...' : 'Update Password'}
                </ButtonV2>
              </Panel>
            </>
          )}

          {/* ══ Integrations ════════════════════════════════════════════════════ */}
          {tab === 'integrations' && (
            <>
              <div>
                <h2 className="text-[19px] font-[800] tracking-[-0.3px] text-text">Integrations</h2>
                <p className="mt-1 text-[13.5px] text-dim">Connect third-party services to your TalkMate account.</p>
              </div>

              {/* WhatsApp */}
              <Panel>
                <p className="mb-1 text-[16px] font-bold text-text">Connect WhatsApp Business</p>
                <p className="mb-5 text-[13px] text-dim">Receive call summaries and notifications via WhatsApp.</p>
                <ol className="mb-5 space-y-2">
                  {[
                    'Go to business.facebook.com and set up a WhatsApp Business account',
                    'Navigate to WhatsApp → Configuration → Webhook',
                    <span key="wh-url">Set Webhook URL to: <code className="rounded bg-white/[.08] px-1.5 py-px text-[12px] text-blue font-mono">https://app.talkmate.com.au/api/webhooks/whatsapp</code></span>,
                    <span key="wh-token">Set Verify Token to: <code className="rounded bg-white/[.08] px-1.5 py-px text-[12px] text-blue font-mono">talkmate-whatsapp-2026</code></span>,
                    'Subscribe to the messages field',
                    'Enter your WhatsApp Business phone number below and save',
                  ].map((step, i) => (
                    <li key={i} className="flex gap-2 text-[14px] text-white/70">
                      <span className="flex-shrink-0 font-bold text-orange">{i + 1}.</span>
                      <span>{step}</span>
                    </li>
                  ))}
                </ol>
                <div className="mb-4">
                  <label className={labelCls}>WhatsApp Business Number</label>
                  <input
                    className={fieldCls}
                    value={notifs.whatsappNum}
                    onChange={e => setNotifs(n => ({ ...n, whatsappNum: e.target.value }))}
                    placeholder="+61412345678"
                  />
                </div>
                <ButtonV2
                  onClick={async () => {
                    if (!bizId) return
                    const cfg = (biz as Record<string, unknown>).notifications_config as Record<string, unknown> ?? {}
                    await supabase.from('businesses').update({ notifications_config: { ...cfg, whatsapp_number: notifs.whatsappNum } }).eq('id', bizId)
                    flash('WhatsApp saved ✅')
                  }}
                  className="px-6 py-2.5 text-[14px]"
                >
                  Save
                </ButtonV2>
              </Panel>

              {/* Telegram */}
              <Panel>
                <p className="mb-1 text-[16px] font-bold text-text">Connect Telegram Notifications</p>
                <p className="mb-5 text-[13px] text-dim">Get instant call alerts sent directly to your Telegram.</p>
                <ol className="mb-5 space-y-2">
                  {[
                    'Open Telegram and search for @DonnaAssistant2026Bot',
                    'Send /start to the bot',
                    'The bot will reply with your unique Chat ID',
                    'Paste your Chat ID below and save',
                  ].map((step, i) => (
                    <li key={i} className="flex gap-2 text-[14px] text-white/70">
                      <span className="flex-shrink-0 font-bold text-orange">{i + 1}.</span>
                      <span>{step}</span>
                    </li>
                  ))}
                </ol>
                <div className="mb-4">
                  <label className={labelCls}>Your Telegram Chat ID</label>
                  <input
                    className={fieldCls}
                    value={notifs.telegramUser}
                    onChange={e => setNotifs(n => ({ ...n, telegramUser: e.target.value }))}
                    placeholder="e.g. 123456789"
                  />
                </div>
                <ButtonV2
                  onClick={async () => {
                    if (!bizId) return
                    const cfg = (biz as Record<string, unknown>).notifications_config as Record<string, unknown> ?? {}
                    await supabase.from('businesses').update({ notifications_config: { ...cfg, telegram_chat_id: notifs.telegramUser } }).eq('id', bizId)
                    flash('Telegram saved ✅')
                  }}
                  className="px-6 py-2.5 text-[14px]"
                >
                  Save
                </ButtonV2>
              </Panel>
            </>
          )}

        </div>{/* /form-area */}
      </div>{/* /2-col */}
    </div>
  )
}
