'use client'

import { useMemo, useState } from 'react'
import { MessageSquare, ChevronDown, ChevronUp, Phone, Globe } from 'lucide-react'

// One row from the `calls` table for the demo business. Web vs phone is derived
// from caller_number: web calls (Talk button) have no caller number.
export interface DemoCallRow {
  id: string
  created_at: string | null
  started_at: string | null
  duration_seconds: number | null
  caller_number: string | null
  transcript: string | null
  summary: string | null
  outcome: string | null
  intelligence_score: number | null
}

type FilterMode = 'all' | 'phone' | 'web'

const ORANGE = '#E8622A'
const BLUE = '#1565C0'
const MUTED = 'rgba(255,255,255,0.55)'
const CARD_BG = '#0A1E38'
const BORDER = '1px solid rgba(255,255,255,0.06)'

function isWeb(c: DemoCallRow): boolean {
  return !c.caller_number
}

function fmtAEST(iso: string | null): string {
  if (!iso) return 'Unknown time'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return 'Unknown time'
  try {
    return new Intl.DateTimeFormat('en-AU', {
      timeZone: 'Australia/Brisbane',
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: true,
    }).format(d) + ' AEST'
  } catch {
    return d.toISOString()
  }
}

function fmtDuration(secs: number | null): string {
  if (!secs || secs <= 0) return '0s'
  if (secs < 60) return `${secs}s`
  const m = Math.floor(secs / 60)
  const s = secs % 60
  return s ? `${m}m ${s}s` : `${m}m`
}

// Mask all but the last 4 digits of a caller number.
function maskNumber(num: string): string {
  const digits = num.replace(/[^\d+]/g, '')
  if (digits.length <= 5) return num
  return `${digits.slice(0, 4)}XXXX${digits.slice(-4)}`
}

// Parse a plain-text Vapi transcript into speaker turns. Vapi emits lines like
// "AI: ..." / "User: ...". When no speaker prefixes are present we fall back to
// a plain block (handled by the caller).
type Turn = { speaker: 'agent' | 'caller' | 'other'; text: string }
function parseTranscript(t: string): { turns: Turn[]; structured: boolean } {
  const lines = t.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
  const turns: Turn[] = []
  let structured = false
  for (const line of lines) {
    const m = line.match(/^(AI|Assistant|Bot|Agent|TalkMate|User|Customer|Caller|Human)\s*[:\-]\s*(.*)$/i)
    if (m && m[2]) {
      structured = true
      const who = m[1].toLowerCase()
      const speaker = ['ai', 'assistant', 'bot', 'agent', 'talkmate'].includes(who) ? 'agent' : 'caller'
      turns.push({ speaker, text: m[2] })
    } else {
      turns.push({ speaker: 'other', text: line })
    }
  }
  return { turns, structured }
}

function StatPill({ label, value }: { label: string; value: string | number }) {
  return (
    <div style={{
      display: 'inline-flex', flexDirection: 'column', gap: 2,
      padding: '8px 14px', background: CARD_BG, border: BORDER,
      borderRadius: 10, minWidth: 84,
    }}>
      <span style={{ fontSize: 18, fontWeight: 800, lineHeight: 1, color: 'white' }}>{value}</span>
      <span style={{ fontSize: 10, fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</span>
    </div>
  )
}

function TypeBadge({ web }: { web: boolean }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      fontSize: 10, fontWeight: 800, letterSpacing: '0.05em',
      padding: '3px 8px', borderRadius: 99,
      background: web ? 'rgba(21,101,192,0.18)' : 'rgba(100,116,139,0.18)',
      color: web ? '#5AA2F0' : '#94A3B8',
    }}>
      {web ? <Globe size={10} /> : <Phone size={10} />}
      {web ? 'WEB' : 'PHONE'}
    </span>
  )
}

export default function DemoCallsClient({ calls, demoNumber }: { calls: DemoCallRow[]; demoNumber: string }) {
  const [filter, setFilter] = useState<FilterMode>('all')
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const stats = useMemo(() => {
    const web = calls.filter(isWeb).length
    const phone = calls.length - web
    const withDur = calls.filter(c => (c.duration_seconds ?? 0) > 0)
    const avg = withDur.length
      ? Math.round(withDur.reduce((s, c) => s + (c.duration_seconds ?? 0), 0) / withDur.length)
      : 0
    return { total: calls.length, web, phone, avg }
  }, [calls])

  const visible = useMemo(() => {
    if (filter === 'web') return calls.filter(isWeb)
    if (filter === 'phone') return calls.filter(c => !isWeb(c))
    return calls
  }, [calls, filter])

  const page: React.CSSProperties = {
    padding: 24, fontFamily: 'Outfit, sans-serif', color: 'white',
    background: '#061322', minHeight: '100vh',
  }

  return (
    <div style={page}>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 28, fontWeight: 800, margin: '0 0 6px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <MessageSquare size={24} color={ORANGE} /> Demo Call Transcripts
        </h1>
        <p style={{ color: MUTED, margin: 0, fontSize: 14 }}>
          Real calls to the demo phone number and website Talk button
        </p>
      </div>

      {/* Stat pills */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 20 }}>
        <StatPill label="Total" value={stats.total} />
        <StatPill label="Web" value={stats.web} />
        <StatPill label="Phone" value={stats.phone} />
        <StatPill label="Avg duration" value={fmtDuration(stats.avg)} />
      </div>

      {calls.length === 0 ? (
        <EmptyState demoNumber={demoNumber} />
      ) : (
        <>
          {/* Filter toggle */}
          <div style={{ display: 'inline-flex', gap: 4, marginBottom: 16, background: CARD_BG, border: BORDER, borderRadius: 10, padding: 4 }}>
            {(['all', 'phone', 'web'] as FilterMode[]).map(m => {
              const active = filter === m
              const label = m === 'all' ? 'All' : m === 'phone' ? 'Phone calls' : 'Web calls'
              return (
                <button
                  key={m}
                  onClick={() => setFilter(m)}
                  style={{
                    padding: '7px 14px', borderRadius: 7, border: 'none', cursor: 'pointer',
                    fontFamily: 'inherit', fontSize: 13, fontWeight: 600,
                    background: active ? ORANGE : 'transparent',
                    color: active ? 'white' : MUTED,
                    transition: 'background 150ms ease, color 150ms ease',
                  }}
                >
                  {label}
                </button>
              )
            })}
          </div>

          {/* Call list */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {visible.map(c => {
              const web = isWeb(c)
              const expanded = expandedId === c.id
              const longCall = (c.duration_seconds ?? 0) > 30
              return (
                <div
                  key={c.id}
                  style={{
                    background: CARD_BG, border: BORDER, borderRadius: 12,
                    borderLeft: `4px solid ${longCall ? ORANGE : '#374151'}`,
                    overflow: 'hidden',
                  }}
                >
                  <button
                    onClick={() => setExpandedId(expanded ? null : c.id)}
                    style={{
                      width: '100%', textAlign: 'left', background: 'transparent', border: 'none',
                      cursor: 'pointer', color: 'white', fontFamily: 'inherit',
                      padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 8,
                    }}
                  >
                    {/* Row 1 */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 13, fontWeight: 600 }}>{fmtAEST(c.created_at ?? c.started_at)}</span>
                      <span style={{ fontSize: 12, color: MUTED }}>{fmtDuration(c.duration_seconds)}</span>
                      <TypeBadge web={web} />
                      <span style={{ marginLeft: 'auto', color: MUTED, display: 'flex', alignItems: 'center' }}>
                        {expanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                      </span>
                    </div>
                    {/* Row 2 */}
                    <div style={{ fontSize: 13, color: MUTED }}>
                      {web ? 'talkmate.com.au visitor' : maskNumber(c.caller_number ?? '')}
                    </div>
                    {/* Row 3 — score + outcome (collapsed summary line) */}
                    {(c.intelligence_score != null || c.outcome) && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        {c.intelligence_score != null && (
                          <span style={{
                            fontSize: 10, fontWeight: 800, padding: '3px 8px', borderRadius: 99,
                            background: 'rgba(34,197,94,0.15)', color: '#4ADE80',
                          }}>
                            CI {c.intelligence_score}
                          </span>
                        )}
                        {c.outcome && (
                          <span style={{
                            fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 99,
                            background: 'rgba(255,255,255,0.06)', color: '#CBD5E1',
                          }}>
                            {c.outcome}
                          </span>
                        )}
                      </div>
                    )}
                  </button>

                  {/* Expanded transcript */}
                  {expanded && (
                    <div style={{ borderTop: BORDER, padding: '14px 16px', background: 'rgba(0,0,0,0.18)' }}>
                      <TranscriptView transcript={c.transcript} />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

function TranscriptView({ transcript }: { transcript: string | null }) {
  if (!transcript || !transcript.trim()) {
    return (
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#CBD5E1' }}>No transcript recorded for this call</div>
        <div style={{ fontSize: 12, color: MUTED, marginTop: 4 }}>
          This may be a seeded demo call or the call ended before transcription completed.
        </div>
      </div>
    )
  }

  const { turns, structured } = parseTranscript(transcript)
  if (!structured) {
    return (
      <pre style={{
        whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: 0,
        fontSize: 13, lineHeight: 1.55, color: '#E2E8F0',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
      }}>
        {transcript}
      </pre>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {turns.map((t, i) => {
        if (t.speaker === 'other') {
          return (
            <div key={i} style={{ fontSize: 12, color: MUTED, textAlign: 'center', fontStyle: 'italic' }}>{t.text}</div>
          )
        }
        const agent = t.speaker === 'agent'
        return (
          <div key={i} style={{ display: 'flex', justifyContent: agent ? 'flex-end' : 'flex-start' }}>
            <div style={{ maxWidth: '80%' }}>
              <div style={{
                fontSize: 10, fontWeight: 700, color: agent ? ORANGE : MUTED,
                textAlign: agent ? 'right' : 'left', marginBottom: 3,
                textTransform: 'uppercase', letterSpacing: '0.05em',
              }}>
                {agent ? 'TalkMate' : 'Caller'}
              </div>
              <div style={{
                fontSize: 13, lineHeight: 1.5, padding: '8px 12px', borderRadius: 10,
                background: agent ? 'rgba(232,98,42,0.16)' : 'rgba(148,163,184,0.12)',
                color: '#F1F5F9',
                borderTopRightRadius: agent ? 2 : 10,
                borderTopLeftRadius: agent ? 10 : 2,
              }}>
                {t.text}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function EmptyState({ demoNumber }: { demoNumber: string }) {
  // Pretty-print the E.164 demo number for display (e.g. +61 752 409 791).
  const pretty = demoNumber.replace(/^(\+61)(\d{3})(\d{3})(\d{3})$/, '$1 $2 $3 $4')
  return (
    <div style={{
      background: CARD_BG, border: BORDER, borderRadius: 12, padding: 32,
      textAlign: 'center', maxWidth: 560,
    }}>
      <MessageSquare size={28} color={MUTED} style={{ marginBottom: 12 }} />
      <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 10 }}>No demo calls yet.</div>
      <p style={{ fontSize: 13, color: MUTED, lineHeight: 1.6, margin: '0 0 10px' }}>
        Once the demo phone number ({pretty}) receives a real call, or someone uses the Talk button on talkmate.com.au, the transcript will appear here.
      </p>
      <p style={{ fontSize: 12, color: MUTED, margin: 0 }}>
        The demo reset cron does not affect call transcripts.
      </p>
    </div>
  )
}
