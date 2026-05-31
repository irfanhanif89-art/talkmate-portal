'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from 'react'
import { Inbox as InboxIcon, MessageSquare, Sparkles, Send, Search, ChevronLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

export interface ConversationListItem {
  id: string
  phoneNumber: string
  contactId: string | null
  contactName: string | null
  lastMessageAt: string | null
  lastMessagePreview: string | null
  unreadCount: number
  status: string | null
}

interface ThreadMessage {
  id: string
  direction: 'inbound' | 'outbound'
  body: string
  status: string
  sentBy: string
  twilioSid: string | null
  readAt: string | null
  createdAt: string
}

interface ConvoDetail {
  id: string
  phoneNumber: string | null
  contactId: string | null
  contactName: string | null
  unreadCount: number
  status: string | null
  createdAt: string | null
}

interface Props {
  businessId: string
  businessName: string
  hasTwilioNumber: boolean
  initialConversations: ConversationListItem[]
  // When set, all API calls go to /api/sms/conversations?adminClientId=...
  // so admins can view/reply on behalf of a client.
  adminClientId?: string | null
}

function withAdmin(path: string, adminClientId: string | null | undefined): string {
  if (!adminClientId) return path
  const sep = path.includes('?') ? '&' : '?'
  return `${path}${sep}adminClientId=${encodeURIComponent(adminClientId)}`
}

const ORANGE = '#E8622A'
const NAVY = '#1565C0'
const SMS_SEGMENT = 160

function relTime(iso: string | null): string {
  if (!iso) return ''
  const now = Date.now()
  const then = new Date(iso).getTime()
  if (!Number.isFinite(then)) return ''
  const seconds = Math.max(0, Math.round((now - then) / 1000))
  if (seconds < 60) return 'just now'
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days}d ago`
  return new Date(iso).toLocaleDateString()
}

function dayKey(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function prettyDay(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })
}

function prettyTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

function displayName(convo: { contactName: string | null; phoneNumber: string }): string {
  return convo.contactName?.trim() || convo.phoneNumber
}

function sentByLabel(sentBy: string): { label: string; color: string } | null {
  switch (sentBy) {
    case 'winback': return { label: 'Win-back', color: '#E8622A' }
    case 'review_request': return { label: 'Review', color: '#22C55E' }
    case 'ai': return { label: 'AI', color: '#7C3AED' }
    case 'human': return null // implicit — operator-typed reply
    case 'vapi': return { label: 'Agent', color: '#4A9FE8' }
    case 'dispatch': return { label: 'Dispatch', color: '#0EA5E9' }
    case 'callback': return { label: 'Callback', color: '#F59E0B' }
    default: return null
  }
}

export default function InboxView(props: Props) {
  const [conversations, setConversations] = useState<ConversationListItem[]>(props.initialConversations)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [convo, setConvo] = useState<ConvoDetail | null>(null)
  const [messages, setMessages] = useState<ThreadMessage[]>([])
  const [loadingThread, setLoadingThread] = useState(false)
  const [reply, setReply] = useState('')
  const [sending, setSending] = useState(false)
  const [suggesting, setSuggesting] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  const [isMobile, setIsMobile] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement | null>(null)

  // Stash the conversation list ref so the realtime callback can read
  // the current value without re-subscribing each render.
  const selectedIdRef = useRef<string | null>(null)
  useEffect(() => { selectedIdRef.current = selectedId }, [selectedId])

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mq = window.matchMedia('(max-width: 767px)')
    const update = () => setIsMobile(mq.matches)
    update()
    if (mq.addEventListener) {
      mq.addEventListener('change', update)
      return () => mq.removeEventListener('change', update)
    }
    mq.addListener(update)
    return () => mq.removeListener(update)
  }, [])

  const adminClientId = props.adminClientId ?? null

  const refreshList = useCallback(async () => {
    try {
      const r = await fetch(withAdmin('/api/sms/conversations', adminClientId), { cache: 'no-store' })
      if (!r.ok) return
      const d = await r.json() as { conversations?: ConversationListItem[] }
      if (Array.isArray(d.conversations)) setConversations(d.conversations)
    } catch { /* silent */ }
  }, [adminClientId])

  const loadThread = useCallback(async (id: string) => {
    setLoadingThread(true)
    try {
      const r = await fetch(withAdmin(`/api/sms/conversations/${id}`, adminClientId), { cache: 'no-store' })
      if (!r.ok) {
        setConvo(null); setMessages([])
        return
      }
      const d = await r.json() as { conversation: ConvoDetail; messages: ThreadMessage[] }
      setConvo(d.conversation)
      setMessages(d.messages)
      // Mark read in background.
      void fetch(withAdmin(`/api/sms/conversations/${id}`, adminClientId), { method: 'PATCH' }).then(() => {
        setConversations(prev => prev.map(c => c.id === id ? { ...c, unreadCount: 0 } : c))
      }).catch(() => {})
    } catch {
      setConvo(null); setMessages([])
    } finally {
      setLoadingThread(false)
    }
  }, [adminClientId])

  useEffect(() => {
    if (!selectedId) { setConvo(null); setMessages([]); return }
    void loadThread(selectedId)
  }, [selectedId, loadThread])

  // Auto-scroll on new message.
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages.length])

  // Realtime: subscribe to sms_messages so new inbound messages appear
  // instantly in the open thread AND the conversation list re-fetches.
  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel('inbox-live')
      .on(
        'postgres_changes',
        // Tenant filter: only this business's rows. Without it every
        // client's browser receives every other client's message events
        // (matches the dashboard realtime pattern in dashboard-client.tsx).
        { event: 'INSERT', schema: 'public', table: 'sms_messages', filter: `business_id=eq.${props.businessId}` },
        (payload) => {
          const row = payload.new as Partial<ThreadMessage> & { conversation_id?: string }
          // Refresh the list summary regardless of which thread is open.
          void refreshList()
          if (row.conversation_id === selectedIdRef.current && row.id) {
            setMessages(prev => {
              if (prev.some(m => m.id === row.id)) return prev
              return [...prev, {
                id: row.id as string,
                direction: (row.direction as 'inbound' | 'outbound') ?? 'inbound',
                body: row.body ?? '',
                status: row.status ?? 'received',
                sentBy: row.sentBy ?? 'system',
                twilioSid: row.twilioSid ?? null,
                readAt: row.readAt ?? null,
                createdAt: row.createdAt ?? new Date().toISOString(),
              }]
            })
          }
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'sms_conversations', filter: `business_id=eq.${props.businessId}` },
        () => { void refreshList() },
      )
      .subscribe()
    return () => { void supabase.removeChannel(channel) }
  }, [refreshList, props.businessId])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return conversations
    return conversations.filter(c =>
      (c.contactName ?? '').toLowerCase().includes(q) ||
      c.phoneNumber.toLowerCase().includes(q),
    )
  }, [search, conversations])

  const totalUnread = useMemo(
    () => conversations.reduce((s, c) => s + (c.unreadCount ?? 0), 0),
    [conversations],
  )

  async function handleSend() {
    if (!selectedId || !reply.trim() || sending) return
    setSending(true)
    setSendError(null)
    try {
      const r = await fetch(withAdmin(`/api/sms/conversations/${selectedId}`, adminClientId), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: reply.trim() }),
      })
      const d = await r.json().catch(() => ({} as Record<string, unknown>))
      if (!r.ok) {
        setSendError(typeof d.detail === 'string' ? d.detail : 'Send failed')
        return
      }
      setReply('')
      // Optimistic: realtime will deliver the row, but reload thread
      // immediately so the operator sees their own message instantly.
      void loadThread(selectedId)
      void refreshList()
    } catch (e) {
      setSendError((e as Error).message)
    } finally {
      setSending(false)
    }
  }

  async function handleSuggest() {
    if (!selectedId || suggesting) return
    setSuggesting(true)
    try {
      const r = await fetch(withAdmin(`/api/sms/conversations/${selectedId}/suggest`, adminClientId), { method: 'POST' })
      const d = await r.json().catch(() => ({} as Record<string, unknown>))
      if (r.ok && typeof d.suggestion === 'string') {
        setReply(d.suggestion)
      } else {
        setSendError(typeof d.detail === 'string' ? d.detail : 'AI suggest failed')
      }
    } catch (e) {
      setSendError((e as Error).message)
    } finally {
      setSuggesting(false)
    }
  }

  const segments = reply.length === 0 ? 0 : Math.ceil(reply.length / SMS_SEGMENT)

  // ───────── render ─────────

  const showList = !isMobile || !selectedId
  const showThread = !isMobile || Boolean(selectedId)

  return (
    <div style={{
      display: 'flex', height: 'calc(100vh - 0px)',
      background: '#0A1628', color: '#F1F5F9',
      fontFamily: 'Outfit, sans-serif',
    }}>
      {showList && (
        <aside style={{
          width: isMobile ? '100%' : 340,
          borderRight: isMobile ? 'none' : '1px solid rgba(255,255,255,0.06)',
          display: 'flex', flexDirection: 'column',
          background: '#071829',
        }}>
          <div style={{ padding: '20px 18px 12px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <h1 style={{ fontSize: 18, fontWeight: 800, color: 'white', margin: 0 }}>Inbox</h1>
              {totalUnread > 0 && (
                <span style={{
                  fontSize: 11, fontWeight: 800,
                  padding: '2px 8px', borderRadius: 99,
                  background: ORANGE, color: 'white',
                }}>{totalUnread > 99 ? '99+' : totalUnread}</span>
              )}
            </div>
            <div style={{ position: 'relative' }}>
              <Search size={14} style={{ position: 'absolute', left: 10, top: 9, color: '#4A7FBB' }} />
              <input
                type="search"
                placeholder="Search name or number"
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={{
                  width: '100%', padding: '8px 10px 8px 30px',
                  borderRadius: 8, border: '1px solid rgba(255,255,255,0.08)',
                  background: 'rgba(255,255,255,0.04)', color: '#F1F5F9',
                  fontSize: 13, fontFamily: 'inherit', outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
            </div>
          </div>

          <div style={{ flex: 1, overflowY: 'auto' }}>
            {filtered.length === 0 ? (
              <div style={{ padding: 40, textAlign: 'center', color: '#4A7FBB' }}>
                <MessageSquare size={36} style={{ opacity: 0.6, marginBottom: 12 }} />
                <div style={{ fontSize: 14, fontWeight: 600, color: '#7BAED4', marginBottom: 6 }}>
                  {conversations.length === 0 ? 'No messages yet' : 'No matches'}
                </div>
                <div style={{ fontSize: 12, color: '#4A7FBB', maxWidth: 240, margin: '0 auto', lineHeight: 1.5 }}>
                  {conversations.length === 0
                    ? 'When customers text your TalkMate number, their messages will appear here.'
                    : 'Try a different name or phone number.'}
                </div>
              </div>
            ) : (
              filtered.map(c => {
                const active = c.id === selectedId
                const unread = c.unreadCount > 0
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setSelectedId(c.id)}
                    style={{
                      width: '100%', textAlign: 'left',
                      display: 'flex', gap: 10, alignItems: 'flex-start',
                      padding: '12px 16px',
                      border: 'none',
                      background: active ? 'rgba(232,98,42,0.10)' : 'transparent',
                      borderLeft: active ? `3px solid ${ORANGE}` : '3px solid transparent',
                      cursor: 'pointer', color: 'inherit',
                      fontFamily: 'inherit',
                      transition: 'background 120ms',
                    }}
                  >
                    <div style={{
                      width: 7, height: 7, borderRadius: '50%',
                      background: unread ? ORANGE : 'transparent',
                      marginTop: 8, flexShrink: 0,
                    }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
                        <span style={{
                          fontSize: 13, fontWeight: unread ? 700 : 500,
                          color: 'white',
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>
                          {displayName(c)}
                        </span>
                        <span style={{ fontSize: 10, color: '#4A7FBB', flexShrink: 0 }}>
                          {relTime(c.lastMessageAt)}
                        </span>
                      </div>
                      <div style={{
                        fontSize: 12, color: unread ? '#C8D8EA' : '#7BAED4',
                        marginTop: 2,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {c.lastMessagePreview ?? 'No preview'}
                      </div>
                    </div>
                  </button>
                )
              })
            )}
          </div>
        </aside>
      )}

      {showThread && (
        <main style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          {!selectedId ? (
            <div style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              height: '100%', color: '#4A7FBB', padding: 40, textAlign: 'center',
            }}>
              <InboxIcon size={48} style={{ opacity: 0.4, marginBottom: 16 }} />
              <div style={{ fontSize: 15, fontWeight: 600, color: '#7BAED4', marginBottom: 6 }}>
                Select a conversation
              </div>
              <div style={{ fontSize: 13, color: '#4A7FBB' }}>
                Pick a thread on the left to view messages.
              </div>
            </div>
          ) : (
            <>
              {/* Header */}
              <div style={{
                padding: '14px 22px',
                borderBottom: '1px solid rgba(255,255,255,0.06)',
                display: 'flex', alignItems: 'center', gap: 12,
                background: '#071829',
              }}>
                {isMobile && (
                  <button
                    type="button"
                    onClick={() => setSelectedId(null)}
                    aria-label="Back to list"
                    style={{
                      background: 'transparent', border: 'none', color: '#7BAED4',
                      cursor: 'pointer', display: 'flex', alignItems: 'center',
                    }}
                  >
                    <ChevronLeft size={20} />
                  </button>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: 'white' }}>
                    {convo ? displayName({ contactName: convo.contactName, phoneNumber: convo.phoneNumber ?? '' }) : 'Loading...'}
                  </div>
                  <div style={{ fontSize: 11, color: '#4A7FBB', marginTop: 2 }}>
                    {convo?.phoneNumber ?? ''}
                  </div>
                </div>
                {convo?.contactId && (
                  <a
                    href={`/contacts/${convo.contactId}`}
                    style={{
                      fontSize: 12, color: '#4A9FE8', textDecoration: 'none',
                      padding: '6px 10px', borderRadius: 6,
                      border: '1px solid rgba(74,159,232,0.3)',
                    }}
                  >
                    View contact
                  </a>
                )}
              </div>

              {/* Thread */}
              <div style={{ flex: 1, overflowY: 'auto', padding: 22, display: 'flex', flexDirection: 'column', gap: 10 }}>
                {loadingThread && messages.length === 0 ? (
                  <div style={{ textAlign: 'center', color: '#4A7FBB', padding: 40 }}>Loading messages...</div>
                ) : messages.length === 0 ? (
                  <div style={{ textAlign: 'center', color: '#4A7FBB', padding: 40 }}>No messages yet.</div>
                ) : (
                  (() => {
                    const blocks: ReactElement[] = []
                    let lastDay = ''
                    for (const m of messages) {
                      const k = dayKey(m.createdAt)
                      if (k !== lastDay) {
                        lastDay = k
                        blocks.push(
                          <div key={`day-${k}`} style={{
                            alignSelf: 'center', fontSize: 10, fontWeight: 700,
                            color: '#4A7FBB', letterSpacing: '0.08em',
                            textTransform: 'uppercase', padding: '8px 0',
                          }}>
                            {prettyDay(m.createdAt)}
                          </div>,
                        )
                      }
                      const outbound = m.direction === 'outbound'
                      const badge = sentByLabel(m.sentBy)
                      blocks.push(
                        <div
                          key={m.id}
                          style={{
                            alignSelf: outbound ? 'flex-end' : 'flex-start',
                            maxWidth: '72%',
                            display: 'flex', flexDirection: 'column',
                            gap: 4,
                            alignItems: outbound ? 'flex-end' : 'flex-start',
                          }}
                        >
                          <div style={{
                            padding: '10px 14px',
                            borderRadius: outbound ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                            background: outbound ? NAVY : 'rgba(255,255,255,0.06)',
                            color: outbound ? 'white' : '#F1F5F9',
                            fontSize: 14, lineHeight: 1.45,
                            wordBreak: 'break-word', whiteSpace: 'pre-wrap',
                          }}>
                            {m.body}
                          </div>
                          <div style={{
                            display: 'flex', alignItems: 'center', gap: 8,
                            fontSize: 10, color: '#4A7FBB',
                          }}>
                            <span>{prettyTime(m.createdAt)}</span>
                            {outbound && m.status && (
                              <span style={{ textTransform: 'capitalize' }}>{m.status}</span>
                            )}
                            {badge && (
                              <span style={{
                                fontSize: 9, fontWeight: 700, padding: '1px 6px',
                                borderRadius: 4, background: `${badge.color}22`, color: badge.color,
                                textTransform: 'uppercase', letterSpacing: '0.05em',
                              }}>
                                {badge.label}
                              </span>
                            )}
                          </div>
                        </div>,
                      )
                    }
                    return blocks
                  })()
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Composer */}
              <div style={{
                borderTop: '1px solid rgba(255,255,255,0.06)',
                padding: 14, background: '#071829',
              }}>
                {!props.hasTwilioNumber && (
                  <div style={{
                    fontSize: 12, color: '#FBBF24',
                    background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.2)',
                    borderRadius: 8, padding: '8px 10px', marginBottom: 10,
                  }}>
                    No Twilio number configured for {props.businessName}. Outbound replies will use the default TalkMate number — ask your admin to set your own.
                  </div>
                )}
                <textarea
                  value={reply}
                  onChange={e => setReply(e.target.value)}
                  placeholder="Type your reply..."
                  rows={3}
                  style={{
                    width: '100%', padding: '10px 12px',
                    borderRadius: 8, border: '1px solid rgba(255,255,255,0.08)',
                    background: 'rgba(255,255,255,0.04)', color: '#F1F5F9',
                    fontSize: 14, fontFamily: 'inherit', resize: 'vertical',
                    boxSizing: 'border-box', outline: 'none',
                    minHeight: 80,
                  }}
                />
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 11, color: '#4A7FBB' }}>
                    {reply.length} / {SMS_SEGMENT}
                    {segments > 1 ? ` (${segments} segments)` : ''}
                  </span>
                  {sendError && (
                    <span style={{ fontSize: 11, color: '#EF4444' }}>{sendError}</span>
                  )}
                  <div style={{ flex: 1 }} />
                  <button
                    type="button"
                    onClick={handleSuggest}
                    disabled={suggesting}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      padding: '8px 14px', borderRadius: 8,
                      background: 'rgba(124,58,237,0.12)', color: '#A78BFA',
                      border: '1px solid rgba(124,58,237,0.3)',
                      fontSize: 12, fontWeight: 600, cursor: 'pointer',
                      fontFamily: 'inherit',
                      opacity: suggesting ? 0.6 : 1,
                    }}
                  >
                    <Sparkles size={13} /> {suggesting ? 'Drafting...' : 'AI Suggest'}
                  </button>
                  <button
                    type="button"
                    onClick={handleSend}
                    disabled={!reply.trim() || sending}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      padding: '8px 18px', borderRadius: 8,
                      background: ORANGE, color: 'white', border: 'none',
                      fontSize: 13, fontWeight: 700, cursor: 'pointer',
                      fontFamily: 'inherit',
                      opacity: !reply.trim() || sending ? 0.5 : 1,
                    }}
                  >
                    <Send size={13} /> {sending ? 'Sending...' : 'Send'}
                  </button>
                </div>
              </div>
            </>
          )}
        </main>
      )}
    </div>
  )
}
