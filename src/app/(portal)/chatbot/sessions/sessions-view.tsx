'use client'

// Chatbot conversations log + transcript drawer (Sprint features 2).
//
// Lists sessions from GET /api/chatbot/sessions with date-range + lead-only
// filters and 20-per-page pagination. Clicking a row opens a transcript
// drawer that fetches GET /api/chatbot/sessions/{id}. Dark-navy inline styling.

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { MessageSquare, X, ChevronLeft, ChevronRight, Sparkles } from 'lucide-react'

const ORANGE = '#E8622A'
const PAGE_SIZE = 20

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

interface TranscriptMessage {
  role: string
  content: string
  createdAt: string
}

function fmtDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' }) +
    ' ' + d.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })
}

function statusBadge(status: string): { bg: string; color: string; label: string } {
  const s = (status || '').toLowerCase()
  if (s === 'active' || s === 'open') return { bg: 'rgba(74,159,232,0.15)', color: '#4A9FE8', label: 'Active' }
  if (s === 'ended' || s === 'closed') return { bg: 'rgba(255,255,255,0.08)', color: '#7BAED4', label: 'Ended' }
  return { bg: 'rgba(255,255,255,0.08)', color: '#7BAED4', label: status || 'Ended' }
}

const cellStyle: React.CSSProperties = { padding: '12px 14px', fontSize: 13, color: '#C8D8EA', textAlign: 'left' }
const headStyle: React.CSSProperties = {
  padding: '10px 14px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
  letterSpacing: '0.05em', color: '#7BAED4', textAlign: 'left',
}

// ─────────────────────── transcript drawer ───────────────────────

function TranscriptDrawer({ sessionId, onClose }: { sessionId: string; onClose: () => void }) {
  const [messages, setMessages] = useState<TranscriptMessage[]>([])
  const [meta, setMeta] = useState<SessionRow | null>(null)
  const [loading, setLoading] = useState(true)

  // The drawer is conditionally mounted per sessionId, so initial loading=true
  // covers the first paint; no synchronous setState needed in the effect body.
  useEffect(() => {
    let cancelled = false
    fetch(`/api/chatbot/sessions/${sessionId}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (cancelled || !d?.ok) return
        setMessages(d.messages ?? [])
        setMeta(d.session ?? null)
      })
      .catch(() => { /* silent */ })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [sessionId])

  return (
    <>
      <div
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 60 }}
      />
      <aside style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, width: 'min(440px, 100vw)', zIndex: 70,
        background: '#0A1B2A', borderLeft: '1px solid rgba(255,255,255,0.1)',
        display: 'flex', flexDirection: 'column', fontFamily: 'Outfit, sans-serif',
      }}>
        <div style={{
          padding: '18px 20px', borderBottom: '1px solid rgba(255,255,255,0.08)',
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12,
        }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: 'white' }}>
              {meta?.leadName || 'Anonymous'}
            </div>
            <div style={{ fontSize: 12, color: '#7BAED4', marginTop: 3 }}>
              {meta ? fmtDate(meta.startedAt) : 'Loading...'}
            </div>
            {meta && (meta.leadPhone || meta.leadEmail) && (
              <div style={{ fontSize: 12, color: '#C8D8EA', marginTop: 4 }}>
                {[meta.leadPhone, meta.leadEmail].filter(Boolean).join(' · ')}
              </div>
            )}
          </div>
          <button
            type="button" onClick={onClose} aria-label="Close"
            style={{ background: 'transparent', border: 'none', color: '#7BAED4', cursor: 'pointer', padding: 4, display: 'flex', flexShrink: 0 }}
          >
            <X size={18} />
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: 18, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {loading ? (
            <div style={{ color: '#7BAED4', fontSize: 13, textAlign: 'center', paddingTop: 30 }}>Loading transcript...</div>
          ) : messages.length === 0 ? (
            <div style={{ color: '#7BAED4', fontSize: 13, textAlign: 'center', paddingTop: 30 }}>No messages in this conversation.</div>
          ) : (
            messages.map((m, i) => {
              const isUser = m.role === 'user'
              return (
                <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: isUser ? 'flex-end' : 'flex-start' }}>
                  {!isUser && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 3 }}>
                      <Sparkles size={11} color={ORANGE} />
                      <span style={{ fontSize: 10, color: '#7BAED4', fontWeight: 600 }}>Assistant</span>
                    </div>
                  )}
                  <div style={{
                    maxWidth: '85%', padding: '9px 12px', fontSize: 13, lineHeight: 1.45,
                    borderRadius: isUser ? '12px 12px 3px 12px' : '12px 12px 12px 3px',
                    background: isUser ? ORANGE : 'rgba(255,255,255,0.06)',
                    color: isUser ? 'white' : '#E8EFF6',
                  }}>
                    {m.content}
                  </div>
                </div>
              )
            })
          )}
        </div>
      </aside>
    </>
  )
}

// ─────────────────────── main ───────────────────────

export default function SessionsView() {
  const [sessions, setSessions] = useState<SessionRow[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)

  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [leadOnly, setLeadOnly] = useState(false)

  const [openId, setOpenId] = useState<string | null>(null)

  // Fetch sessions for the current page + filters. All setState happens inside
  // the async chain, never synchronously in the effect body, so we satisfy the
  // react-hooks/set-state-in-effect rule. The leading setLoading lives in the
  // .then so the very first call is post-await.
  useEffect(() => {
    let cancelled = false
    const params = new URLSearchParams({ page: String(page) })
    if (leadOnly) params.set('leadOnly', 'true')
    if (dateFrom) params.set('date_from', dateFrom)
    if (dateTo) params.set('date_to', dateTo)
    fetch(`/api/chatbot/sessions?${params.toString()}`)
      .then(r => (r.ok ? r.json() : null))
      .then((d: { ok: boolean; sessions: SessionRow[]; total: number } | null) => {
        if (cancelled) return
        if (d?.ok) { setSessions(d.sessions ?? []); setTotal(d.total ?? 0) }
        else { setSessions([]); setTotal(0) }
      })
      .catch(() => { if (!cancelled) { setSessions([]); setTotal(0) } })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [page, leadOnly, dateFrom, dateTo])

  // Filter changes reset to page 1 via the handlers below (setPage), so no
  // separate effect is needed and we avoid a synchronous setState-in-effect.

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const filterInput: React.CSSProperties = {
    padding: '7px 10px', borderRadius: 8, fontSize: 12.5,
    background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.12)',
    color: 'white', fontFamily: 'inherit', outline: 'none',
  }

  return (
    <div style={{ padding: '28px 32px', maxWidth: 1100, margin: '0 auto', color: '#F1F5F9', fontFamily: 'Outfit, sans-serif' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 20 }}>
        <div style={{
          width: 44, height: 44, borderRadius: 12, background: 'rgba(232,98,42,0.12)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <MessageSquare size={22} color={ORANGE} />
        </div>
        <div style={{ flex: 1 }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: 'white', margin: 0 }}>Chatbot conversations</h1>
          <p style={{ fontSize: 13, color: '#7BAED4', marginTop: 4, marginBottom: 0 }}>
            Every chat your website chatbot has handled.{' '}
            <Link href="/chatbot" style={{ color: ORANGE, fontWeight: 600, textDecoration: 'none' }}>Back to Chatbot</Link>
          </p>
        </div>
      </div>

      {/* Filters */}
      <div style={{
        display: 'flex', alignItems: 'flex-end', gap: 14, flexWrap: 'wrap',
        marginBottom: 16, padding: '14px 16px', borderRadius: 12,
        background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
      }}>
        <div>
          <div style={{ fontSize: 11, color: '#7BAED4', marginBottom: 5, fontWeight: 600 }}>From</div>
          <input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPage(1) }} style={filterInput} />
        </div>
        <div>
          <div style={{ fontSize: 11, color: '#7BAED4', marginBottom: 5, fontWeight: 600 }}>To</div>
          <input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setPage(1) }} style={filterInput} />
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: '#C8D8EA', paddingBottom: 7 }}>
          <input type="checkbox" checked={leadOnly} onChange={e => { setLeadOnly(e.target.checked); setPage(1) }} style={{ accentColor: ORANGE, width: 15, height: 15 }} />
          Leads captured only
        </label>
        {(dateFrom || dateTo || leadOnly) && (
          <button
            type="button"
            onClick={() => { setDateFrom(''); setDateTo(''); setLeadOnly(false); setPage(1) }}
            style={{
              marginBottom: 4, background: 'transparent', border: '1px solid rgba(255,255,255,0.12)',
              color: '#7BAED4', padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600,
              cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Table */}
      <div style={{ borderRadius: 14, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.02)' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                <th style={headStyle}>Date</th>
                <th style={headStyle}>Lead name</th>
                <th style={headStyle}>Phone</th>
                <th style={headStyle}>Email</th>
                <th style={headStyle}>Messages</th>
                <th style={headStyle}>Status</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} style={{ ...cellStyle, textAlign: 'center', color: '#7BAED4', padding: 28 }}>Loading...</td></tr>
              ) : sessions.length === 0 ? (
                <tr><td colSpan={6} style={{ ...cellStyle, textAlign: 'center', color: '#7BAED4', padding: 28 }}>
                  No conversations found.
                </td></tr>
              ) : (
                sessions.map(s => {
                  const badge = statusBadge(s.status)
                  return (
                    <tr
                      key={s.id}
                      onClick={() => setOpenId(s.id)}
                      style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', cursor: 'pointer' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.03)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    >
                      <td style={cellStyle}>{fmtDate(s.startedAt)}</td>
                      <td style={{ ...cellStyle, color: 'white', fontWeight: 600 }}>{s.leadName || 'Anonymous'}</td>
                      <td style={cellStyle}>{s.leadPhone || '—'}</td>
                      <td style={cellStyle}>{s.leadEmail || '—'}</td>
                      <td style={cellStyle}>{s.messageCount}</td>
                      <td style={cellStyle}>
                        <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 9px', borderRadius: 99, background: badge.bg, color: badge.color }}>
                          {badge.label}
                        </span>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 14, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ fontSize: 12, color: '#7BAED4' }}>
          {total > 0
            ? `Showing ${(page - 1) * PAGE_SIZE + 1}-${Math.min(page * PAGE_SIZE, total)} of ${total}`
            : '0 conversations'}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            type="button"
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page <= 1}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600,
              background: 'transparent', border: '1px solid rgba(255,255,255,0.12)', color: '#C8D8EA',
              cursor: page <= 1 ? 'default' : 'pointer', opacity: page <= 1 ? 0.4 : 1, fontFamily: 'inherit',
            }}
          >
            <ChevronLeft size={14} /> Previous
          </button>
          <span style={{ fontSize: 12, color: '#7BAED4' }}>Page {page} of {totalPages}</span>
          <button
            type="button"
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600,
              background: 'transparent', border: '1px solid rgba(255,255,255,0.12)', color: '#C8D8EA',
              cursor: page >= totalPages ? 'default' : 'pointer', opacity: page >= totalPages ? 0.4 : 1, fontFamily: 'inherit',
            }}
          >
            Next <ChevronRight size={14} />
          </button>
        </div>
      </div>

      {openId && <TranscriptDrawer sessionId={openId} onClose={() => setOpenId(null)} />}
    </div>
  )
}
