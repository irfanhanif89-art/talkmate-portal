'use client'

import { useState } from 'react'

// Admin-as-client chatbot view. Mirrors the client portal chatbot page but
// renders inside the admin portal shell and passes adminClientId through to
// every API call so the service-role routes act on the correct business.

export interface ChatbotConfig {
  enabled: boolean
  greeting: string | null
  agentName: string | null
  primaryColor: string | null
  collectLeadsAfter: number | null
  slug: string | null
  plan: string | null
  allowedDomains?: string[]
}

export interface ChatSessionRow {
  id: string
  leadName: string | null
  leadPhone: string | null
  leadEmail: string | null
  leadCaptured: boolean
  messageCount: number
  status: string
  startedAt: string
}

interface TranscriptMessage {
  role: string
  content: string
  createdAt: string
}

const COLLECT_OPTIONS = [1, 2, 3, 5]

export default function ChatbotAdminView({
  clientId,
  initialConfig,
  sessions,
}: {
  clientId: string
  initialConfig: ChatbotConfig
  sessions: ChatSessionRow[]
}) {
  const [config, setConfig] = useState<ChatbotConfig>(initialConfig)
  const [draft, setDraft] = useState<ChatbotConfig>(initialConfig)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null)
  const [domainInput, setDomainInput] = useState('')

  const [transcriptOpen, setTranscriptOpen] = useState(false)
  const [transcriptLoading, setTranscriptLoading] = useState(false)
  const [transcript, setTranscript] = useState<TranscriptMessage[]>([])
  const [transcriptLead, setTranscriptLead] = useState<string>('')

  const planLocked = config.plan === 'starter'
  const dirty =
    draft.enabled !== config.enabled ||
    (draft.greeting ?? '') !== (config.greeting ?? '') ||
    (draft.agentName ?? '') !== (config.agentName ?? '') ||
    (draft.primaryColor ?? '') !== (config.primaryColor ?? '') ||
    (draft.collectLeadsAfter ?? null) !== (config.collectLeadsAfter ?? null) ||
    (draft.allowedDomains ?? []).join(',') !== (config.allowedDomains ?? []).join(',')

  function showToast(msg: string, ok: boolean) {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 3500)
  }

  function addDomain() {
    const raw = domainInput.trim().toLowerCase()
    if (!raw) return
    const bare = raw.replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/^www\./, '')
    if (!bare) return
    setDraft(d => {
      const list = d.allowedDomains ?? []
      if (list.includes(bare)) return d
      return { ...d, allowedDomains: [...list, bare] }
    })
    setDomainInput('')
  }

  function removeDomain(domain: string) {
    setDraft(d => ({ ...d, allowedDomains: (d.allowedDomains ?? []).filter(x => x !== domain) }))
  }

  async function save() {
    setSaving(true)
    try {
      const res = await fetch(`/api/chatbot/config?adminClientId=${clientId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enabled: draft.enabled,
          greeting: draft.greeting ?? '',
          agentName: draft.agentName ?? '',
          primaryColor: draft.primaryColor ?? '#E8622A',
          collectLeadsAfter: draft.collectLeadsAfter ?? 2,
          allowedDomains: draft.allowedDomains ?? [],
        }),
      })
      const data = await res.json()
      if (!data.ok) {
        const map: Record<string, string> = {
          plan_locked: 'This client is on the starter plan. Upgrade required to enable the chatbot.',
          invalid_greeting: 'Greeting is too long (max 200 characters).',
          invalid_agent_name: 'Agent name is too long (max 40 characters).',
          invalid_primary_color: 'Colour must be a hex value like #E8622A.',
          invalid_collect_leads_after: 'Invalid value for collect leads after.',
          invalid_domain: 'One of the domains is not valid. Use bare domains like acme.com.au.',
          too_many_domains: 'Too many domains. Please remove some and try again.',
          no_changes: 'No changes to save.',
        }
        throw new Error(map[data.error as string] ?? data.error ?? 'Save failed')
      }
      setConfig(data.config)
      setDraft(data.config)
      showToast('Chatbot settings saved', true)
    } catch (e) {
      showToast((e as Error).message, false)
    } finally {
      setSaving(false)
    }
  }

  async function openTranscript(sessionId: string, leadLabel: string) {
    setTranscriptOpen(true)
    setTranscriptLoading(true)
    setTranscript([])
    setTranscriptLead(leadLabel)
    try {
      const res = await fetch(`/api/chatbot/sessions/${sessionId}?adminClientId=${clientId}`)
      const data = await res.json()
      if (!data.ok) throw new Error(data.error ?? 'Failed to load transcript')
      setTranscript(data.messages ?? [])
    } catch (e) {
      showToast((e as Error).message, false)
      setTranscriptOpen(false)
    } finally {
      setTranscriptLoading(false)
    }
  }

  // Match the client portal embed snippet exactly: absolute URL + data-business-id
  // + the business UUID, so the snippet shown here is copy-paste identical to what
  // the client sees and actually works on an external site.
  const widgetSrc = process.env.NEXT_PUBLIC_WIDGET_SCRIPT_URL || 'https://app.talkmate.com.au/widget/talkmate-chat.js'

  return (
    <div style={{ padding: 28, maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: '1.6rem', fontWeight: 800, color: 'white', margin: 0 }}>Website Chatbot</h1>
        <p style={{ fontSize: 13, color: '#7BAED4', margin: '4px 0 0 0' }}>
          Configure the website chat widget and review captured leads, scoped to this client only.
        </p>
      </div>

      {/* Config card */}
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
          <h2 style={cardTitle}>Chatbot configuration</h2>
          <span style={{
            fontSize: 11, padding: '3px 10px', borderRadius: 99, fontWeight: 700,
            background: config.enabled ? 'rgba(34,197,94,0.14)' : 'rgba(255,255,255,0.06)',
            color: config.enabled ? '#22C55E' : '#7BAED4',
          }}>
            {config.enabled ? 'Enabled' : 'Disabled'}
          </span>
        </div>

        {planLocked && (
          <div style={{
            padding: '11px 14px', borderRadius: 9, marginBottom: 16,
            background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.35)',
            fontSize: 12, color: '#F59E0B', fontWeight: 600,
          }}>
            This client is on the starter plan. The chatbot cannot be enabled until they upgrade.
          </div>
        )}

        {/* Enabled toggle */}
        <Field label="Enabled">
          <button
            onClick={() => setDraft(d => ({ ...d, enabled: !d.enabled }))}
            disabled={planLocked && !draft.enabled}
            style={{
              width: 46, height: 26, borderRadius: 99, border: 'none', position: 'relative',
              cursor: planLocked && !draft.enabled ? 'not-allowed' : 'pointer',
              background: draft.enabled ? '#22C55E' : 'rgba(255,255,255,0.15)',
              opacity: planLocked && !draft.enabled ? 0.5 : 1, transition: 'background 0.15s',
            }}
            aria-pressed={draft.enabled}
          >
            <span style={{
              position: 'absolute', top: 3, left: draft.enabled ? 23 : 3,
              width: 20, height: 20, borderRadius: '50%', background: 'white',
              transition: 'left 0.15s',
            }} />
          </button>
        </Field>

        {/* Agent name */}
        <Field label="Agent name">
          <input
            value={draft.agentName ?? ''}
            maxLength={40}
            onChange={e => setDraft(d => ({ ...d, agentName: e.target.value }))}
            placeholder="e.g. Talkmate"
            style={inputStyle}
          />
        </Field>

        {/* Greeting */}
        <Field label="Greeting">
          <textarea
            value={draft.greeting ?? ''}
            maxLength={200}
            rows={2}
            onChange={e => setDraft(d => ({ ...d, greeting: e.target.value }))}
            placeholder="Hi there! How can we help you today?"
            style={{ ...inputStyle, resize: 'vertical' as const, minHeight: 52 }}
          />
        </Field>

        {/* Primary colour */}
        <Field label="Primary colour">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <input
              type="color"
              value={draft.primaryColor ?? '#E8622A'}
              onChange={e => setDraft(d => ({ ...d, primaryColor: e.target.value }))}
              style={{ width: 42, height: 34, borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', cursor: 'pointer', padding: 2 }}
            />
            <input
              value={draft.primaryColor ?? ''}
              onChange={e => setDraft(d => ({ ...d, primaryColor: e.target.value }))}
              placeholder="#E8622A"
              style={{ ...inputStyle, width: 130, fontFamily: 'monospace' }}
            />
          </div>
        </Field>

        {/* Collect leads after */}
        <Field label="Collect leads after">
          <div style={{ display: 'flex', gap: 8 }}>
            {COLLECT_OPTIONS.map(n => {
              const active = (draft.collectLeadsAfter ?? 2) === n
              return (
                <button
                  key={n}
                  onClick={() => setDraft(d => ({ ...d, collectLeadsAfter: n }))}
                  style={{
                    padding: '7px 14px', borderRadius: 8, fontSize: 13, fontWeight: 700,
                    cursor: 'pointer', fontFamily: 'Outfit, sans-serif',
                    background: active ? 'rgba(232,98,42,0.16)' : 'rgba(255,255,255,0.04)',
                    border: active ? '1px solid #E8622A' : '1px solid rgba(255,255,255,0.1)',
                    color: active ? '#E8622A' : '#C8D8EA',
                  }}
                >{n}</button>
              )
            })}
            <span style={{ fontSize: 12, color: '#7BAED4', alignSelf: 'center', marginLeft: 4 }}>messages</span>
          </div>
        </Field>

        {/* Allowed domains */}
        <Field label="Allowed website domains">
          <p style={{ fontSize: 12, color: '#7BAED4', margin: '0 0 10px 0', lineHeight: 1.5 }}>
            Lock the chatbot to the websites this client owns. Leave empty to allow it anywhere.
            Add the domains where the widget is installed, for example acme.com.au
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input
              value={domainInput}
              onChange={e => setDomainInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addDomain() } }}
              placeholder="acme.com.au"
              style={{ ...inputStyle, flex: 1, minWidth: 160 }}
            />
            <button
              onClick={addDomain}
              style={{
                padding: '9px 16px', borderRadius: 8, fontSize: 13, fontWeight: 700,
                cursor: 'pointer', fontFamily: 'Outfit, sans-serif', flexShrink: 0,
                background: 'rgba(232,98,42,0.16)', border: '1px solid #E8622A', color: '#E8622A',
              }}
            >Add</button>
          </div>
          {(draft.allowedDomains ?? []).length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
              {(draft.allowedDomains ?? []).map(domain => (
                <span
                  key={domain}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 8,
                    padding: '5px 8px 5px 12px', borderRadius: 99, fontSize: 12.5, fontWeight: 600,
                    background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'white',
                  }}
                >
                  {domain}
                  <button
                    onClick={() => removeDomain(domain)}
                    aria-label={`Remove ${domain}`}
                    style={{
                      background: 'transparent', border: 'none', color: '#7BAED4', cursor: 'pointer',
                      fontSize: 15, lineHeight: 1, padding: 0,
                    }}
                  >×</button>
                </span>
              ))}
            </div>
          )}
        </Field>

        {/* Slug (read only) */}
        <Field label="Slug">
          <span style={{ fontSize: 13, color: 'white', fontFamily: 'monospace' }}>{config.slug ?? '-'}</span>
        </Field>

        {clientId && (
          <div style={{
            marginTop: 6, padding: '10px 12px', borderRadius: 9,
            background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
            fontSize: 11, color: '#7BAED4', wordBreak: 'break-all' as const, fontFamily: 'monospace',
          }}>
            {`<script src="${widgetSrc}" data-business-id="${clientId}"></script>`}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 18 }}>
          <button
            onClick={save}
            disabled={!dirty || saving}
            style={{
              padding: '10px 22px', borderRadius: 10, fontSize: 13, fontWeight: 700,
              border: 'none', fontFamily: 'Outfit, sans-serif',
              background: !dirty || saving ? 'rgba(232,98,42,0.4)' : '#E8622A',
              color: 'white', cursor: !dirty || saving ? 'default' : 'pointer',
            }}
          >{saving ? 'Saving…' : 'Save changes'}</button>
        </div>
      </div>

      {/* Sessions table */}
      <div style={{ ...card, padding: 0, overflow: 'hidden', marginTop: 22 }}>
        <div style={{ padding: '16px 22px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <h2 style={{ ...cardTitle, marginBottom: 0 }}>Chat sessions</h2>
        </div>
        <div style={{ overflowX: 'auto' as const }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' as const, minWidth: 720 }}>
            <thead>
              <tr style={{ background: '#071829' }}>
                {['Date', 'Lead', 'Phone', 'Messages', 'Status', ''].map(h => (
                  <th key={h} style={{ textAlign: 'left' as const, padding: '11px 18px', fontSize: 11, fontWeight: 700, color: '#4A7FBB', textTransform: 'uppercase' as const, letterSpacing: '0.06em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sessions.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ padding: 28, textAlign: 'center' as const, fontSize: 13, color: '#7BAED4' }}>
                    No chat sessions yet.
                  </td>
                </tr>
              )}
              {sessions.map((s, i) => {
                const leadLabel = s.leadName || s.leadEmail || s.leadPhone || (s.leadCaptured ? 'Lead captured' : 'Anonymous')
                return (
                  <tr key={s.id} style={{ borderTop: '1px solid rgba(255,255,255,0.04)', background: i % 2 === 0 ? '#0A1E38' : '#071829' }}>
                    <td style={{ padding: '12px 18px', fontSize: 12, color: '#7BAED4' }}>{new Date(s.startedAt).toLocaleString('en-AU')}</td>
                    <td style={{ padding: '12px 18px', fontSize: 13, color: 'white', fontWeight: 600 }}>
                      {leadLabel}
                      {s.leadCaptured && (
                        <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 800, padding: '2px 7px', borderRadius: 99, background: 'rgba(34,197,94,0.16)', color: '#22C55E' }}>LEAD</span>
                      )}
                    </td>
                    <td style={{ padding: '12px 18px', fontSize: 12, color: '#7BAED4' }}>{s.leadPhone || '—'}</td>
                    <td style={{ padding: '12px 18px', fontSize: 13, color: 'white' }}>{s.messageCount}</td>
                    <td style={{ padding: '12px 18px' }}>
                      <span style={{ fontSize: 11, padding: '3px 9px', borderRadius: 99, fontWeight: 700, ...statusChip(s.status) }}>{s.status}</span>
                    </td>
                    <td style={{ padding: '12px 18px' }}>
                      <button
                        onClick={() => openTranscript(s.id, leadLabel)}
                        style={{
                          padding: '6px 12px', borderRadius: 7, fontSize: 12, fontWeight: 700,
                          background: 'rgba(74,159,232,0.1)', border: '1px solid rgba(74,159,232,0.3)',
                          color: '#4A9FE8', cursor: 'pointer', fontFamily: 'Outfit, sans-serif',
                        }}
                      >Transcript</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Transcript modal */}
      {transcriptOpen && (
        <div
          onClick={() => setTranscriptOpen(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 120, background: 'rgba(2,8,18,0.7)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              width: '100%', maxWidth: 560, maxHeight: '80vh', display: 'flex', flexDirection: 'column',
              background: '#0A1E38', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 16,
              boxShadow: '0 12px 48px rgba(0,0,0,0.5)',
            }}
          >
            <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: 'white' }}>Transcript: {transcriptLead}</div>
              <button
                onClick={() => setTranscriptOpen(false)}
                style={{ background: 'transparent', border: 'none', color: '#7BAED4', fontSize: 20, cursor: 'pointer', lineHeight: 1 }}
              >×</button>
            </div>
            <div style={{ padding: 20, overflowY: 'auto' as const, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {transcriptLoading && <div style={{ fontSize: 13, color: '#7BAED4' }}>Loading…</div>}
              {!transcriptLoading && transcript.length === 0 && (
                <div style={{ fontSize: 13, color: '#7BAED4' }}>No messages in this session.</div>
              )}
              {transcript.map((m, i) => {
                const isUser = m.role === 'user'
                return (
                  <div key={i} style={{ display: 'flex', justifyContent: isUser ? 'flex-end' : 'flex-start' }}>
                    <div style={{
                      maxWidth: '78%', padding: '9px 13px', borderRadius: 12, fontSize: 13, lineHeight: 1.5,
                      background: isUser ? '#E8622A' : 'rgba(255,255,255,0.06)',
                      color: isUser ? 'white' : '#E8F0FA',
                      borderTopRightRadius: isUser ? 3 : 12,
                      borderTopLeftRadius: isUser ? 12 : 3,
                    }}>
                      {m.content}
                      <div style={{ fontSize: 10, opacity: 0.7, marginTop: 4 }}>
                        {new Date(m.createdAt).toLocaleString('en-AU')}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 130,
          padding: '12px 18px', background: '#0A1E38', borderRadius: 10,
          border: `1px solid ${toast.ok ? 'rgba(34,197,94,0.4)' : 'rgba(239,68,68,0.4)'}`,
          color: toast.ok ? '#22C55E' : '#EF4444', fontSize: 13, fontWeight: 600,
          boxShadow: '0 4px 20px rgba(0,0,0,0.4)', maxWidth: 360,
        }}>
          {toast.msg}
        </div>
      )}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, padding: '11px 0', borderTop: '1px solid rgba(255,255,255,0.04)' }}>
      <div style={{ width: 160, flexShrink: 0, fontSize: 13, color: '#7BAED4', paddingTop: 6 }}>{label}</div>
      <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
    </div>
  )
}

function statusChip(status: string): React.CSSProperties {
  if (status === 'converted') return { background: 'rgba(34,197,94,0.14)', color: '#22C55E' }
  if (status === 'active') return { background: 'rgba(74,159,232,0.12)', color: '#4A9FE8' }
  return { background: 'rgba(255,255,255,0.06)', color: '#7BAED4' }
}

const card: React.CSSProperties = {
  background: '#0A1E38', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: 22,
}
const cardTitle: React.CSSProperties = {
  fontSize: 14, fontWeight: 800, color: 'white', margin: 0, marginBottom: 12,
}
const inputStyle: React.CSSProperties = {
  width: '100%', padding: '9px 12px', borderRadius: 8,
  background: '#071829', border: '1px solid rgba(255,255,255,0.1)',
  color: 'white', fontSize: 13, fontFamily: 'Outfit, sans-serif',
}
