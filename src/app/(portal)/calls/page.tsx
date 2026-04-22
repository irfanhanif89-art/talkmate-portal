'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

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

function outcomeBadge(outcome: string, transferred: boolean) {
  if (transferred || outcome === 'Transferred') return { bg: 'rgba(245,158,11,0.12)', color: '#f59e0b', label: 'Transferred' }
  if (!outcome || outcome === 'Missed') return { bg: 'rgba(239,68,68,0.12)', color: '#ef4444', label: 'Missed' }
  return { bg: 'rgba(34,197,94,0.12)', color: '#22c55e', label: outcome }
}

function TranscriptModal({ call, onClose }: { call: Call; onClose: () => void }) {
  const badge = outcomeBadge(call.outcome, call.transferred)

  // Parse transcript — could be plain string or JSON array of {role, message} objects
  let messages: Array<{ role: string; content: string }> = []
  if (call.transcript) {
    try {
      const parsed = JSON.parse(call.transcript)
      if (Array.isArray(parsed)) {
        messages = parsed.map((m: { role?: string; content?: string; message?: string }) => ({
          role: m.role || 'unknown',
          content: m.content || m.message || ''
        }))
      }
    } catch {
      // Plain text transcript — split into lines
      messages = call.transcript.split('\n').filter(Boolean).map(line => {
        const isAI = line.toLowerCase().startsWith('ai:') || line.toLowerCase().startsWith('assistant:') || line.toLowerCase().startsWith('aaron:')
        return { role: isAI ? 'assistant' : 'user', content: line.replace(/^(ai|assistant|aaron|user|caller):\s*/i, '') }
      })
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
      onClick={onClose}>
      <div style={{ background: '#0A1E38', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 20, width: '100%', maxWidth: 680, maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ padding: '20px 24px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'white', marginBottom: 4 }}>
              📞 {call.caller_name || call.caller_number || 'Unknown caller'}
            </div>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', fontSize: 13, color: '#4A7FBB' }}>
              <span>{new Date(call.created_at).toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' })}</span>
              <span>·</span>
              <span>{fmt(call.duration_seconds)}</span>
              <span>·</span>
              <span style={{ color: badge.color, fontWeight: 600 }}>{badge.label}</span>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.08)', border: 'none', color: 'white', width: 32, height: 32, borderRadius: '50%', cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
        </div>

        {/* Summary */}
        {call.summary && (
          <div style={{ padding: '16px 24px', background: 'rgba(74,159,232,0.06)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#4A7FBB', marginBottom: 6 }}>AI Summary</div>
            <p style={{ fontSize: 14, color: '#7BAED4', lineHeight: 1.6 }}>{call.summary}</p>
          </div>
        )}

        {/* Recording */}
        {call.recording_url && (
          <div style={{ padding: '12px 24px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#4A7FBB', marginBottom: 8 }}>Recording</div>
            <audio controls style={{ width: '100%', height: 36 }} src={call.recording_url} />
          </div>
        )}

        {/* Transcript */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px' }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#4A7FBB', marginBottom: 16 }}>
            {messages.length > 0 ? 'Transcript' : 'No transcript available'}
          </div>
          {messages.length === 0 && !call.transcript && (
            <div style={{ textAlign: 'center', padding: '32px 0', color: '#4A7FBB', fontSize: 14 }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>📋</div>
              <p>Transcript not available for this call.</p>
              <p style={{ fontSize: 12, marginTop: 6 }}>Transcripts are saved automatically for all new calls.</p>
            </div>
          )}
          {messages.length > 0 && messages.map((msg, i) => {
            const isAI = msg.role === 'assistant' || msg.role === 'bot'
            return (
              <div key={i} style={{ display: 'flex', gap: 12, marginBottom: 14, flexDirection: isAI ? 'row' : 'row-reverse' }}>
                <div style={{ width: 28, height: 28, borderRadius: '50%', background: isAI ? '#E8622A' : 'rgba(74,159,232,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, flexShrink: 0, color: 'white', fontWeight: 700 }}>
                  {isAI ? 'AI' : '👤'}
                </div>
                <div style={{ maxWidth: '75%', padding: '10px 14px', borderRadius: isAI ? '4px 14px 14px 14px' : '14px 4px 14px 14px', background: isAI ? 'rgba(232,98,42,0.1)' : 'rgba(74,159,232,0.1)', border: `1px solid ${isAI ? 'rgba(232,98,42,0.2)' : 'rgba(74,159,232,0.2)'}` }}>
                  <p style={{ fontSize: 14, color: 'white', lineHeight: 1.6, margin: 0 }}>{msg.content}</p>
                </div>
              </div>
            )
          })}
          {/* If transcript is plain text with no parsing */}
          {messages.length === 0 && call.transcript && (
            <pre style={{ fontSize: 13, color: '#7BAED4', lineHeight: 1.8, whiteSpace: 'pre-wrap', fontFamily: 'Outfit, sans-serif' }}>{call.transcript}</pre>
          )}
        </div>
      </div>
    </div>
  )
}

const OUTCOMES = ['All', 'Resolved', 'Transferred', 'Missed']

export default function CallsPage() {
  const supabase = createClient()
  const [calls, setCalls] = useState<Call[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('All')
  const [search, setSearch] = useState('')
  const [selectedCall, setSelectedCall] = useState<Call | null>(null)
  const [businessId, setBusinessId] = useState('')
  const [businessPhone, setBusinessPhone] = useState('')
  const [copied, setCopied] = useState(false)
  const [expandedCallId, setExpandedCallId] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: biz } = await supabase.from('businesses').select('id, phone').eq('owner_user_id', user.id).single()
      if (!biz) return
      setBusinessId(biz.id)
      setBusinessPhone((biz as Record<string, string>).phone || '')
      const { data } = await supabase.from('calls').select('*').eq('business_id', biz.id).order('created_at', { ascending: false }).limit(100)
      setCalls(data || [])
      setLoading(false)
    }
    load()
  }, [])

  const filtered = calls.filter(c => {
    if (filter === 'Resolved' && (c.transferred || !c.outcome || c.outcome === 'Missed')) return false
    if (filter === 'Transferred' && !c.transferred) return false
    if (filter === 'Missed' && c.outcome !== 'Missed') return false
    if (search && !c.caller_number?.includes(search) && !(c.caller_name || '').toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const inp = { background: '#071829', border: '1px solid rgba(255,255,255,0.1)', color: 'white', borderRadius: 10, padding: '10px 14px', fontFamily: 'Outfit,sans-serif', fontSize: 14, outline: 'none' } as React.CSSProperties

  return (
    <div style={{ padding: 32, maxWidth: 1000, margin: '0 auto' }}>
      {selectedCall && <TranscriptModal call={selectedCall} onClose={() => setSelectedCall(null)} />}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'white', marginBottom: 4 }}>Call Log</h1>
          <p style={{ fontSize: 13, color: '#4A7FBB' }}>{calls.length} total calls · Click any call to view transcript</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e' }} />
          <span style={{ fontSize: 13, color: '#22c55e', fontWeight: 600 }}>Live</span>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by number or name..." style={{ ...inp, width: 260 }} />
        <div style={{ display: 'flex', gap: 6 }}>
          {OUTCOMES.map(o => (
            <button key={o} onClick={() => setFilter(o)} style={{ padding: '9px 16px', borderRadius: 10, border: 'none', fontFamily: 'Outfit,sans-serif', fontSize: 13, fontWeight: 600, cursor: 'pointer', background: filter === o ? '#E8622A' : 'rgba(255,255,255,0.06)', color: filter === o ? 'white' : '#4A7FBB' }}>{o}</button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div style={{ background: '#0A1E38', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 16, overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 140px 100px 90px 80px 120px 36px', gap: 0, padding: '12px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          {['Caller', 'Date & Time', 'Duration', 'Revenue', 'Outcome', 'Transferred', ''].map(h => (
            <div key={h} style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.06em', color: '#4A7FBB' }}>{h}</div>
          ))}
        </div>

        {loading && (
          <div style={{ textAlign: 'center', padding: '48px 0', color: '#4A7FBB', fontSize: 14 }}>Loading calls...</div>
        )}

        {!loading && filtered.length === 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 20px', textAlign: 'center' }}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#E8622A" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: 16 }}>
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 15a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 4.23h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 11a16 16 0 0 0 6 6l.92-.92a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>
            </svg>
            <h3 style={{ fontSize: 16, fontWeight: 600, color: 'white', margin: '0 0 8px' }}>Your agent is live and ready</h3>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', margin: '0 0 20px', maxWidth: 360 }}>Make a test call to your TalkMate number to see your first call appear here.</p>
            <button
              onClick={async () => {
                const num = businessPhone || '+61 1800 TALK'
                await navigator.clipboard.writeText(num)
                setCopied(true)
                setTimeout(() => setCopied(false), 2000)
              }}
              style={{ background: '#E8622A', color: 'white', border: 'none', padding: '12px 24px', borderRadius: 9, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'Outfit,sans-serif' }}
            >
              {copied ? 'Copied! ✓' : 'Copy your TalkMate number'}
            </button>
          </div>
        )}

        {filtered.map((call, i) => {
          const badge = outcomeBadge(call.outcome, call.transferred)
          const isExpanded = expandedCallId === call.id
          return (
            <div key={call.id}>
              <div
                style={{ display: 'grid', gridTemplateColumns: '1fr 140px 100px 90px 80px 120px 36px', gap: 0, padding: '14px 20px', borderBottom: (!isExpanded && i < filtered.length - 1) ? '1px solid rgba(255,255,255,0.04)' : 'none', cursor: 'pointer', transition: 'background 0.1s' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.03)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                onClick={() => setSelectedCall(call)}
              >
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'white', marginBottom: 2 }}>{call.caller_name || call.caller_number || 'Unknown'}</div>
                  {call.caller_name && <div style={{ fontSize: 12, color: '#4A7FBB' }}>{call.caller_number}</div>}
                </div>
                <div style={{ fontSize: 13, color: '#7BAED4', display: 'flex', alignItems: 'center' }}>
                  <div>
                    <div>{new Date(call.created_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}</div>
                    <div style={{ fontSize: 12, color: '#4A7FBB' }}>{timeAgo(call.created_at)}</div>
                  </div>
                </div>
                <div style={{ fontSize: 13, color: '#7BAED4', display: 'flex', alignItems: 'center' }}>{fmt(call.duration_seconds)}</div>
                {/* Revenue column — TODO: link to jobs table when call_id FK is available */}
                <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.3)', display: 'flex', alignItems: 'center' }}>—</div>
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <span style={{ fontSize: 12, fontWeight: 600, padding: '3px 10px', borderRadius: 99, background: badge.bg, color: badge.color, whiteSpace: 'nowrap' as const }}>{badge.label}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', fontSize: 13, color: call.transferred ? '#F59E0B' : '#4A7FBB' }}>
                  {call.transferred ? '✅ Yes' : '—'}
                </div>
                {/* Inline expand chevron */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <button
                    onClick={e => { e.stopPropagation(); setExpandedCallId(isExpanded ? null : call.id) }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.3)', padding: '4px', display: 'flex', alignItems: 'center' }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      {isExpanded ? <polyline points="18,15 12,9 6,15"/> : <polyline points="6,9 12,15 18,9"/>}
                    </svg>
                  </button>
                </div>
              </div>
              {/* Inline transcript preview */}
              {isExpanded && (
                <div style={{ padding: '0 20px 14px', borderBottom: i < filtered.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
                  <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: '12px 14px' }}>
                    <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)', lineHeight: 1.65, margin: '0 0 8px' }}>
                      {call.transcript
                        ? call.transcript.slice(0, 200) + (call.transcript.length > 200 ? '...' : '')
                        : 'Transcript not available for this call.'}
                    </p>
                    {call.transcript && (
                      <span
                        onClick={e => { e.stopPropagation(); setSelectedCall(call) }}
                        style={{ fontSize: 12, color: '#4A9FE8', cursor: 'pointer' }}
                      >
                        View full transcript →
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
