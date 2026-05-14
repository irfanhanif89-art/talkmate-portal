'use client'

// Session 12 — TalkMate Command tab inside the admin edit-client modal.
// Visible only for towing Growth+ clients. Surfaces the command_bots row
// state, lets Donna paste a BotFather token to finalise setup, and shows
// the last 20 entries from command_history.
//
// The "Create bot manually" button is the fallback when activation
// didn't run the bot provisioner (legacy clients, or admin re-runs).

import { useEffect, useState } from 'react'
import { createClient as createBrowserClient } from '@/lib/supabase/client'
import type { AdminBusiness } from './types'

interface CommandBotRow {
  client_id: string
  telegram_bot_token: string | null
  telegram_bot_username: string | null
  telegram_bot_name: string | null
  telegram_chat_id: string | null
  telegram_enabled: boolean
  telegram_activated_at: string | null
  whatsapp_number: string | null
  whatsapp_enabled: boolean
  whatsapp_activated_at: string | null
  status: string
  last_command_at: string | null
  total_commands: number
}

interface CommandHistoryRow {
  id: string
  platform: 'telegram' | 'whatsapp'
  raw_message: string
  parsed_intent: string | null
  action_taken: string | null
  success: boolean
  error_message: string | null
  response_sent: string | null
  created_at: string
}

export function AdminCommandTab({ business }: { business: AdminBusiness }) {
  const supabase = createBrowserClient()
  const [bot, setBot] = useState<CommandBotRow | null>(null)
  const [history, setHistory] = useState<CommandHistoryRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Admin actions
  const [tokenInput, setTokenInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  async function load() {
    setLoading(true); setError(null)
    const [{ data: botRow, error: botErr }, { data: histRows }] = await Promise.all([
      supabase.from('command_bots').select('*').eq('client_id', business.id).maybeSingle(),
      supabase.from('command_history').select('*')
        .eq('client_id', business.id)
        .order('created_at', { ascending: false })
        .limit(20),
    ])
    if (botErr) setError(botErr.message)
    setBot((botRow as CommandBotRow) ?? null)
    setHistory((histRows as CommandHistoryRow[]) ?? [])
    setLoading(false)
  }

  useEffect(() => { load() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [business.id])

  async function createBot() {
    setBusy(true); setMsg(null)
    try {
      const res = await fetch(`/api/admin/clients/${business.id}/command`, { method: 'POST' })
      const data = await res.json()
      if (!data.ok) throw new Error(data.error ?? data.result?.error ?? 'Failed')
      setMsg('Bot record created (pending Telegram token).')
      await load()
    } catch (e) {
      setMsg(`❌ ${(e as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  async function setToken() {
    if (!tokenInput.trim()) return
    setBusy(true); setMsg(null)
    try {
      const res = await fetch(`/api/admin/clients/${business.id}/command`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ botToken: tokenInput.trim() }),
      })
      const data = await res.json()
      if (!data.ok) throw new Error(data.error ?? 'Failed')
      setMsg(`✅ Token saved. Webhook ${data.webhookSet ? 'set' : 'NOT set — check TELEGRAM_WEBHOOK_SECRET'}.`)
      setTokenInput('')
      await load()
    } catch (e) {
      setMsg(`❌ ${(e as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <p style={{ fontSize: 12, color: '#7BAED4' }}>Loading…</p>

  return (
    <div>
      <p style={{ fontSize: 12, color: '#7BAED4', margin: 0, marginBottom: 14 }}>
        Industry: <strong style={{ color: 'white' }}>{business.industry ?? '—'}</strong>{' · '}
        Plan: <strong style={{ color: 'white' }}>{business.plan ?? 'starter'}</strong>
      </p>

      {error && <ErrorMsg msg={error} />}

      {!bot ? (
        <div style={{ padding: 14, borderRadius: 10, background: '#071829', border: '1px solid rgba(255,255,255,0.05)', marginBottom: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'white', marginBottom: 6 }}>No command bot record</div>
          <p style={{ fontSize: 12, color: '#7BAED4', margin: 0, marginBottom: 12 }}>
            This usually happens for legacy clients activated before TalkMate Command shipped, or when activation failed mid-flight. Create the pending record now.
          </p>
          <button onClick={createBot} disabled={busy}
            style={{ padding: '8px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700, background: '#22C55E', border: 'none', color: 'white', cursor: busy ? 'not-allowed' : 'pointer', fontFamily: 'Outfit, sans-serif' }}>
            {busy ? 'Creating…' : 'Create bot record'}
          </button>
        </div>
      ) : (
        <>
          {/* WhatsApp is wired up in the backend (/api/command/whatsapp)
              but intentionally hidden from this admin UI until the
              Twilio number pool and approvals are in place. */}
          <div style={{ marginBottom: 14 }}>
            <Panel
              title="📨 Telegram"
              statusActive={bot.telegram_enabled && bot.status === 'active'}
              statusLabel={bot.telegram_enabled && bot.status === 'active' ? 'ACTIVE' : 'PENDING'}
            >
              <Row k="Token" v={bot.telegram_bot_token ? `••••${bot.telegram_bot_token.slice(-6)}` : 'Not set'} />
              <Row k="Bot" v={bot.telegram_bot_username ? `@${bot.telegram_bot_username}` : '—'} />
              <Row k="Name" v={bot.telegram_bot_name ?? '—'} />
              <Row k="Chat ID" v={bot.telegram_chat_id ? `${bot.telegram_chat_id.slice(0, 6)}…` : 'Not linked'} />
              <Row k="Activated" v={fmtDate(bot.telegram_activated_at)} />
            </Panel>
          </div>

          <div style={{ padding: 14, borderRadius: 10, background: '#071829', border: '1px solid rgba(255,255,255,0.05)', marginBottom: 14 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'white', marginBottom: 4 }}>Paste Telegram bot token</div>
            <p style={{ fontSize: 12, color: '#7BAED4', margin: 0, marginBottom: 10 }}>
              Create the bot via <strong>@BotFather</strong> in Telegram, then paste the token here. We&apos;ll verify it via getMe, save it, and set the webhook.
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                value={tokenInput}
                onChange={e => setTokenInput(e.target.value)}
                placeholder="1234567890:ABCdef..."
                spellCheck={false}
                style={{ flex: 1, padding: '9px 12px', background: '#0A1E38', border: '1px solid rgba(255,255,255,0.08)', color: 'white', borderRadius: 8, fontSize: 13, fontFamily: 'monospace' }}
              />
              <button onClick={setToken} disabled={busy || !tokenInput.trim()}
                style={{ padding: '8px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700, background: '#E8622A', border: 'none', color: 'white', cursor: busy ? 'not-allowed' : 'pointer', fontFamily: 'Outfit, sans-serif' }}>
                {busy ? 'Saving…' : 'Save & set webhook'}
              </button>
            </div>
          </div>

          <div style={{ padding: 14, borderRadius: 10, background: '#071829', border: '1px solid rgba(255,255,255,0.05)', marginBottom: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'white' }}>Stats</div>
              <span style={{ fontSize: 11, color: '#4A7FBB' }}>{bot.status}</span>
            </div>
            <Row k="Total commands" v={String(bot.total_commands ?? 0)} />
            <Row k="Last command" v={fmtDate(bot.last_command_at)} />
          </div>
        </>
      )}

      {msg && <p style={{ fontSize: 12, color: msg.startsWith('❌') ? '#EF4444' : '#22C55E', marginTop: 0 }}>{msg}</p>}

      <div style={{ marginTop: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'white', marginBottom: 8 }}>Recent commands (last 20)</div>
        {history.length === 0 ? (
          <p style={{ fontSize: 12, color: '#4A7FBB' }}>No commands logged yet.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ textAlign: 'left', color: '#4A7FBB', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  <th style={th}>Time</th>
                  <th style={th}>Platform</th>
                  <th style={th}>Message</th>
                  <th style={th}>Intent</th>
                  <th style={th}>OK</th>
                </tr>
              </thead>
              <tbody>
                {history.map(h => (
                  <tr key={h.id} style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                    <td style={td}>{fmtDate(h.created_at)}</td>
                    <td style={td}>{h.platform}</td>
                    <td style={{ ...td, maxWidth: 220, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={h.raw_message}>{h.raw_message}</td>
                    <td style={td}>{h.parsed_intent ?? '—'}</td>
                    <td style={td}>{h.success ? '✓' : '✗'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

// ── helpers ─────────────────────────────────────────────────────────────

function Panel({
  title, statusActive, statusLabel, children,
}: {
  title: string; statusActive: boolean; statusLabel: string; children: React.ReactNode
}) {
  return (
    <div style={{ padding: 14, borderRadius: 10, background: '#071829', border: '1px solid rgba(255,255,255,0.05)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'white' }}>{title}</div>
        <span style={{
          fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 99,
          background: statusActive ? 'rgba(34,197,94,0.15)' : 'rgba(232,98,42,0.12)',
          color: statusActive ? '#22C55E' : '#E8622A',
        }}>{statusLabel}</span>
      </div>
      {children}
    </div>
  )
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', fontSize: 12, borderTop: '1px solid rgba(255,255,255,0.04)' }}>
      <span style={{ color: '#4A7FBB' }}>{k}</span>
      <span style={{ color: 'white', fontFamily: 'monospace', fontSize: 11 }}>{v}</span>
    </div>
  )
}

function ErrorMsg({ msg }: { msg: string }) {
  return (
    <div style={{ padding: '8px 12px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 8, color: '#EF4444', fontSize: 12, marginBottom: 10 }}>
      {msg}
    </div>
  )
}

const th: React.CSSProperties = { padding: '5px 6px', fontWeight: 700 }
const td: React.CSSProperties = { padding: '7px 6px', color: '#C8D8EA' }

function fmtDate(s: string | null): string {
  if (!s) return '—'
  try { return new Date(s).toLocaleString('en-AU', { dateStyle: 'short', timeStyle: 'short' }) }
  catch { return s }
}
