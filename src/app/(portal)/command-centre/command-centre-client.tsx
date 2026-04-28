'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Lock, MessageSquare, Send } from 'lucide-react'

interface HistoryEntry {
  id: string
  platform: string
  raw_command: string
  parsed_intent: string | null
  action_taken: string | null
  outcome: string
  created_at: string
}

interface PendingEntry {
  id: string
  raw_command: string
  parsed_intent: string | null
  platform: string
  expires_at: string | null
}

interface Props {
  planLabel: string
  hasCommandCentre: boolean
  monthlyPrice: number
  connectedPlatform: string | null
  hasToken: boolean
  authorisedNumbers: string[]
  dailyCount: number
  dailyLimit: number | null
  history: HistoryEntry[]
  pending: PendingEntry | null
}

const EXAMPLE_COMMANDS = [
  'How many calls today?',
  'Send invoice to John for $250',
  'Pause agent for 2 hours',
  'What did I miss while I was out?',
  'Add menu item: garlic bread $9',
  'Close on Sunday',
]

export default function CommandCentreClient(props: Props) {
  const router = useRouter()
  const [platform, setPlatform] = useState<'whatsapp' | 'telegram' | null>(props.connectedPlatform as 'whatsapp' | 'telegram' | null)
  const [token, setToken] = useState('')
  const [savingToken, setSavingToken] = useState(false)
  const [savedMsg, setSavedMsg] = useState('')
  const [testCmd, setTestCmd] = useState('')
  const [testRes, setTestRes] = useState<{ ok: boolean; message: string } | null>(null)
  const [sending, setSending] = useState(false)

  // ─── Locked (Starter) view ────────────────────────────────────────────────
  if (!props.hasCommandCentre) {
    return (
      <div style={{ padding: 32, maxWidth: 880, margin: '0 auto' }}>
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#E8622A', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>Assistant</div>
          <h1 style={{ fontSize: '1.6rem', fontWeight: 800, color: 'white', margin: 0 }}>TalkMate Command Centre</h1>
        </div>

        <div style={{
          background: 'linear-gradient(135deg, #1565C0, #8B5CF6)',
          borderRadius: 18, padding: 32, color: 'white', marginBottom: 24,
        }}>
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', opacity: 0.85 }}>Run your business by texting</div>
          <div style={{ fontSize: 28, fontWeight: 800, marginTop: 8, lineHeight: 1.1 }}>Send commands. Get answers. From anywhere.</div>
          <div style={{ fontSize: 14, opacity: 0.9, marginTop: 12, lineHeight: 1.55 }}>
            TalkMate Command answers business questions, updates your menu, sends invoices, and pauses your agent — all over WhatsApp or Telegram.
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14, marginBottom: 24 }}>
          {[
            { title: '📊 Ask anything', samples: ['How many calls today?', 'Today\'s revenue?', 'Show top callers'] },
            { title: '✏️ Update on the go', samples: ['Add menu item', 'Change opening hours', 'Pause for 2 hours'] },
            { title: '💸 Run the back office', samples: ['Send invoice to Sarah', 'Send weekly summary', 'Confirm jobs'] },
          ].map(c => (
            <div key={c.title} style={{ background: '#0A1E38', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: 18 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'white', marginBottom: 10 }}>{c.title}</div>
              {c.samples.map(s => (
                <div key={s} style={{ background: '#071829', borderRadius: 7, padding: '8px 10px', marginBottom: 6, fontSize: 12, color: '#7BAED4' }}>&quot;{s}&quot;</div>
              ))}
            </div>
          ))}
        </div>

        <div style={{ background: '#0A1E38', border: '1px solid rgba(232,98,42,0.3)', borderRadius: 16, padding: 28, textAlign: 'center' }}>
          <Lock size={28} color="#E8622A" />
          <div style={{ fontSize: 18, fontWeight: 800, color: 'white', marginTop: 14 }}>Add to your plan for $200/mo (upgrade to Growth)</div>
          <div style={{ fontSize: 13, color: '#7BAED4', marginTop: 8 }}>Already includes 800 calls/mo + Command Centre. Most clients break even by week one.</div>
          <button onClick={() => router.push('/billing')} style={{ marginTop: 18, background: '#E8622A', color: 'white', border: 'none', borderRadius: 10, padding: '12px 26px', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>Upgrade to Growth →</button>
        </div>
      </div>
    )
  }

  // ─── Setup wizard (Growth/Pro, not yet connected) ─────────────────────────
  if (!platform || !props.hasToken) {
    async function saveToken() {
      if (!platform || !token.trim()) return
      setSavingToken(true)
      try {
        const res = await fetch('/api/command/connect', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ platform, token }),
        })
        const data = await res.json()
        if (data.ok) {
          setSavedMsg('Connected ✓ — try sending a test command below.')
          router.refresh()
        } else {
          setSavedMsg(data.error || 'Could not save — check the token and try again.')
        }
      } finally {
        setSavingToken(false)
      }
    }

    return (
      <div style={{ padding: 32, maxWidth: 720, margin: '0 auto' }}>
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#E8622A', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>Assistant</div>
          <h1 style={{ fontSize: '1.6rem', fontWeight: 800, color: 'white', margin: 0 }}>Set up Command Centre</h1>
          <p style={{ fontSize: 13, color: '#7BAED4', marginTop: 6 }}>Connect WhatsApp Business or Telegram in two minutes.</p>
        </div>

        {!platform && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14, marginBottom: 24 }}>
            {([
              { id: 'whatsapp', label: 'WhatsApp Business', icon: '💬', desc: 'Easy · 2 min · Most popular' },
              { id: 'telegram', label: 'Telegram', icon: '✈️', desc: 'Easy · 1 min · Best for power users' },
            ] as const).map(opt => (
              <button key={opt.id} onClick={() => setPlatform(opt.id)} style={{ background: '#0A1E38', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: 22, cursor: 'pointer', textAlign: 'left', fontFamily: 'Outfit, sans-serif' }}>
                <div style={{ fontSize: 30, marginBottom: 10 }}>{opt.icon}</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: 'white' }}>{opt.label}</div>
                <div style={{ fontSize: 12, color: '#7BAED4', marginTop: 4 }}>{opt.desc}</div>
              </button>
            ))}
          </div>
        )}

        {platform && (
          <div style={{ background: '#0A1E38', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: 22 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'white', marginBottom: 8 }}>Connect {platform === 'whatsapp' ? 'WhatsApp Business' : 'Telegram'}</div>
            <ol style={{ paddingLeft: 18, fontSize: 13, color: '#7BAED4', lineHeight: 1.8, marginBottom: 14 }}>
              {platform === 'whatsapp' ? (
                <>
                  <li>Go to your WhatsApp Business API dashboard.</li>
                  <li>Generate an API key (System User → Permanent token).</li>
                  <li>Paste it below and click <strong>Test connection</strong>.</li>
                </>
              ) : (
                <>
                  <li>In Telegram, message <strong>@BotFather</strong>.</li>
                  <li>Run <code style={{ background: '#071829', padding: '2px 6px', borderRadius: 4 }}>/newbot</code> and follow the steps.</li>
                  <li>Paste your bot token below and click <strong>Test connection</strong>.</li>
                </>
              )}
            </ol>

            <input
              value={token}
              onChange={e => setToken(e.target.value)}
              placeholder={platform === 'whatsapp' ? 'WhatsApp Business API key' : 'Telegram bot token'}
              style={{ width: '100%', background: '#071829', border: '1px solid rgba(255,255,255,0.1)', color: 'white', borderRadius: 9, padding: '11px 14px', fontFamily: 'monospace', fontSize: 12, outline: 'none' }}
            />
            <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
              <button onClick={saveToken} disabled={savingToken || !token} style={{ background: '#E8622A', color: 'white', border: 'none', borderRadius: 9, padding: '10px 18px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'Outfit, sans-serif', opacity: !token ? 0.5 : 1 }}>
                {savingToken ? 'Saving…' : 'Test connection & save'}
              </button>
              <button onClick={() => setPlatform(null)} style={{ background: 'transparent', color: '#4A7FBB', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 9, padding: '10px 18px', fontSize: 13, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>Back</button>
            </div>
            {savedMsg && <div style={{ fontSize: 12, color: '#22C55E', marginTop: 10 }}>{savedMsg}</div>}
          </div>
        )}
      </div>
    )
  }

  // ─── Active dashboard ─────────────────────────────────────────────────────
  async function sendCommand() {
    if (!testCmd.trim() || sending) return
    setSending(true); setTestRes(null)
    try {
      const res = await fetch('/api/command/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: testCmd, platform: 'portal' }),
      })
      const data = await res.json()
      setTestRes({ ok: !!data.ok, message: data.responseMessage || data.error || 'No response' })
      if (data.ok) router.refresh()
    } catch (e) {
      setTestRes({ ok: false, message: (e as Error).message })
    } finally { setSending(false) }
  }

  return (
    <div style={{ padding: 32, maxWidth: 980, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 22 }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#E8622A', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Assistant</div>
          <h1 style={{ fontSize: '1.6rem', fontWeight: 800, color: 'white', margin: '4px 0 0' }}>Command Centre</h1>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#22C55E' }}>
          <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#22C55E' }} />
          {props.connectedPlatform ?? 'connected'}
        </div>
      </div>

      {props.pending && (
        <div style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 12, padding: 16, marginBottom: 20 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#F59E0B', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>⏳ Waiting for confirmation</div>
          <div style={{ fontSize: 13, color: 'white' }}>{props.pending.raw_command}</div>
          <div style={{ fontSize: 12, color: '#7BAED4', marginTop: 4 }}>Reply YES or CANCEL on {props.pending.platform}.</div>
        </div>
      )}

      <div style={{ background: '#0A1E38', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: 18, marginBottom: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'white', marginBottom: 12 }}>Send a command</div>
        <div style={{ display: 'flex', gap: 10 }}>
          <input
            value={testCmd}
            onChange={e => setTestCmd(e.target.value)}
            placeholder="Try: How many calls today?"
            style={{ flex: 1, background: '#071829', border: '1px solid rgba(255,255,255,0.08)', color: 'white', borderRadius: 9, padding: '11px 14px', fontFamily: 'Outfit, sans-serif', fontSize: 13, outline: 'none' }}
            onKeyDown={e => { if (e.key === 'Enter') sendCommand() }}
          />
          <button onClick={sendCommand} disabled={sending || !testCmd.trim()} style={{ background: '#E8622A', color: 'white', border: 'none', borderRadius: 9, padding: '0 18px', fontSize: 13, fontWeight: 700, cursor: sending ? 'wait' : 'pointer', fontFamily: 'Outfit, sans-serif' }}>
            <Send size={14} style={{ verticalAlign: '-2px', marginRight: 6 }} /> Send
          </button>
        </div>
        {testRes && (
          <div style={{ marginTop: 10, fontSize: 13, color: testRes.ok ? '#22C55E' : '#EF4444' }}>{testRes.message}</div>
        )}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 12 }}>
          {EXAMPLE_COMMANDS.map(s => (
            <button key={s} onClick={() => setTestCmd(s)} style={{ background: 'rgba(255,255,255,0.04)', color: '#7BAED4', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 99, padding: '5px 11px', fontSize: 11, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>{s}</button>
          ))}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr)', gap: 16 }}>
        <div style={{ background: '#0A1E38', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, overflow: 'hidden' }}>
          <div style={{ padding: '14px 18px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'white' }}>Command history</div>
            <div style={{ fontSize: 11, color: '#7BAED4' }}>{props.dailyLimit ? `${props.dailyCount}/${props.dailyLimit} today` : 'Unlimited'}</div>
          </div>
          {props.history.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', color: '#4A7FBB', fontSize: 13 }}>
              <MessageSquare size={28} style={{ margin: '0 auto 8px', opacity: 0.6 }} />
              No commands yet. Send one above.
            </div>
          ) : (
            <div>
              {props.history.map((h, i) => (
                <div key={h.id} style={{ padding: '12px 18px', borderBottom: i < props.history.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                    <div style={{ fontSize: 13, color: 'white', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0, flex: 1 }}>{h.raw_command}</div>
                    <span style={{
                      fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 99, textTransform: 'uppercase', letterSpacing: '0.05em', flexShrink: 0,
                      background: h.outcome === 'success' ? 'rgba(34,197,94,0.15)' : h.outcome === 'failed' ? 'rgba(239,68,68,0.15)' : h.outcome === 'cancelled' ? 'rgba(255,255,255,0.06)' : 'rgba(245,158,11,0.15)',
                      color: h.outcome === 'success' ? '#22C55E' : h.outcome === 'failed' ? '#EF4444' : h.outcome === 'cancelled' ? '#7BAED4' : '#F59E0B',
                    }}>{h.outcome.replace('_', ' ')}</span>
                  </div>
                  <div style={{ fontSize: 11, color: '#7BAED4', marginTop: 4 }}>
                    {h.parsed_intent || '—'} · {h.platform} · {new Date(h.created_at).toLocaleString('en-AU', { dateStyle: 'short', timeStyle: 'short' })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ background: '#0A1E38', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: 18 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'white', marginBottom: 12 }}>Settings</div>
          <div style={{ fontSize: 11, color: '#7BAED4', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Connected</div>
          <div style={{ fontSize: 13, color: 'white', marginTop: 4 }}>{props.connectedPlatform}</div>
          <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: '14px 0' }} />
          <div style={{ fontSize: 11, color: '#7BAED4', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Authorised numbers</div>
          {props.authorisedNumbers.length === 0
            ? <div style={{ fontSize: 12, color: '#4A7FBB', marginTop: 4 }}>Owner only — add team numbers in Settings.</div>
            : props.authorisedNumbers.map(n => <div key={n} style={{ fontSize: 12, color: 'white', marginTop: 4 }}>{n}</div>)
          }
        </div>
      </div>
    </div>
  )
}
