'use client'

// AI Receptionist hub (/train) — the unified, tabbed agent-configuration screen
// (design audit #21/#22). One page with: Voice & Personality · Greeting Script
// (+ Call Flow) · FAQ Knowledge · Escalation Rules · Call Hours, plus a live
// preview rail. The owner edits everything here; the same fields are also
// writable from Settings → AI Voice Agent (kept consistent — both write
// businesses.{voice,greeting,agent_name,opening_hours} + notifications_config).
//
// Admin-on-behalf (/admin/clients/[id]/portal/train) renders only the tabs that
// have an admin-override API — FAQ Knowledge + Call Flow — since the voice/
// greeting/escalation/hours fields have no on-behalf save path.

import { useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { UnderlineTabs } from '@/components/portal/ui-v2/tabs'
import { ButtonV2 } from '@/components/portal/ui-v2/button'
import { Switch } from '@/components/portal/ui-v2/switch'
import { Play } from 'lucide-react'
import FaqKnowledgeTab from './faq-knowledge-tab'
import CallFlowTab from './call-flow-tab'
import type { KbEntryDTO, SyncStatus } from './types'

// Re-export so the server pages keep importing these from train-view unchanged.
export type { KbEntryDTO, SyncStatus } from './types'

export interface DayHours { open: string; close: string; closed: boolean }
export type OpeningHours = Record<string, DayHours>

interface Props {
  businessName: string
  hasVapiAgent: boolean
  initialEntries: KbEntryDTO[]
  initialSyncStatus: SyncStatus
  initialLastSyncedAt: string | null
  adminClientId?: string | null
  // Owner-only agent config (absent in admin-on-behalf mode).
  initialAgentName?: string
  initialGreeting?: string
  initialVoice?: string
  initialEscalation?: string
  forwardTo?: string
  initialOpeningHours?: OpeningHours
}

type HubTab = 'voice' | 'greeting' | 'faq' | 'escalation' | 'hours' | 'callflow'

const voices = [
  { id: 'sarah', name: 'Charlotte', meta: 'Australian English · Female · Warm', sample: '"Good morning, thanks for calling…"' },
  { id: 'james', name: 'James', meta: 'Australian English · Male · Professional', sample: '"Thanks for calling, I\'m James…"' },
  { id: 'emma', name: 'Emma', meta: 'Australian English · Female · Energetic', sample: '"Hi there! You\'ve reached…"' },
  { id: 'liam', name: 'Liam', meta: 'Australian English · Male · Deep', sample: '"G\'day, you\'re through to…"' },
]

const DAYS: { key: string; short: string }[] = [
  { key: 'Monday', short: 'Mon' },
  { key: 'Tuesday', short: 'Tue' },
  { key: 'Wednesday', short: 'Wed' },
  { key: 'Thursday', short: 'Thu' },
  { key: 'Friday', short: 'Fri' },
  { key: 'Saturday', short: 'Sat' },
  { key: 'Sunday', short: 'Sun' },
]

function seedHours(initial?: OpeningHours): OpeningHours {
  const out: OpeningHours = {}
  for (const d of DAYS) {
    const existing = initial?.[d.key]
    if (existing && typeof existing.open === 'string') {
      out[d.key] = { open: existing.open || '09:00', close: existing.close || '17:00', closed: !!existing.closed }
    } else {
      const weekend = d.key === 'Saturday' || d.key === 'Sunday'
      out[d.key] = { open: '09:00', close: weekend ? '13:00' : '17:00', closed: weekend }
    }
  }
  return out
}

const fieldCls =
  'w-full rounded-[10px] border border-[var(--line-strong)] bg-card-2 px-3.5 py-[11px] ' +
  'text-[14.5px] text-text font-sans outline-none transition-colors ' +
  'focus:border-orange focus:shadow-[0_0_0_3px_rgba(238,106,44,.15)]'

const labelCls = 'block text-[13px] font-bold text-dim mb-[7px]'

function fmtTime(t: string): string {
  // "14:00" → "2p", "08:00" → "8a", "08:30" → "8:30a"
  const [hStr, mStr] = (t || '').split(':')
  const h = Number.parseInt(hStr, 10)
  const m = Number.parseInt(mStr, 10)
  if (!Number.isFinite(h)) return t
  const ap = h < 12 ? 'a' : 'p'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return m ? `${h12}:${String(m).padStart(2, '0')}${ap}` : `${h12}${ap}`
}

export default function TrainView(props: Props) {
  const isAdmin = !!props.adminClientId
  const supabase = createClient()

  // Tab set differs by mode.
  const tabDefs: { value: HubTab; label: string }[] = isAdmin
    ? [
        { value: 'faq', label: 'FAQ Knowledge' },
        { value: 'callflow', label: 'Call Flow' },
      ]
    : [
        { value: 'voice', label: 'Voice' },
        { value: 'greeting', label: 'Greeting Script' },
        { value: 'faq', label: 'FAQ Knowledge' },
        { value: 'escalation', label: 'Escalation Rules' },
        { value: 'hours', label: 'Call Hours' },
      ]
  const [tab, setTab] = useState<HubTab>(isAdmin ? 'faq' : 'voice')

  // ── Owner agent-config state ────────────────────────────────────────────────
  const initialConfig = useMemo(() => ({
    agentName: props.initialAgentName ?? '',
    greeting: props.initialGreeting ?? 'Thank you for calling. How can I help you today?',
    voice: props.initialVoice ?? 'sarah',
    escalation: props.initialEscalation ?? '',
    hours: seedHours(props.initialOpeningHours),
  }), [props])

  const [agentName, setAgentName] = useState(initialConfig.agentName)
  const [greeting, setGreeting] = useState(initialConfig.greeting)
  const [voice, setVoice] = useState(initialConfig.voice)
  const [escalation, setEscalation] = useState(initialConfig.escalation)
  const [hours, setHours] = useState<OpeningHours>(initialConfig.hours)
  const [snapshot, setSnapshot] = useState(initialConfig)

  const [saving, setSaving] = useState(false)
  const [flash, setFlash] = useState('')

  const current = { agentName, greeting, voice, escalation, hours }
  const dirty = JSON.stringify(current) !== JSON.stringify(snapshot)

  function discard() {
    setAgentName(snapshot.agentName)
    setGreeting(snapshot.greeting)
    setVoice(snapshot.voice)
    setEscalation(snapshot.escalation)
    setHours(snapshot.hours)
  }

  function showFlash(msg: string) {
    setFlash(msg)
    setTimeout(() => setFlash(''), 3500)
  }

  async function saveAndGoLive() {
    setSaving(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { showFlash('Not signed in ❌'); return }
      const { data: b } = await supabase
        .from('businesses')
        .select('id, notifications_config')
        .eq('owner_user_id', user.id)
        .maybeSingle()
      if (!b) { showFlash('Could not load your business ❌'); return }
      const existingCfg = ((b as Record<string, unknown>).notifications_config ?? {}) as Record<string, unknown>
      const { error } = await supabase.from('businesses').update({
        voice,
        greeting,
        agent_name: agentName,
        opening_hours: hours,
        notifications_config: {
          ...existingCfg,
          agent_name: agentName,
          agent_answer_phrase: greeting,
          escalation_rules: escalation,
          opening_hours: hours,
        },
      }).eq('id', b.id as string)
      if (error) { showFlash('Save failed ❌'); return }

      // Push to the live agent when one is configured.
      if (props.hasVapiAgent) {
        const r = await fetch('/api/vapi/sync', { method: 'POST' })
        showFlash(r.ok ? 'Saved & synced to your live agent ✅' : 'Saved ✅ — agent sync failed, retry later')
      } else {
        showFlash('Saved ✅ (agent not configured yet)')
      }
      setSnapshot({ agentName, greeting, voice, escalation, hours })
    } catch (e) {
      showFlash((e as Error).message + ' ❌')
    } finally {
      setSaving(false)
    }
  }

  async function previewVoice(voiceId: string) {
    try {
      const res = await fetch(`/api/voice/preview?voice=${voiceId}&t=${Date.now()}`)
      if (!res.ok) return
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const audio = new Audio(url)
      void audio.play()
      audio.onended = () => URL.revokeObjectURL(url)
    } catch (e) {
      console.error('Voice preview failed', e)
    }
  }

  const showSaveBar = !isAdmin && (tab === 'voice' || tab === 'greeting' || tab === 'escalation' || tab === 'hours')

  return (
    <div className="flex h-[calc(100vh-68px)] flex-col">
      {/* Tabs bar */}
      <div className="flex-shrink-0 overflow-x-auto px-6 md:px-8">
        <UnderlineTabs<HubTab> tabs={tabDefs} value={tab} onChange={(v) => setTab(v)} />
      </div>

      {/* Content: left editor (scroll) + right live-preview rail (owner only) */}
      <div className="flex min-h-0 flex-1">
        <div className="min-w-0 flex-1 overflow-y-auto p-6 md:p-8">
          <div className="mx-auto flex max-w-3xl flex-col gap-7">

            {/* ── Voice & Personality ── */}
            {tab === 'voice' && (
              <>
                <Section title="Choose a voice" desc="Your AI receptionist answers every call with this voice. Click to hear a sample.">
                  <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
                    {voices.map(v => {
                      const sel = voice === v.id
                      return (
                        <div
                          key={v.id}
                          onClick={() => setVoice(v.id)}
                          className={[
                            'relative cursor-pointer rounded-[16px] border-2 p-[18px_16px] shadow-[0_1px_4px_rgba(0,0,0,.28)] transition',
                            sel ? 'border-orange bg-orange/[.07]' : 'border-line bg-card hover:border-line-strong',
                          ].join(' ')}
                        >
                          {sel && <span className="absolute right-3.5 top-3 text-[13px] font-extrabold text-orange">✓</span>}
                          <div className="mb-1 text-[16px] font-extrabold tracking-[-.2px] text-text tnum">{v.name}</div>
                          <div className="text-[12.5px] text-dim">{v.meta}</div>
                          <div className="mt-3.5 flex items-center gap-2.5 border-t border-line pt-3">
                            <button
                              type="button"
                              onClick={e => { e.stopPropagation(); previewVoice(v.id) }}
                              aria-label={`Preview ${v.name}`}
                              className={[
                                'flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-lg border transition',
                                sel ? 'border-orange/40 bg-orange/20' : 'border-line bg-card-2 hover:border-line-strong',
                              ].join(' ')}
                            >
                              <Play size={11} className="text-text" fill="currentColor" />
                            </button>
                            <span className="truncate text-[12px] italic text-faint">{v.sample}</span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </Section>
              </>
            )}

            {/* ── Greeting Script (+ Call Flow) ── */}
            {tab === 'greeting' && (
              <>
                <Section title="Greeting script" desc="What your receptionist says when answering. Changes go live when you save.">
                  <div>
                    <label className={labelCls}>Agent name</label>
                    <input
                      className={fieldCls}
                      value={agentName}
                      onChange={e => setAgentName(e.target.value)}
                      placeholder="e.g. Ava, Sarah, Jake — leave blank for no name"
                    />
                    <p className="mt-1.5 text-[11px] text-dim">What your AI agent calls itself when answering.</p>
                  </div>
                  <div>
                    <label className={labelCls}>Greeting message</label>
                    <textarea
                      className={fieldCls + ' resize-y'}
                      rows={3}
                      value={greeting}
                      onChange={e => setGreeting(e.target.value)}
                    />
                  </div>
                </Section>

                <div className="border-t border-line pt-6">
                  <CallFlowTab adminClientId={props.adminClientId} />
                </div>
              </>
            )}

            {/* ── FAQ Knowledge ── */}
            {tab === 'faq' && (
              <FaqKnowledgeTab
                hasVapiAgent={props.hasVapiAgent}
                initialEntries={props.initialEntries}
                initialSyncStatus={props.initialSyncStatus}
                initialLastSyncedAt={props.initialLastSyncedAt}
                adminClientId={props.adminClientId}
              />
            )}

            {/* ── Call Flow (admin-only standalone tab) ── */}
            {tab === 'callflow' && <CallFlowTab adminClientId={props.adminClientId} />}

            {/* ── Escalation Rules ── */}
            {tab === 'escalation' && (
              <Section title="Escalation rules" desc="Tell your receptionist when to transfer a call to a human.">
                <div>
                  <label className={labelCls}>When to transfer or escalate</label>
                  <textarea
                    className={fieldCls + ' resize-y'}
                    rows={5}
                    value={escalation}
                    onChange={e => setEscalation(e.target.value)}
                    placeholder="Transfer if the caller asks for a manager, sounds upset, has a billing complaint, or requests a refund."
                  />
                </div>
                {props.forwardTo && (
                  <div>
                    <label className={labelCls}>Call forwarding number</label>
                    <input className={fieldCls + ' cursor-default opacity-60'} value={props.forwardTo} readOnly />
                    <p className="mt-1.5 text-[11px] text-dim">Calls transferred here when escalation triggers. Contact TalkMate to change it.</p>
                  </div>
                )}
              </Section>
            )}

            {/* ── Call Hours ── */}
            {tab === 'hours' && (
              <Section title="Answering hours" desc="Your receptionist always answers — these hours decide when it books vs. takes a message.">
                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 lg:grid-cols-7">
                  {DAYS.map(d => {
                    const h = hours[d.key]
                    return (
                      <div key={d.key} className="flex flex-col items-center gap-2 rounded-[12px] border border-line bg-card p-3">
                        <div className="text-[11.5px] font-bold uppercase tracking-[.04em] text-dim">{d.short}</div>
                        <Switch
                          checked={!h.closed}
                          onChange={(v) => setHours(prev => ({ ...prev, [d.key]: { ...prev[d.key], closed: !v } }))}
                          variant="orange"
                          aria-label={`${d.key} open`}
                        />
                        {h.closed ? (
                          <div className="text-[11px] text-faint">Off</div>
                        ) : (
                          <div className="flex w-full flex-col gap-1">
                            <input
                              type="time"
                              value={h.open}
                              onChange={e => setHours(prev => ({ ...prev, [d.key]: { ...prev[d.key], open: e.target.value } }))}
                              className="w-full rounded-md border border-[var(--line-strong)] bg-card-2 px-1.5 py-1 text-center text-[11px] text-text outline-none focus:border-orange"
                            />
                            <input
                              type="time"
                              value={h.close}
                              onChange={e => setHours(prev => ({ ...prev, [d.key]: { ...prev[d.key], close: e.target.value } }))}
                              className="w-full rounded-md border border-[var(--line-strong)] bg-card-2 px-1.5 py-1 text-center text-[11px] text-text outline-none focus:border-orange"
                            />
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </Section>
            )}

            {/* Save bar (config tabs only) */}
            {showSaveBar && (
              <div className="flex items-center justify-end gap-3 border-t border-line pt-5">
                {flash && (
                  <span className={`mr-auto text-[13px] font-semibold ${flash.includes('❌') ? 'text-red' : 'text-green'}`}>{flash}</span>
                )}
                <ButtonV2 variant="secondary" onClick={discard} disabled={!dirty || saving} className="px-5 py-2.5 text-[14px]">
                  Discard changes
                </ButtonV2>
                <ButtonV2 onClick={saveAndGoLive} disabled={saving} className="px-6 py-2.5 text-[14px]">
                  {saving ? 'Saving…' : 'Save & go live'}
                </ButtonV2>
              </div>
            )}
          </div>
        </div>

        {/* Live preview rail — owner only, large screens */}
        {!isAdmin && (
          <aside className="hidden w-[380px] flex-shrink-0 flex-col overflow-hidden border-l border-line bg-sidebar xl:flex">
            <div className="flex-shrink-0 border-b border-line px-6 pb-[18px] pt-[22px]">
              <h3 className="text-[15px] font-extrabold text-text">Live preview</h3>
              <p className="mt-1 text-[12.5px] text-dim">How your receptionist sounds with your current settings</p>
            </div>
            <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-6 py-5">
              <PreviewBubble who="av" name={agentName || 'Your agent'}>{greeting}</PreviewBubble>
              <PreviewBubble who="ca" name="Caller">Hi, my hot water&apos;s not working. Can you send someone?</PreviewBubble>
              <PreviewBubble who="av" name={agentName || 'Your agent'}>Absolutely — I can get someone out to you. Can I take your address and a good time?</PreviewBubble>
              <PreviewBubble who="ca" name="Caller">It&apos;s 14 Bower Street. Tuesday morning if you&apos;ve got it.</PreviewBubble>
              <PreviewBubble who="av" name={agentName || 'Your agent'}>Perfect — I have Tuesday at 9:00 AM. Does that work?</PreviewBubble>
              <PreviewBubble who="ca" name="Caller">Yes, great. Thanks!</PreviewBubble>
              <PreviewBubble who="av" name={agentName || 'Your agent'}>You&apos;re all booked in — confirmation SMS on its way. Have a good day! 😊</PreviewBubble>
            </div>
            <div className="flex-shrink-0 border-t border-line px-6 py-4">
              <p className="text-[12px] leading-relaxed text-faint">
                This preview reflects your greeting. <b className="text-orange">Save &amp; go live</b> to push changes to your line.
              </p>
            </div>
          </aside>
        )}
      </div>
    </div>
  )
}

function Section({ title, desc, children }: { title: string; desc: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3.5">
      <div>
        <h2 className="text-[16px] font-extrabold tracking-[-.2px] text-text">{title}</h2>
        <p className="mt-1 text-[13px] text-dim">{desc}</p>
      </div>
      {children}
    </section>
  )
}

function PreviewBubble({ who, name, children }: { who: 'av' | 'ca'; name: string; children: React.ReactNode }) {
  return (
    <div
      className={[
        'block max-w-[88%] rounded-[13px] px-3.5 py-[11px] text-[13px] leading-relaxed',
        who === 'av'
          ? 'mr-auto rounded-bl-[4px] border border-orange/20 bg-orange/[.12] text-text'
          : 'ml-auto rounded-br-[4px] border border-line bg-card text-dim',
      ].join(' ')}
    >
      <span className={`mb-[3px] block text-[10px] font-extrabold uppercase tracking-[.08em] opacity-70 ${who === 'av' ? 'text-orange' : ''}`}>{name}</span>
      {children}
    </div>
  )
}
