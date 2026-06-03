'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import CallMessagesSection from '@/components/portal/call-messages-section'
import { FilterTabs } from '@/components/portal/ui-v2/tabs'
import { CallListRow } from '@/components/portal/ui-v2/call-row'
import { AiScoreBadge } from '@/components/portal/ui-v2/ai-score-badge'
import { Tag, type TagVariant } from '@/components/portal/ui-v2/tag'
import { Panel } from '@/components/portal/ui-v2/panel'
import { Waveform } from '@/components/portal/ui-v2/waveform'
import { ButtonV2 } from '@/components/portal/ui-v2/button'

// ─── Types ────────────────────────────────────────────────────────────────────

interface CallFlag {
  type: string
  detail?: string
}

interface CallAction {
  type: string
  phone?: string | null
  context?: string | null
  reason?: string | null
}

interface Call {
  id: string
  caller_number: string
  outcome: string
  duration_seconds: number
  created_at: string
  transferred: boolean
  transcript: string | null
  recording_url: string | null
  caller_name: string | null
  summary: string | null
  // Session 18 — Call Intelligence
  intelligence_status: 'resolved' | 'review' | 'critical' | 'pending' | 'error' | null
  intelligence_score: number | null
  intelligence_summary: string | null
  intelligence_flags: CallFlag[] | null
  intelligence_actions: CallAction[] | null
  owner_alerted: boolean | null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const FLAG_LABELS: Record<string, string> = {
  short_call: 'Short call',
  vip_not_transferred: 'VIP not transferred',
  agent_promise: 'Agent promised follow-up',
  caller_frustrated: 'Caller frustrated',
  missed_lead: 'Missed lead',
  warm_lead: 'Warm lead',
  agent_error: 'Agent error',
  no_resolution: 'No resolution',
}

/** Map flag type → flag-ok / flag-warn / flag-bad semantic class */
function flagClass(type: string): 'flag-ok' | 'flag-warn' | 'flag-bad' {
  switch (type) {
    case 'vip_not_transferred':
    case 'agent_error':
      return 'flag-bad'
    case 'agent_promise':
    case 'missed_lead':
    case 'caller_frustrated':
      return 'flag-warn'
    case 'warm_lead':
      return 'flag-ok'
    default:
      return 'flag-warn'
  }
}

/** Map outcome string → TagVariant */
function outcomeToVariant(outcome: string, transferred: boolean): TagVariant {
  const o = (outcome || '').toLowerCase()
  if (transferred) return 'transfer'
  if (o === 'missed' || !o) return 'missed'
  if (o.includes('book')) return 'book'
  if (o.includes('quote')) return 'quote'
  if (o.includes('emergency') || o.includes('escalat')) return 'emergency'
  if (o.includes('faq') || o.includes('question')) return 'question'
  return 'book' // default to resolved-ish
}

/** Map outcome → human label */
function outcomeLabel(outcome: string, transferred: boolean): string {
  if (transferred) return 'Transferred'
  const o = (outcome || '').toLowerCase()
  if (o === 'missed' || !o) return 'Missed'
  if (o.includes('book')) return 'Booking'
  if (o.includes('quote')) return 'Quote'
  if (o.includes('emergency') || o.includes('escalat')) return 'Emergency'
  if (o.includes('faq') || o.includes('question')) return 'Question'
  return 'Resolved'
}

function fmt(s: number) {
  if (!s) return '—'
  return s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`
}

function timeAgo(date: string) {
  const diff = Date.now() - new Date(date).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  return d === 1 ? 'yesterday' : `${d}d ago`
}

function callTime(date: string) {
  return new Date(date).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit', hour12: true })
}

function callerInitials(name: string | null, number: string): string {
  if (name) {
    const parts = name.trim().split(' ')
    return parts.length >= 2
      ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
      : name.slice(0, 2).toUpperCase()
  }
  return number.slice(-2)
}

// ─── Filter tab types ─────────────────────────────────────────────────────────

type TabValue = 'All' | 'Bookings' | 'Quotes' | 'Questions' | 'Escalated' | 'Missed'

function filterCall(call: Call, tab: TabValue): boolean {
  const v = outcomeToVariant(call.outcome, call.transferred)
  switch (tab) {
    case 'All':        return true
    case 'Bookings':   return v === 'book'
    case 'Quotes':     return v === 'quote'
    case 'Questions':  return v === 'question'
    case 'Escalated':  return v === 'emergency' || call.intelligence_status === 'critical' || call.intelligence_status === 'review'
    case 'Missed':     return v === 'missed'
  }
}

// ─── Transcript parser (same logic as before) ─────────────────────────────────

function parseTranscript(transcript: string | null): Array<{ role: string; content: string }> {
  if (!transcript) return []
  try {
    const parsed = JSON.parse(transcript)
    if (Array.isArray(parsed)) {
      return parsed.map((m: { role?: string; content?: string; message?: string }) => ({
        role: m.role || 'unknown',
        content: m.content || m.message || '',
      }))
    }
  } catch {
    // Plain text — split into lines
    return transcript.split('\n').filter(Boolean).map(line => {
      const isAI = line.toLowerCase().startsWith('ai:') || line.toLowerCase().startsWith('assistant:') || line.toLowerCase().startsWith('aaron:')
      return { role: isAI ? 'assistant' : 'user', content: line.replace(/^(ai|assistant|aaron|user|caller):\s*/i, '') }
    })
  }
  return []
}

// ─── Detail Panel ─────────────────────────────────────────────────────────────

function DetailPanel({ call }: { call: Call }) {
  const [playing, setPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [flagging, setFlagging] = useState<number | null>(null)
  const [flagged, setFlagged] = useState<Set<number>>(new Set())

  // Reset audio state when call changes
  useEffect(() => {
    setPlaying(false)
    setProgress(0)
    setCurrentTime(0)
    setDuration(0)
  }, [call.id])

  const handleTimeUpdate = useCallback(() => {
    const el = audioRef.current
    if (!el) return
    setCurrentTime(el.currentTime)
    setDuration(el.duration || 0)
    setProgress(el.duration ? el.currentTime / el.duration : 0)
  }, [])

  const handleScrub = useCallback((frac: number) => {
    const el = audioRef.current
    if (!el || !el.duration) return
    el.currentTime = frac * el.duration
    setProgress(frac)
  }, [])

  const togglePlay = useCallback(() => {
    const el = audioRef.current
    if (!el) return
    if (playing) { el.pause(); setPlaying(false) }
    else { el.play(); setPlaying(true) }
  }, [playing])

  async function flagWrong(idx: number) {
    setFlagging(idx)
    try {
      const res = await fetch('/api/calls/flag', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callId: call.id, messageIndex: idx }),
      })
      if (res.ok) setFlagged(prev => new Set(prev).add(idx))
    } finally {
      setFlagging(null)
    }
  }

  const variant = outcomeToVariant(call.outcome, call.transferred)
  const label = outcomeLabel(call.outcome, call.transferred)
  const initials = callerInitials(call.caller_name, call.caller_number || '??')
  const messages = parseTranscript(call.transcript)

  // Filter out admin-only flags (sms_mismatch) before rendering
  const clientFlags = (call.intelligence_flags ?? []).filter(f => f.type !== 'sms_mismatch')
  const showIntelPanel = typeof call.intelligence_score === 'number' || clientFlags.length > 0 || (call.intelligence_actions?.length ?? 0) > 0 || call.owner_alerted

  function fmtTime(s: number) {
    if (!isFinite(s) || s <= 0) return '0:00'
    const m = Math.floor(s / 60)
    const sec = Math.floor(s % 60)
    return `${m}:${sec.toString().padStart(2, '0')}`
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex gap-4 items-start px-[26px] py-[18px] border-b border-line flex-shrink-0">
        {/* Avatar */}
        <div className="w-[50px] h-[50px] rounded-[14px] flex-shrink-0 flex items-center justify-center text-[18px] font-extrabold"
          style={{ background: 'linear-gradient(135deg,#2a4a6a,#1a3350)', color: '#7fb0d5' }}>
          {initials}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="text-[19px] font-extrabold tracking-tight leading-tight">
            {call.caller_name || call.caller_number || 'Unknown caller'}
          </div>
          <div className="flex items-center gap-2.5 flex-wrap mt-1 text-[12.5px] text-dim">
            {call.caller_name && (
              <>
                <svg className="w-3 h-3 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 15a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 4.23h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 11a16 16 0 0 0 6 6l.92-.92a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>
                </svg>
                <span>{call.caller_number}</span>
                <span className="text-faint">·</span>
              </>
            )}
            <span>{new Date(call.created_at).toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' })}</span>
            <span className="text-faint">·</span>
            <span>{fmt(call.duration_seconds)}</span>
          </div>
        </div>

        {/* Outcome card */}
        <div className="flex-shrink-0">
          <div className={[
            'rounded-[11px] border px-[15px] py-[11px] min-w-[130px] text-center',
            variant === 'book'      ? 'bg-green-soft border-green/30'   :
            variant === 'missed'   ? 'bg-[rgba(240,98,90,.1)] border-red/30'  :
            variant === 'transfer' ? 'bg-[rgba(242,181,60,.1)] border-gold/30' :
            variant === 'quote'    ? 'bg-[rgba(238,106,44,.1)] border-orange/30' :
            variant === 'emergency'? 'bg-[rgba(240,98,90,.1)] border-red/30' :
                                     'bg-[rgba(91,155,217,.1)] border-blue/30',
          ].join(' ')}>
            <div className={[
              'text-[13px] font-bold',
              variant === 'book'      ? 'text-green'  :
              variant === 'missed'    ? 'text-red'    :
              variant === 'transfer'  ? 'text-gold'   :
              variant === 'quote'     ? 'text-orange' :
              variant === 'emergency' ? 'text-red'    :
                                        'text-blue',
            ].join(' ')}>
              {variant === 'book' ? '✓ ' : ''}{label}
            </div>
            <div className="text-[12px] text-dim mt-0.5">
              {new Date(call.created_at).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })}
            </div>
          </div>
        </div>
      </div>

      {/* Intelligence panel */}
      {showIntelPanel && (
        <div className="flex-shrink-0 flex gap-4 items-center px-[26px] py-[14px] border-b border-line">
          {/* AI Score */}
          <span className="text-[11px] font-bold tracking-[.08em] uppercase text-faint mr-1">AI Score</span>
          {typeof call.intelligence_score === 'number' ? (
            <div className="flex items-baseline gap-1">
              <span className={[
                'text-[24px] font-extrabold tracking-tight tnum',
                call.intelligence_score >= 8 ? 'text-green' : call.intelligence_score >= 6 ? 'text-gold' : 'text-red',
              ].join(' ')}>{call.intelligence_score}</span>
              <span className="text-[13px] text-faint">/ 10</span>
            </div>
          ) : (
            <span className="text-[13px] text-faint">—</span>
          )}

          {clientFlags.length > 0 && (
            <>
              <div className="w-px h-7 bg-line-strong flex-shrink-0" />
              {/* Flags */}
              <div className="flex gap-[7px] flex-wrap">
                {clientFlags.map((f, i) => {
                  const fc = flagClass(f.type)
                  const flabel = FLAG_LABELS[f.type] ?? f.type.replace(/_/g, ' ')
                  const cls = fc === 'flag-ok'
                    ? 'bg-green-soft text-green'
                    : fc === 'flag-bad'
                    ? 'bg-[rgba(240,98,90,.14)] text-red'
                    : 'bg-[rgba(242,181,60,.14)] text-gold'
                  return (
                    <span key={i} title={f.detail ?? ''} className={`inline-flex items-center gap-1 text-[11.5px] font-semibold px-[10px] py-1 rounded-[7px] ${cls}`}>
                      {fc === 'flag-ok' && (
                        <svg className="w-[11px] h-[11px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                      )}
                      {fc === 'flag-warn' && (
                        <svg className="w-[11px] h-[11px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                      )}
                      {fc === 'flag-bad' && (
                        <svg className="w-[11px] h-[11px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
                      )}
                      {flabel}
                    </span>
                  )
                })}
              </div>
            </>
          )}

          {/* Estimated revenue — placeholder; real value not yet linked to jobs table */}
          <div className="ml-auto text-right flex-shrink-0">
            <div className="text-[11px] text-faint">est. job value</div>
            <div className="text-[20px] font-extrabold text-orange tracking-tight tnum">—</div>
          </div>
        </div>
      )}

      {/* Summary / intelligence summary */}
      {(call.intelligence_summary || call.summary) && (
        <div className="flex-shrink-0 px-[26px] py-[12px] border-b border-line bg-[rgba(74,159,232,.04)]">
          <div className="text-[11px] font-bold uppercase tracking-[.08em] text-blue mb-1.5">
            {call.intelligence_summary ? 'Agent Summary' : 'AI Summary'}
          </div>
          <p className="text-[13.5px] text-dim leading-relaxed">{call.intelligence_summary ?? call.summary}</p>
        </div>
      )}

      {/* Actions + owner alert */}
      {((call.intelligence_actions?.length ?? 0) > 0 || call.owner_alerted) && (
        <div className="flex-shrink-0 px-[26px] py-[12px] border-b border-line flex flex-wrap gap-2 items-center">
          {call.intelligence_actions?.map((a, i) => {
            if (a.type === 'callback_suggested' && a.phone) {
              return (
                <a key={i} href={`tel:${a.phone}`} className="text-[12px] font-semibold px-3 py-1.5 rounded-lg bg-orange text-white no-underline">
                  Call back {a.phone}
                </a>
              )
            }
            if (a.type === 'review_transcript') {
              return (
                <span key={i} className="text-[12px] font-semibold px-3 py-1.5 rounded-lg bg-[rgba(74,159,232,.18)] text-blue">
                  Review transcript below
                </span>
              )
            }
            return null
          })}
          {call.owner_alerted && (
            <span className="text-[12px] text-green px-2.5 py-1 bg-green-soft rounded-lg">✓ Owner notified via SMS</span>
          )}
        </div>
      )}

      {/* Messages section (Session 19) */}
      <CallMessagesSection callId={call.id} />

      {/* Transcript */}
      <div className="flex-1 overflow-y-auto px-[26px] py-[18px] flex flex-col gap-[11px] [scrollbar-width:none]">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <div className="text-3xl mb-3">📋</div>
            <p className="text-[14px] text-dim">Transcript not available for this call.</p>
            <p className="text-[12px] text-faint mt-1">Transcripts are saved automatically for all new calls.</p>
          </div>
        )}
        {messages.map((msg, i) => {
          const isAI = msg.role === 'assistant' || msg.role === 'bot'
          const isFlagged = flagged.has(i)
          return (
            <div key={i} className="flex flex-col">
              <span className={[
                'block max-w-[70%] px-[14px] py-[10px] rounded-[13px] text-[13px] leading-[1.55]',
                isAI
                  ? 'bg-[rgba(238,106,44,.1)] border border-[rgba(238,106,44,.2)] rounded-bl-[4px] mr-auto'
                  : 'bg-card-2 border border-line rounded-br-[4px] ml-auto text-dim',
              ].join(' ')}>
                <span className={[
                  'block text-[10px] font-bold tracking-[.05em] uppercase opacity-70 mb-0.5',
                  isAI ? 'text-orange' : 'text-dim',
                ].join(' ')}>
                  {isAI ? 'Ava' : 'Caller'}
                </span>
                {msg.content}
              </span>
              {isAI && (
                <button
                  onClick={() => !isFlagged && flagWrong(i)}
                  disabled={isFlagged || flagging === i}
                  className="mt-1 text-[11px] bg-transparent border-none cursor-pointer text-left pl-[2px] disabled:cursor-default"
                  style={{ color: isFlagged ? 'var(--green)' : 'rgba(255,255,255,.35)', fontFamily: 'inherit' }}
                >
                  {isFlagged ? '✓ Flagged for retraining' : flagging === i ? 'Flagging…' : '⚠ This response was wrong'}
                </button>
              )}
            </div>
          )
        })}
        {/* Plain-text fallback */}
        {messages.length === 0 && call.transcript && (
          <pre className="text-[13px] text-dim leading-[1.8] whitespace-pre-wrap" style={{ fontFamily: 'inherit' }}>
            {call.transcript}
          </pre>
        )}
      </div>

      {/* Audio player */}
      {call.recording_url && (
        <div className="flex-shrink-0 flex items-center gap-[13px] px-[26px] py-[14px] border-t border-line">
          {/* Hidden HTML5 audio element */}
          <audio
            ref={audioRef}
            src={call.recording_url}
            onTimeUpdate={handleTimeUpdate}
            onLoadedMetadata={handleTimeUpdate}
            onEnded={() => setPlaying(false)}
            className="hidden"
          />

          {/* Round play button */}
          <button
            onClick={togglePlay}
            className="w-[42px] h-[42px] rounded-full flex-shrink-0 flex items-center justify-center border-0 cursor-pointer transition-all hover:brightness-110"
            style={{
              background: 'linear-gradient(135deg,#f4843f,#e85f24)',
              boxShadow: '0 6px 18px rgba(238,106,44,.45)',
            }}
            aria-label={playing ? 'Pause recording' : 'Play recording'}
          >
            {playing ? (
              <svg className="w-[17px] h-[17px] text-white" viewBox="0 0 24 24" fill="currentColor">
                <rect x="6" y="4" width="4" height="16" rx="1" />
                <rect x="14" y="4" width="4" height="16" rx="1" />
              </svg>
            ) : (
              <svg className="w-[17px] h-[17px] text-white" viewBox="0 0 24 24" fill="currentColor">
                <path d="M8 5v14l11-7z" />
              </svg>
            )}
          </button>

          {/* Waveform scrubber */}
          <div className="flex-1">
            <Waveform progress={progress} onScrub={handleScrub} bars={80} />
          </div>

          {/* Time display */}
          <span className="mono text-[12px] text-faint whitespace-nowrap">
            {fmtTime(currentTime)} / {duration > 0 ? fmtTime(duration) : fmt(call.duration_seconds)}
          </span>

          {/* Download */}
          <a
            href={call.recording_url}
            download
            className="text-[12px] font-semibold text-dim px-3 py-1.5 bg-card border border-line rounded-lg hover:bg-card-2 transition-colors no-underline"
          >
            Download
          </a>
        </div>
      )}
    </div>
  )
}

// ─── Empty-state ──────────────────────────────────────────────────────────────

function EmptyState({ filter, businessPhone }: { filter: TabValue; businessPhone: string }) {
  const [copied, setCopied] = useState(false)

  if (filter === 'Escalated') {
    return (
      <div className="flex flex-col items-center justify-center h-full py-16 text-center px-6">
        <div className="text-4xl mb-3">✅</div>
        <h3 className="text-[16px] font-semibold mb-2">No escalated calls</h3>
        <p className="text-[13px] text-dim max-w-[320px]">Your agent is handling everything well.</p>
      </div>
    )
  }

  if (filter === 'Missed') {
    return (
      <div className="flex flex-col items-center justify-center h-full py-16 text-center px-6">
        <div className="text-4xl mb-3">✅</div>
        <h3 className="text-[16px] font-semibold mb-2">No missed calls</h3>
        <p className="text-[13px] text-dim max-w-[320px]">Every call has been answered.</p>
      </div>
    )
  }

  if (filter !== 'All') {
    return (
      <div className="flex flex-col items-center justify-center h-full py-16 text-center px-6">
        <p className="text-[13px] text-dim">No calls match this filter.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center justify-center h-full py-16 text-center px-6">
      <svg className="mb-4" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--orange)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 15a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 4.23h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 11a16 16 0 0 0 6 6l.92-.92a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>
      </svg>
      <h3 className="text-[16px] font-semibold mb-2">Your agent is live and ready</h3>
      <p className="text-[13px] text-dim mb-5 max-w-[320px]">Make a test call to your TalkMate number to see your first call appear here.</p>
      <ButtonV2
        onClick={async () => {
          const num = businessPhone || '+61 1800 TALK'
          await navigator.clipboard.writeText(num)
          setCopied(true)
          setTimeout(() => setCopied(false), 2000)
        }}
      >
        {copied ? 'Copied! ✓' : 'Copy your TalkMate number'}
      </ButtonV2>
    </div>
  )
}

// ─── No-selection placeholder ─────────────────────────────────────────────────

function NoSelection() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-8">
      <svg className="mb-4 opacity-30" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 15a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 4.23h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 11a16 16 0 0 0 6 6l.92-.92a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>
      </svg>
      <p className="text-[13px] text-faint">Select a call to view details</p>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CallsPage() {
  const supabase = createClient()
  const [calls, setCalls] = useState<Call[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<TabValue>('All')
  const [search, setSearch] = useState('')
  const [selectedCall, setSelectedCall] = useState<Call | null>(null)
  const [businessPhone, setBusinessPhone] = useState('')

  // ── Data fetching (preserved exactly) ───────────────────────────────────────
  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setLoading(false); return }
      const { data: biz } = await supabase
        .from('businesses')
        .select('id, phone_number')
        .eq('owner_user_id', user.id)
        .single()
      if (!biz) { setLoading(false); return }
      setBusinessPhone((biz as { phone_number?: string | null }).phone_number ?? '')
      const { data } = await supabase
        .from('calls')
        .select('*')
        .eq('business_id', biz.id)
        .order('created_at', { ascending: false })
        .limit(100)
      setCalls(data || [])
      setLoading(false)
    }
    load()
  }, [])

  // ── Filtering ────────────────────────────────────────────────────────────────
  const filtered = calls.filter(c => {
    if (!filterCall(c, tab)) return false
    if (search && !c.caller_number?.includes(search) && !(c.caller_name || '').toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  // ── Tab counts (from real data) ───────────────────────────────────────────
  const tabDefs: { value: TabValue; label: string; count: number }[] = [
    { value: 'All',       label: 'All',       count: calls.filter(c => filterCall(c, 'All')).length },
    { value: 'Bookings',  label: 'Bookings',  count: calls.filter(c => filterCall(c, 'Bookings')).length },
    { value: 'Quotes',    label: 'Quotes',    count: calls.filter(c => filterCall(c, 'Quotes')).length },
    { value: 'Questions', label: 'Questions', count: calls.filter(c => filterCall(c, 'Questions')).length },
    { value: 'Escalated', label: 'Escalated', count: calls.filter(c => filterCall(c, 'Escalated')).length },
    { value: 'Missed',    label: 'Missed',    count: calls.filter(c => filterCall(c, 'Missed')).length },
  ]

  // ── CSV export ────────────────────────────────────────────────────────────
  function exportCSV() {
    const rows = [
      ['Caller', 'Number', 'Date', 'Duration', 'Outcome', 'Score', 'Transferred'],
      ...filtered.map(c => [
        c.caller_name ?? '',
        c.caller_number ?? '',
        new Date(c.created_at).toLocaleString('en-AU'),
        fmt(c.duration_seconds),
        outcomeLabel(c.outcome, c.transferred),
        c.intelligence_score?.toString() ?? '',
        c.transferred ? 'Yes' : 'No',
      ])
    ]
    const csv = rows.map(r => r.map(v => `"${v.replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = 'calls.csv'; a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Top bar */}
      <header className="flex-shrink-0 flex items-center gap-[18px] px-7 h-[68px] border-b border-line">
        <h1 className="text-[20px] font-extrabold tracking-tight">Calls</h1>
        <div className="ml-auto flex items-center gap-3">
          <div className="flex items-center gap-[7px] bg-green-soft border border-green/30 rounded-full px-3 py-[6px] text-[12.5px] font-bold text-green">
            <span className="relative flex w-[7px] h-[7px]">
              <span className="absolute inset-0 rounded-full bg-green animate-[tm-pulse_1.8s_ease-out_infinite]" />
              <span className="w-[7px] h-[7px] rounded-full bg-green relative" />
            </span>
            Live
          </div>
        </div>
      </header>

      {/* Filter bar */}
      <div className="flex-shrink-0 flex items-center gap-2.5 px-7 h-[58px] border-b border-line">
        <FilterTabs<TabValue>
          tabs={tabDefs}
          value={tab}
          onChange={setTab}
        />

        {/* Search */}
        <div className="flex items-center gap-2 bg-card border border-line rounded-[9px] px-3 py-[7px] text-faint text-[13px] w-[210px] ml-1.5">
          <svg className="w-[14px] h-[14px] flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" />
          </svg>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search caller or keyword…"
            className="bg-transparent border-none outline-none text-text placeholder:text-faint w-full text-[13px]"
            style={{ fontFamily: 'inherit' }}
          />
        </div>

        {/* Date — visual only for now */}
        <div className="flex items-center gap-[7px] bg-card border border-line rounded-[9px] px-3 py-[7px] text-[12.5px] text-dim cursor-pointer whitespace-nowrap ml-auto">
          <svg className="w-[14px] h-[14px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" />
          </svg>
          {new Date().toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })}
        </div>

        {/* Export CSV */}
        <button
          onClick={exportCSV}
          className="flex items-center gap-1.5 bg-card border border-line rounded-[9px] px-3 py-[7px] text-[12.5px] text-dim cursor-pointer whitespace-nowrap hover:bg-card-2 transition-colors"
          style={{ fontFamily: 'inherit' }}
        >
          <svg className="w-[14px] h-[14px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          Export CSV
        </button>
      </div>

      {/* Body — split grid */}
      <div className="flex-1 overflow-hidden grid" style={{ gridTemplateColumns: 'clamp(300px,430px,38%) 1fr' }}>

        {/* LEFT — call list */}
        <div className="border-r border-line overflow-y-auto [scrollbar-width:none]">
          {loading && (
            <div className="flex items-center justify-center py-16 text-[14px] text-dim">Loading calls…</div>
          )}

          {!loading && filtered.length === 0 && (
            <EmptyState filter={tab} businessPhone={businessPhone} />
          )}

          {!loading && filtered.map(call => {
            const score = call.intelligence_score
            const variant = outcomeToVariant(call.outcome, call.transferred)
            const label = outcomeLabel(call.outcome, call.transferred)
            const preview = call.intelligence_summary ?? call.summary ??
              (call.transcript ? call.transcript.slice(0, 80) : 'No transcript available')

            return (
              <CallListRow
                key={call.id}
                who={call.caller_name || call.caller_number || 'Unknown'}
                tag={{ variant, label }}
                preview={preview}
                time={timeAgo(call.created_at)}
                // Only pass a score when one actually exists — never show 0/10 for null scores
                score={typeof score === 'number' ? score : -1}
                duration={fmt(call.duration_seconds)}
                selected={selectedCall?.id === call.id}
                onClick={() => setSelectedCall(call)}
              />
            )
          })}
        </div>

        {/* RIGHT — detail pane */}
        <div className="overflow-hidden">
          {selectedCall ? (
            <DetailPanel key={selectedCall.id} call={selectedCall} />
          ) : (
            <NoSelection />
          )}
        </div>
      </div>
    </div>
  )
}
