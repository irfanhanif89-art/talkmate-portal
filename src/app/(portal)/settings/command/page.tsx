'use client'

// TalkMate Command — client portal management page.
//
// Surfaces the live state of a client's Telegram bot, plus the full
// command reference and recent command history. RLS scopes everything
// to the caller's own business so no client can see another client's
// data. WhatsApp was removed from the product — only Telegram is
// supported.

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

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
  platform: 'telegram' | 'whatsapp' // legacy: 'whatsapp' rows may exist in historical data but are not shown for new clients
  raw_message: string
  parsed_intent: string | null
  action_taken: string | null
  success: boolean
  response_sent: string | null
  created_at: string
}

const INTENT_LABEL: Record<string, string> = {
  set_wait_time: 'Set wait time',
  toggle_availability: 'Toggle availability',
  view_jobs: 'View jobs',
  view_bookings: 'View bookings',
  assign_job: 'Assign job',
  complete_job: 'Complete job',
  unknown: 'Unknown',
}

export default function CommandSettingsPage() {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [bot, setBot] = useState<CommandBotRow | null>(null)
  const [history, setHistory] = useState<CommandHistoryRow[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        if (!cancelled) { setError('Not signed in.'); setLoading(false) }
        return
      }
      const { data: biz } = await supabase
        .from('businesses')
        .select('id')
        .eq('owner_user_id', user.id)
        .maybeSingle()
      if (!biz?.id) {
        if (!cancelled) { setError('Business not found.'); setLoading(false) }
        return
      }
      const [{ data: botRow }, { data: histRows }] = await Promise.all([
        supabase.from('command_bots').select('*').eq('client_id', biz.id).maybeSingle(),
        supabase.from('command_history').select('id, platform, raw_message, parsed_intent, action_taken, success, response_sent, created_at')
          .eq('client_id', biz.id)
          .order('created_at', { ascending: false })
          .limit(10),
      ])
      if (cancelled) return
      setBot((botRow as CommandBotRow) ?? null)
      setHistory((histRows as CommandHistoryRow[]) ?? [])
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [supabase])

  if (loading) return <Shell><p style={{ color: '#7BAED4', padding: 28 }}>Loading…</p></Shell>
  if (error) return <Shell><p style={{ color: '#EF4444', padding: 28 }}>{error}</p></Shell>

  if (!bot) {
    return (
      <Shell>
        <div style={{ background: '#0A1E38', borderRadius: 16, padding: 28, border: '1px solid rgba(255,255,255,0.06)' }}>
          <h2 style={{ fontSize: 20, fontWeight: 800, color: 'white', margin: 0, marginBottom: 8 }}>TalkMate Command</h2>
          <p style={{ color: '#7BAED4', fontSize: 14, margin: 0, marginBottom: 16 }}>
            TalkMate Command isn&apos;t enabled on your account yet. It&apos;s available on the Growth plan for towing businesses.
          </p>
          <a href="/billing" style={{ display: 'inline-block', padding: '10px 18px', background: '#E8622A', color: 'white', borderRadius: 10, fontSize: 13, fontWeight: 600, textDecoration: 'none', fontFamily: 'Outfit,sans-serif' }}>
            Upgrade your plan →
          </a>
        </div>
      </Shell>
    )
  }

  return (
    <Shell>
      <header style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 22, fontWeight: 800, color: 'white', margin: 0, marginBottom: 6 }}>TalkMate Command</h2>
        <p style={{ color: '#7BAED4', fontSize: 14, margin: 0 }}>
          Manage your dispatcher from Telegram. Send a message in plain English — your bot handles the rest.
        </p>
      </header>

      {/* Telegram is the only channel exposed to clients. */}
      <div style={{ marginBottom: 24 }}>
        <Card>
          <CardHeader title="📨 Telegram" pill={bot.telegram_enabled ? 'ACTIVE' : 'PENDING'} pillOk={bot.telegram_enabled} />
          <Row label="Bot" value={bot.telegram_bot_username ? `@${bot.telegram_bot_username}` : 'Being set up'} />
          <Row label="Bot name" value={bot.telegram_bot_name ?? '—'} />
          <Row label="Activated" value={fmtDate(bot.telegram_activated_at)} />
          {bot.telegram_bot_username && bot.status === 'active' && (
            <a href={`https://t.me/${bot.telegram_bot_username}`} target="_blank" rel="noopener noreferrer" style={ctaBtn('#E8622A')}>Open in Telegram →</a>
          )}
        </Card>
      </div>

      <Card>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: 'white', margin: 0, marginBottom: 14 }}>Commands you can use</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
          {[
            ['SET WAIT TIME', ['"We\'re busy for 2 hours"', '"Wait time is 45 minutes"']],
            ['TOGGLE AVAILABILITY', ['"Stop taking jobs"', '"Back online"']],
            ['VIEW JOBS', ['"Show today\'s jobs"', '"List pending jobs"']],
            ['VIEW BOOKINGS', ['"Any bookings?"']],
            ['ASSIGN A JOB', ['"Assign JOB-0042 to Dave"']],
            ['COMPLETE A JOB', ['"JOB-0042 is done"']],
          ].map(([title, examples]) => (
            <div key={title as string}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#E8622A', letterSpacing: '0.08em', marginBottom: 6 }}>{title as string}</div>
              {(examples as string[]).map(ex => (
                <div key={ex} style={{ fontSize: 13, color: '#C8D8EA', marginBottom: 3 }}>{ex}</div>
              ))}
            </div>
          ))}
        </div>
      </Card>

      <div style={{ marginTop: 24 }}>
        <Card>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: 'white', margin: 0 }}>Recent commands</h3>
            <span style={{ fontSize: 12, color: '#4A7FBB' }}>{bot.total_commands ?? 0} total · last {bot.last_command_at ? fmtDate(bot.last_command_at) : 'never'}</span>
          </div>
          {history.length === 0 ? (
            <p style={{ fontSize: 13, color: '#4A7FBB', margin: 0 }}>No commands yet — send your first message from Telegram.</p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ textAlign: 'left', color: '#4A7FBB', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    <th style={th}>Time</th>
                    <th style={th}>Platform</th>
                    <th style={th}>Command</th>
                    <th style={th}>Action</th>
                    <th style={th}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map(h => (
                    <tr key={h.id} style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                      <td style={td}>{fmtDate(h.created_at)}</td>
                      <td style={td}>{h.platform === 'telegram' ? '📨 Telegram' : '💬 WhatsApp'}</td>
                      <td style={{ ...td, maxWidth: 280, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={h.raw_message}>{h.raw_message}</td>
                      <td style={td}>{INTENT_LABEL[h.parsed_intent ?? 'unknown'] ?? '—'}</td>
                      <td style={td}>{h.success ? <span style={{ color: '#22C55E' }}>✓</span> : <span style={{ color: '#EF4444' }}>✗</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </Shell>
  )
}

// ── presentational helpers ──────────────────────────────────────────────

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ padding: 28, maxWidth: 980, margin: '0 auto' }}>
      {children}
    </div>
  )
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: '#0A1E38', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 16, padding: 22 }}>
      {children}
    </div>
  )
}

function CardHeader({ title, pill, pillOk }: { title: string; pill: string; pillOk: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: 'white' }}>{title}</div>
      <span style={{
        fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 99,
        background: pillOk ? 'rgba(34,197,94,0.15)' : 'rgba(232,98,42,0.12)',
        color: pillOk ? '#22C55E' : '#E8622A',
      }}>{pillOk ? '✓ ' : ''}{pill}</span>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', fontSize: 13, borderTop: '1px solid rgba(255,255,255,0.04)' }}>
      <span style={{ color: '#4A7FBB' }}>{label}</span>
      <span style={{ color: 'white', fontWeight: 500, textAlign: 'right' }}>{value}</span>
    </div>
  )
}

function ctaBtn(color: string): React.CSSProperties {
  return {
    display: 'inline-block', marginTop: 14, padding: '10px 16px',
    background: color, color: 'white', borderRadius: 10,
    fontSize: 13, fontWeight: 600, textDecoration: 'none',
    fontFamily: 'Outfit, sans-serif',
  }
}

const th: React.CSSProperties = { padding: '6px 8px', fontWeight: 700 }
const td: React.CSSProperties = { padding: '10px 8px', color: '#C8D8EA' }

function fmtDate(s: string | null): string {
  if (!s) return '—'
  try {
    return new Date(s).toLocaleString('en-AU', { dateStyle: 'short', timeStyle: 'short' })
  } catch {
    return s
  }
}
