'use client'

// AI Website Chatbot — interactive view (Sprint features 2).
//
// Owns the enable toggle, embed snippet, customiser, live preview, analytics
// and recent-conversations list. All config writes go through
// PATCH /api/chatbot/config; analytics/recent are derived from
// GET /api/chatbot/sessions. Dark-navy inline styling to match the portal.

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  Globe, Lock, Copy, Check, ChevronDown, MessageSquare,
  Sparkles, CheckCircle2, Send, X,
} from 'lucide-react'

const ORANGE = '#E8622A'

export interface ChatbotDTO {
  id: string
  name: string
  plan: 'starter' | 'growth' | 'pro'
  enabled: boolean
  greeting: string
  agentName: string
  primaryColor: string
  collectLeadsAfter: number
  slug: string | null
  allowedDomains?: string[]
  showPoweredBy?: boolean
}

interface SessionRow {
  id: string
  leadName: string | null
  leadPhone: string | null
  leadEmail: string | null
  leadCaptured: boolean
  messageCount: number
  status: string
  startedAt: string
  endedAt: string | null
}

interface SessionStats {
  conversationsThisMonth: number
  leadsThisMonth: number
  questionsAnswered: number
  needsFollowUp: number
}

const COLLECT_OPTIONS = [1, 2, 3, 5]
const DEFAULT_GREETING = 'Hi there! How can I help you today?'

function widgetSrc(): string {
  return process.env.NEXT_PUBLIC_WIDGET_SCRIPT_URL || 'https://app.talkmate.com.au/widget/talkmate-chat.js'
}

function fmtDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('en-AU', { day: '2-digit', month: 'short' }) +
    ' ' + d.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })
}

// ─────────────────────── locked state ───────────────────────

function LockedState() {
  return (
    <div style={{ padding: '28px 32px', maxWidth: 720, margin: '0 auto', color: '#F1F5F9', fontFamily: 'Outfit, sans-serif' }}>
      <Header />
      <div style={{
        marginTop: 24, padding: 32, textAlign: 'center',
        background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 16,
      }}>
        <div style={{
          width: 56, height: 56, borderRadius: 14, margin: '0 auto 16px',
          background: 'rgba(232,98,42,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Lock size={26} color={ORANGE} />
        </div>
        <h2 style={{ fontSize: 18, fontWeight: 800, color: 'white', margin: 0 }}>
          Upgrade to Growth to unlock the AI Chatbot
        </h2>
        <p style={{ fontSize: 13, color: '#7BAED4', marginTop: 8, marginBottom: 20, lineHeight: 1.5 }}>
          Add a chatbot to your website that answers questions 24/7 and captures leads
          while you sleep.
        </p>
        <Link
          href="/settings"
          style={{
            display: 'inline-block', background: ORANGE, color: 'white',
            padding: '10px 20px', borderRadius: 10, fontSize: 13, fontWeight: 700,
            textDecoration: 'none', fontFamily: 'inherit',
          }}
        >
          Upgrade to Growth
        </Link>
      </div>
    </div>
  )
}

function Header() {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
      <div style={{
        width: 44, height: 44, borderRadius: 12, background: 'rgba(232,98,42,0.12)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>
        <Globe size={22} color={ORANGE} />
      </div>
      <div style={{ flex: 1 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: 'white', margin: 0 }}>AI Website Chatbot</h1>
        <p style={{ fontSize: 13, color: '#7BAED4', marginTop: 4, marginBottom: 0, lineHeight: 1.5 }}>
          Add a chatbot to your website that answers questions 24/7 and captures leads
          while you sleep.
        </p>
      </div>
    </div>
  )
}

// ─────────────────────── card shell ───────────────────────

function Card(props: { title?: string; children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: 14, padding: 20, ...props.style,
    }}>
      {props.title && (
        <div style={{ fontSize: 14, fontWeight: 700, color: 'white', marginBottom: 14 }}>{props.title}</div>
      )}
      {props.children}
    </div>
  )
}

function fieldLabel(text: string) {
  return <div style={{ fontSize: 12, fontWeight: 600, color: '#C8D8EA', marginBottom: 6 }}>{text}</div>
}

const inputStyle: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', padding: '9px 12px', borderRadius: 9,
  background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.12)',
  color: 'white', fontSize: 13, fontFamily: 'inherit', outline: 'none',
}

// ─────────────────────── live preview ───────────────────────

function LivePreview(props: { agentName: string; greeting: string; color: string }) {
  return (
    <div style={{
      borderRadius: 16, overflow: 'hidden', width: '100%', maxWidth: 320,
      border: '1px solid rgba(255,255,255,0.1)', background: '#0E2233',
      boxShadow: '0 10px 30px rgba(0,0,0,0.3)',
    }}>
      {/* header */}
      <div style={{ background: props.color, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{
          width: 32, height: 32, borderRadius: '50%', background: 'rgba(255,255,255,0.25)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Sparkles size={16} color="white" />
        </div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'white' }}>{props.agentName || 'TalkMate'}</div>
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.8)' }}>Online now</div>
        </div>
      </div>
      {/* body */}
      <div style={{ padding: 16, minHeight: 150, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{
          alignSelf: 'flex-start', maxWidth: '85%',
          background: 'rgba(255,255,255,0.08)', color: '#E8EFF6',
          padding: '9px 12px', borderRadius: '12px 12px 12px 3px', fontSize: 12.5, lineHeight: 1.45,
        }}>
          {props.greeting || DEFAULT_GREETING}
        </div>
        <div style={{
          alignSelf: 'flex-end', maxWidth: '85%',
          background: props.color, color: 'white',
          padding: '9px 12px', borderRadius: '12px 12px 3px 12px', fontSize: 12.5,
        }}>
          What are your hours?
        </div>
      </div>
      {/* input */}
      <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', padding: 10, display: 'flex', gap: 8, alignItems: 'center' }}>
        <div style={{
          flex: 1, background: 'rgba(255,255,255,0.05)', borderRadius: 99,
          padding: '8px 12px', fontSize: 12, color: '#7BAED4',
        }}>
          Type a message...
        </div>
        <div style={{
          width: 32, height: 32, borderRadius: '50%', background: props.color,
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <Send size={15} color="white" />
        </div>
      </div>
    </div>
  )
}

// ─────────────────────── main ───────────────────────

export default function ChatbotView({ business }: { business: ChatbotDTO }) {
  // Plan gating: starter accounts get the locked upgrade prompt and nothing
  // else. Hooks below must not run for them, so we branch before any state.
  if (business.plan === 'starter') {
    return <LockedState />
  }
  return <ChatbotManager business={business} />
}

function ChatbotManager({ business }: { business: ChatbotDTO }) {
  const [enabled, setEnabled] = useState(business.enabled)
  const [enabling, setEnabling] = useState(false)

  // customiser draft
  const [agentName, setAgentName] = useState(business.agentName || 'TalkMate')
  const [greeting, setGreeting] = useState(business.greeting || DEFAULT_GREETING)
  const [color, setColor] = useState(business.primaryColor || ORANGE)
  const [collectAfter, setCollectAfter] = useState<number>(business.collectLeadsAfter || 2)
  const [poweredBy, setPoweredBy] = useState<boolean>(business.showPoweredBy ?? false)
  const [saving, setSaving] = useState(false)
  const [savedFlash, setSavedFlash] = useState(false)

  // domain allowlist draft
  const [domains, setDomains] = useState<string[]>(business.allowedDomains ?? [])
  const [domainInput, setDomainInput] = useState('')
  const [domainSaving, setDomainSaving] = useState(false)
  const [domainSaved, setDomainSaved] = useState(false)
  const [domainError, setDomainError] = useState<string | null>(null)

  const [copied, setCopied] = useState(false)
  const [howOpen, setHowOpen] = useState(false)

  const [sessions, setSessions] = useState<SessionRow[]>([])
  const [analytics, setAnalytics] = useState<{ conversations: number; leads: number; questions: number; needsFollowUp: number | null } | null>(null)

  const snippet = useMemo(
    () => `<script src="${widgetSrc()}" data-business-id="${business.id}"></script>`,
    [business.id],
  )

  // Load sessions for analytics + recent list once enabled. All setState
  // happens inside the async chain (never synchronously in the effect body).
  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    fetch('/api/chatbot/sessions?page=1')
      .then(r => (r.ok ? r.json() : null))
      .then((d: { ok: boolean; sessions: SessionRow[]; total: number; stats?: SessionStats } | null) => {
        if (cancelled || !d?.ok) return
        const list = d.sessions ?? []
        setSessions(list.slice(0, 5))
        if (d.stats) {
          // Prefer the server-computed monthly stats when present.
          setAnalytics({
            conversations: d.stats.conversationsThisMonth,
            leads: d.stats.leadsThisMonth,
            questions: d.stats.questionsAnswered,
            needsFollowUp: d.stats.needsFollowUp,
          })
        } else {
          // Fall back to the previous derivation for older API responses.
          const leads = list.filter(s => s.leadCaptured).length
          const questions = Math.round(list.reduce((sum, s) => sum + (s.messageCount || 0), 0) / 2)
          setAnalytics({ conversations: d.total ?? list.length, leads, questions, needsFollowUp: null })
        }
      })
      .catch(() => { /* silent */ })
    return () => { cancelled = true }
  }, [enabled])

  async function enableChatbot() {
    if (enabling) return
    setEnabling(true)
    try {
      const r = await fetch('/api/chatbot/config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: true }),
      })
      const d = await r.json().catch(() => ({}))
      if (r.ok && d?.ok !== false) {
        setEnabled(true)
      }
    } finally {
      setEnabling(false)
    }
  }

  async function saveConfig() {
    if (saving) return
    setSaving(true)
    setSavedFlash(false)
    try {
      const r = await fetch('/api/chatbot/config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentName,
          greeting,
          primaryColor: color,
          collectLeadsAfter: collectAfter,
          showPoweredBy: poweredBy,
        }),
      })
      if (r.ok) {
        setSavedFlash(true)
        setTimeout(() => setSavedFlash(false), 2500)
      }
    } finally {
      setSaving(false)
    }
  }

  function addDomain() {
    const raw = domainInput.trim().toLowerCase()
    if (!raw) return
    // Strip any scheme/path the user pasted so we keep bare domains in state.
    const bare = raw.replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/^www\./, '')
    if (!bare) return
    if (domains.includes(bare)) {
      setDomainInput('')
      return
    }
    setDomains(d => [...d, bare])
    setDomainInput('')
    setDomainError(null)
    setDomainSaved(false)
  }

  function removeDomain(d: string) {
    setDomains(list => list.filter(x => x !== d))
    setDomainError(null)
    setDomainSaved(false)
  }

  async function saveDomains() {
    if (domainSaving) return
    setDomainSaving(true)
    setDomainSaved(false)
    setDomainError(null)
    try {
      const r = await fetch('/api/chatbot/config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ allowedDomains: domains }),
      })
      const d = await r.json().catch(() => ({}))
      if (r.ok && d?.ok !== false) {
        setDomainSaved(true)
        setTimeout(() => setDomainSaved(false), 2500)
      } else {
        const map: Record<string, string> = {
          invalid_domain: 'That does not look like a valid domain. Use a bare domain like acme.com.au',
          too_many_domains: 'You have added too many domains. Please remove a few and try again.',
        }
        const base = map[d?.error as string] ?? 'We could not save those domains. Please check them and try again.'
        setDomainError(d?.detail ? `${base} (${d.detail})` : base)
      }
    } catch {
      setDomainError('We could not save those domains. Please check them and try again.')
    } finally {
      setDomainSaving(false)
    }
  }

  async function copySnippet() {
    try {
      await navigator.clipboard.writeText(snippet)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { /* clipboard unavailable */ }
  }

  // ── enable-first setup screen ──
  if (!enabled) {
    return (
      <div style={{ padding: '28px 32px', maxWidth: 720, margin: '0 auto', color: '#F1F5F9', fontFamily: 'Outfit, sans-serif' }}>
        <Header />
        <div style={{
          marginTop: 24, padding: 28, textAlign: 'center',
          background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16,
        }}>
          <div style={{
            width: 56, height: 56, borderRadius: 14, margin: '0 auto 16px',
            background: 'rgba(232,98,42,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Globe size={26} color={ORANGE} />
          </div>
          <h2 style={{ fontSize: 18, fontWeight: 800, color: 'white', margin: 0 }}>
            Turn on your website chatbot
          </h2>
          <p style={{ fontSize: 13, color: '#7BAED4', marginTop: 8, marginBottom: 20, lineHeight: 1.5 }}>
            Enable the chatbot, then drop one line of code on your site. You can customise
            how it looks and what it says afterwards.
          </p>
          <button
            type="button"
            onClick={enableChatbot}
            disabled={enabling}
            style={{
              background: ORANGE, color: 'white', border: 'none',
              padding: '11px 24px', borderRadius: 10, fontSize: 14, fontWeight: 700,
              cursor: enabling ? 'default' : 'pointer', fontFamily: 'inherit',
              opacity: enabling ? 0.6 : 1,
            }}
          >
            {enabling ? 'Enabling...' : 'Enable Chatbot'}
          </button>
        </div>
      </div>
    )
  }

  // ── enabled: full management screen ──
  return (
    <div style={{ padding: '28px 32px', maxWidth: 980, margin: '0 auto', color: '#F1F5F9', fontFamily: 'Outfit, sans-serif' }}>
      <Header />

      {/* Embed code */}
      <div style={{ marginTop: 22 }}>
        <Card title="Embed Code">
          <p style={{ fontSize: 13, color: '#C8D8EA', marginTop: 0, marginBottom: 12 }}>
            Add this code to your website just before the closing{' '}
            <code style={{ color: ORANGE }}>&lt;/body&gt;</code> tag:
          </p>
          <div style={{ position: 'relative' }}>
            <pre style={{
              background: '#04101C', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10,
              padding: '14px 16px', paddingRight: 110, overflowX: 'auto', margin: 0,
              fontSize: 12, color: '#9FE8C8', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              whiteSpace: 'pre-wrap', wordBreak: 'break-all',
            }}>
              {snippet}
            </pre>
            <button
              type="button"
              onClick={copySnippet}
              style={{
                position: 'absolute', top: 10, right: 10,
                display: 'inline-flex', alignItems: 'center', gap: 6,
                background: copied ? '#22C55E' : ORANGE, color: 'white', border: 'none',
                padding: '7px 12px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              {copied ? <Check size={13} /> : <Copy size={13} />}
              {copied ? 'Copied!' : 'Copy Code'}
            </button>
          </div>

          <button
            type="button"
            onClick={() => setHowOpen(o => !o)}
            style={{
              marginTop: 14, display: 'inline-flex', alignItems: 'center', gap: 6,
              background: 'transparent', border: 'none', cursor: 'pointer',
              color: '#7BAED4', fontSize: 12.5, fontWeight: 600, fontFamily: 'inherit', padding: 0,
            }}
          >
            Using WordPress? Wix? Squarespace?
            <ChevronDown size={13} style={{ transform: howOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
          </button>
          {howOpen && (
            <div style={{
              marginTop: 10, padding: 14, borderRadius: 10,
              background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
              fontSize: 12.5, color: '#C8D8EA', lineHeight: 1.7,
            }}>
              <div><strong style={{ color: 'white' }}>WordPress:</strong> Install a header-and-footer plugin (such as WPCode), then paste the snippet into the footer scripts box.</div>
              <div style={{ marginTop: 6 }}><strong style={{ color: 'white' }}>Wix:</strong> Open Settings, then Custom Code, add a new snippet to the Body - end position and paste it in.</div>
              <div style={{ marginTop: 6 }}><strong style={{ color: 'white' }}>Squarespace:</strong> Go to Settings, then Advanced, then Code Injection, and paste the snippet into the Footer box.</div>
            </div>
          )}
        </Card>
      </div>

      {/* Customise + Live preview */}
      <div style={{ marginTop: 16, display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 340px), 1fr))' }}>
        <Card title="Customise">
          <div style={{ marginBottom: 14 }}>
            {fieldLabel('Agent Name')}
            <input
              type="text" value={agentName} onChange={e => setAgentName(e.target.value)}
              placeholder="TalkMate" style={inputStyle}
            />
          </div>
          <div style={{ marginBottom: 14 }}>
            {fieldLabel('Greeting Message')}
            <textarea
              value={greeting} onChange={e => setGreeting(e.target.value)}
              rows={3}
              style={{ ...inputStyle, resize: 'vertical', minHeight: 64 }}
            />
          </div>
          <div style={{ marginBottom: 14, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 130 }}>
              {fieldLabel('Chat Bubble Color')}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <input
                  type="color" value={color} onChange={e => setColor(e.target.value)}
                  style={{ width: 42, height: 36, padding: 0, border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, background: 'transparent', cursor: 'pointer' }}
                />
                <span style={{ fontSize: 12, color: '#7BAED4', fontFamily: 'ui-monospace, monospace' }}>{color}</span>
              </div>
            </div>
            <div style={{ flex: 1, minWidth: 150 }}>
              {fieldLabel('Ask for contact details after')}
              <select
                value={collectAfter}
                onChange={e => setCollectAfter(Number(e.target.value))}
                style={{ ...inputStyle, cursor: 'pointer' }}
              >
                {COLLECT_OPTIONS.map(n => (
                  <option key={n} value={n} style={{ background: '#0E2233' }}>
                    {n} {n === 1 ? 'message' : 'messages'}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#C7D9E8' }}>
            <input type="checkbox" checked={poweredBy} onChange={e => setPoweredBy(e.target.checked)} />
            Show &ldquo;Powered by TalkMate&rdquo; badge on the widget
          </label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button
              type="button"
              onClick={saveConfig}
              disabled={saving}
              style={{
                background: ORANGE, color: 'white', border: 'none',
                padding: '9px 20px', borderRadius: 9, fontSize: 13, fontWeight: 700,
                cursor: saving ? 'default' : 'pointer', fontFamily: 'inherit', opacity: saving ? 0.6 : 1,
              }}
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
            {savedFlash && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: '#22C55E', fontSize: 13, fontWeight: 600 }}>
                <CheckCircle2 size={15} /> Saved
              </span>
            )}
          </div>
        </Card>

        <Card title="Live Preview">
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <LivePreview agentName={agentName} greeting={greeting} color={color} />
          </div>
        </Card>
      </div>

      {/* Security: allowed domains */}
      <div style={{ marginTop: 16 }}>
        <Card title="Security">
          {fieldLabel('Allowed website domains')}
          <p style={{ fontSize: 12.5, color: '#7BAED4', marginTop: 0, marginBottom: 12, lineHeight: 1.5 }}>
            Lock your chatbot to the websites you own. Leave empty to allow it anywhere. Add the
            domains where you have installed the widget, for example acme.com.au
          </p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <input
              type="text"
              value={domainInput}
              onChange={e => setDomainInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addDomain() } }}
              placeholder="acme.com.au"
              style={{ ...inputStyle, flex: 1, minWidth: 180 }}
            />
            <button
              type="button"
              onClick={addDomain}
              style={{
                background: 'rgba(232,98,42,0.16)', color: ORANGE, border: '1px solid ' + ORANGE,
                padding: '9px 18px', borderRadius: 9, fontSize: 13, fontWeight: 700,
                cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0,
              }}
            >
              Add
            </button>
          </div>

          {domains.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
              {domains.map(d => (
                <span
                  key={d}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 8,
                    padding: '5px 8px 5px 12px', borderRadius: 99, fontSize: 12.5, fontWeight: 600,
                    background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
                    color: 'white',
                  }}
                >
                  {d}
                  <button
                    type="button"
                    onClick={() => removeDomain(d)}
                    aria-label={`Remove ${d}`}
                    style={{
                      background: 'transparent', border: 'none', color: '#7BAED4', cursor: 'pointer',
                      padding: 0, display: 'flex', alignItems: 'center',
                    }}
                  >
                    <X size={14} />
                  </button>
                </span>
              ))}
            </div>
          )}

          {domainError && (
            <div style={{ fontSize: 12.5, color: '#EF4444', marginTop: 12, lineHeight: 1.5 }}>
              {domainError}
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 16 }}>
            <button
              type="button"
              onClick={saveDomains}
              disabled={domainSaving}
              style={{
                background: ORANGE, color: 'white', border: 'none',
                padding: '9px 20px', borderRadius: 9, fontSize: 13, fontWeight: 700,
                cursor: domainSaving ? 'default' : 'pointer', fontFamily: 'inherit', opacity: domainSaving ? 0.6 : 1,
              }}
            >
              {domainSaving ? 'Saving...' : 'Save'}
            </button>
            {domainSaved && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: '#22C55E', fontSize: 13, fontWeight: 600 }}>
                <CheckCircle2 size={15} /> Saved
              </span>
            )}
          </div>
        </Card>
      </div>

      {/* Analytics */}
      <div style={{ marginTop: 16 }}>
        <Card title="This month">
          <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap' }}>
            {[
              { label: 'Conversations', value: analytics?.conversations ?? 0 },
              { label: 'Leads captured', value: analytics?.leads ?? 0 },
              { label: 'Questions answered', value: analytics?.questions ?? 0 },
            ].map(stat => (
              <div key={stat.label}>
                <div style={{ fontSize: 26, fontWeight: 800, color: 'white' }}>{stat.value}</div>
                <div style={{ fontSize: 12, color: '#7BAED4', marginTop: 2 }}>{stat.label}</div>
              </div>
            ))}
            {analytics?.needsFollowUp != null && (
              <div style={{ maxWidth: 220 }}>
                <div style={{ fontSize: 26, fontWeight: 800, color: 'white' }}>{analytics.needsFollowUp}</div>
                <div style={{ fontSize: 12, color: '#7BAED4', marginTop: 2 }}>Needed follow-up</div>
                <div style={{ fontSize: 11, color: '#7BAED4', marginTop: 4, lineHeight: 1.4 }}>
                  Questions the bot could not answer. Add these to{' '}
                  <Link href="/train" style={{ color: ORANGE, fontWeight: 700, textDecoration: 'none' }}>
                    Train TalkMate
                  </Link>.
                </div>
              </div>
            )}
          </div>
          <Link
            href="/chatbot/sessions"
            style={{ display: 'inline-block', marginTop: 16, color: ORANGE, fontSize: 12.5, fontWeight: 700, textDecoration: 'none' }}
          >
            View all conversations
          </Link>
        </Card>
      </div>

      {/* Recent conversations */}
      <div style={{ marginTop: 16 }}>
        <Card title="Recent conversations">
          {sessions.length === 0 ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#7BAED4', fontSize: 13, padding: '8px 0' }}>
              <MessageSquare size={16} />
              No conversations yet. They will appear here once visitors start chatting.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {sessions.map(s => (
                <div key={s.id} style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '10px 12px', borderRadius: 10,
                  background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
                }}>
                  <div style={{ fontSize: 12, color: '#7BAED4', width: 110, flexShrink: 0 }}>{fmtDate(s.startedAt)}</div>
                  <div style={{ flex: 1, fontSize: 13, color: 'white', fontWeight: 600, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {s.leadName || 'Anonymous'}
                  </div>
                  <div style={{ fontSize: 12, color: '#7BAED4', flexShrink: 0 }}>{s.messageCount} msgs</div>
                  {s.leadCaptured && (
                    <span style={{
                      fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 99,
                      background: 'rgba(34,197,94,0.15)', color: '#22C55E', flexShrink: 0,
                    }}>
                      Lead
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
          <Link
            href="/chatbot/sessions"
            style={{ display: 'inline-block', marginTop: 14, color: ORANGE, fontSize: 12.5, fontWeight: 700, textDecoration: 'none' }}
          >
            View all
          </Link>
        </Card>
      </div>
    </div>
  )
}
