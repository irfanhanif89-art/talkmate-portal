'use client'

// Email inbox pane — Session 3C. Self-contained: lists email threads, shows a
// thread with its messages, surfaces the queued AI draft (edit / send / regen /
// discard) and a manual reply box. Uses the /api/email/* routes.

import { useCallback, useEffect, useState } from 'react'

const ORANGE = '#E8622A'

interface ThreadListItem {
  id: string; from_email: string; from_name: string | null; subject: string | null
  last_message_preview: string | null; last_message_at: string | null; unread_count: number; status: string
}
interface Message {
  id: string; direction: 'inbound' | 'outbound'; from_name: string | null; from_email: string
  body_text: string | null; subject: string | null; status: string; sent_by: string; ai_drafted: boolean; created_at: string
}

function fmt(iso: string | null): string {
  if (!iso) return ''
  try { return new Date(iso).toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) } catch { return '' }
}

function withAdmin(path: string, adminClientId?: string | null): string {
  if (!adminClientId) return path
  const sep = path.includes('?') ? '&' : '?'
  return `${path}${sep}adminClientId=${encodeURIComponent(adminClientId)}`
}

export default function EmailInbox({ businessId, adminClientId }: { businessId: string; adminClientId?: string | null }) {
  void businessId
  const [narrow, setNarrow] = useState(false)
  useEffect(() => {
    const update = () => setNarrow(window.innerWidth < 700)
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])
  const [threads, setThreads] = useState<ThreadListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [loadingThread, setLoadingThread] = useState(false)
  const [draftBody, setDraftBody] = useState('')
  const [draftId, setDraftId] = useState<string | null>(null)
  const [reply, setReply] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const loadThreads = useCallback(async () => {
    try {
      const res = await fetch(withAdmin('/api/email/threads', adminClientId))
      const j = await res.json()
      if (j.ok) setThreads(j.threads)
    } catch { /* ignore */ }
    setLoading(false)
  }, [])

  useEffect(() => { loadThreads() }, [loadThreads])

  const openThread = useCallback(async (id: string) => {
    setSelected(id); setLoadingThread(true); setErr(null); setDraftBody(''); setDraftId(null); setReply('')
    try {
      const res = await fetch(withAdmin(`/api/email/threads/${id}`, adminClientId))
      const j = await res.json()
      if (j.ok) {
        setMessages(j.messages)
        const queued = (j.messages as Message[]).find((m) => m.status === 'queued' && m.ai_drafted)
        if (queued) { setDraftId(queued.id); setDraftBody(queued.body_text ?? '') }
        setThreads((prev) => prev.map((t) => t.id === id ? { ...t, unread_count: 0 } : t))
      }
    } catch { setErr('Could not load the conversation.') }
    setLoadingThread(false)
  }, [])

  async function generate() {
    if (!selected) return
    setBusy(true); setErr(null)
    try {
      const res = await fetch(withAdmin('/api/email/draft', adminClientId), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ threadId: selected }) })
      const j = await res.json()
      if (!res.ok || !j.ok) { setErr(j.error || 'Could not generate a draft.'); setBusy(false); return }
      setDraftId(j.draftId); setDraftBody(j.draftBody ?? '')
    } catch { setErr('Network error.') }
    setBusy(false)
  }

  async function sendDraft() {
    if (!draftId) return
    setBusy(true); setErr(null)
    try {
      const res = await fetch(withAdmin('/api/email/send', adminClientId), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messageId: draftId, body: draftBody }) })
      const j = await res.json()
      if (!res.ok || !j.ok) { setErr(j.error || 'Could not send.'); setBusy(false); return }
      setDraftId(null); setDraftBody('')
      await openThread(selected!)
    } catch { setErr('Network error.') }
    setBusy(false)
  }

  async function discardDraft() {
    if (!draftId) return
    setDraftId(null); setDraftBody('')
    // Soft-discard happens server-side on the next regenerate; nothing to call here.
  }

  async function sendManual() {
    if (!selected || !reply.trim()) return
    setBusy(true); setErr(null)
    try {
      const res = await fetch(withAdmin('/api/email/send', adminClientId), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ threadId: selected, body: reply.trim() }) })
      const j = await res.json()
      if (!res.ok || !j.ok) { setErr(j.error || 'Could not send.'); setBusy(false); return }
      setReply('')
      await openThread(selected)
    } catch { setErr('Network error.') }
    setBusy(false)
  }

  const panel: React.CSSProperties = { background: '#071829', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14 }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: narrow ? '1fr' : 'minmax(0, 320px) 1fr', gap: 16, minHeight: 480 }}>
      {/* Thread list */}
      <div style={{ ...panel, overflow: 'hidden', maxHeight: narrow ? 280 : 640, overflowY: 'auto', minWidth: 0 }}>
        {loading ? (
          <div style={{ padding: 18, color: '#7BAED4', fontSize: 13 }}>Loading...</div>
        ) : threads.length === 0 ? (
          <div style={{ padding: 18, color: '#7BAED4', fontSize: 13 }}>
            No emails yet. When customers email your TalkMate address, their messages will appear here.
          </div>
        ) : threads.map((t) => (
          <button key={t.id} onClick={() => openThread(t.id)}
            style={{
              display: 'block', width: '100%', textAlign: 'left', padding: '12px 14px', border: 'none',
              borderBottom: '1px solid rgba(255,255,255,0.04)', cursor: 'pointer',
              background: selected === t.id ? 'rgba(232,98,42,0.10)' : 'transparent', color: '#F1F5F9', fontFamily: 'Outfit,sans-serif',
            }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
              <span style={{ fontWeight: 700, fontSize: 14 }}>{t.from_name || t.from_email}</span>
              {t.unread_count > 0 && <span style={{ width: 8, height: 8, borderRadius: 4, background: ORANGE, flexShrink: 0, marginTop: 5 }} />}
            </div>
            <div style={{ fontSize: 12, color: '#C8D8EA', marginTop: 2 }}>{t.subject || 'No subject'}</div>
            <div style={{ fontSize: 12, color: '#7BAED4', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.last_message_preview ?? ''}</div>
            <div style={{ fontSize: 11, color: '#4A7FBB', marginTop: 2 }}>{fmt(t.last_message_at)}</div>
          </button>
        ))}
      </div>

      {/* Thread view */}
      <div style={{ ...panel, padding: 18, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {!selected ? (
          <div style={{ color: '#7BAED4', fontSize: 14, margin: 'auto' }}>Select an email to view the conversation.</div>
        ) : loadingThread ? (
          <div style={{ color: '#7BAED4', fontSize: 14, margin: 'auto' }}>Loading...</div>
        ) : (
          <>
            <div style={{ flex: 1, overflowY: 'auto', maxHeight: 360, marginBottom: 12 }}>
              {messages.filter((m) => m.status !== 'queued' && m.status !== 'discarded').map((m) => (
                <div key={m.id} style={{
                  background: m.direction === 'inbound' ? 'rgba(255,255,255,0.04)' : 'rgba(21,101,192,0.18)',
                  borderRadius: 10, padding: '10px 12px', marginBottom: 8,
                  marginLeft: m.direction === 'inbound' ? 0 : 40, marginRight: m.direction === 'inbound' ? 40 : 0,
                }}>
                  <div style={{ fontSize: 11, color: '#7BAED4', marginBottom: 4, display: 'flex', gap: 8 }}>
                    <span>{m.direction === 'inbound' ? (m.from_name || m.from_email) : 'You'}</span>
                    {m.sent_by === 'ai' && <span style={{ color: ORANGE, fontWeight: 700 }}>AI</span>}
                    <span style={{ marginLeft: 'auto' }}>{fmt(m.created_at)}</span>
                  </div>
                  <div style={{ fontSize: 13, color: '#F1F5F9', whiteSpace: 'pre-wrap' }}>{m.body_text}</div>
                </div>
              ))}
            </div>

            {draftId ? (
              <div style={{ background: 'rgba(232,98,42,0.06)', border: '1px solid rgba(232,98,42,0.25)', borderRadius: 12, padding: 14, marginBottom: 8 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'white', marginBottom: 8 }}>AI Draft Ready</div>
                <textarea value={draftBody} onChange={(e) => setDraftBody(e.target.value)} rows={6}
                  style={{ width: '100%', background: '#071829', border: '1px solid rgba(255,255,255,0.1)', color: 'white', borderRadius: 10, padding: 12, fontFamily: 'Outfit,sans-serif', fontSize: 13 }} />
                <div style={{ display: 'flex', gap: 10, marginTop: 10, alignItems: 'center' }}>
                  <button disabled={busy} onClick={sendDraft} style={{ background: ORANGE, color: 'white', border: 'none', padding: '9px 18px', borderRadius: 9, fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: 'Outfit,sans-serif' }}>Send Now</button>
                  <button disabled={busy} onClick={generate} style={{ background: 'transparent', color: '#C8D8EA', border: '1px solid rgba(255,255,255,0.18)', padding: '9px 14px', borderRadius: 9, fontSize: 14, cursor: 'pointer', fontFamily: 'Outfit,sans-serif' }}>Regenerate</button>
                  <button disabled={busy} onClick={discardDraft} style={{ background: 'none', color: '#7BAED4', border: 'none', fontSize: 13, cursor: 'pointer', fontFamily: 'Outfit,sans-serif' }}>Discard</button>
                </div>
              </div>
            ) : (
              <button disabled={busy} onClick={generate}
                style={{ alignSelf: 'flex-start', background: 'transparent', color: ORANGE, border: `1px solid ${ORANGE}`, padding: '9px 16px', borderRadius: 9, fontSize: 14, fontWeight: 600, cursor: 'pointer', marginBottom: 8, fontFamily: 'Outfit,sans-serif' }}>
                Generate AI Reply
              </button>
            )}

            <div style={{ display: 'flex', gap: 8 }}>
              <input value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Write a reply..."
                style={{ flex: 1, background: '#071829', border: '1px solid rgba(255,255,255,0.1)', color: 'white', borderRadius: 10, padding: '10px 12px', fontFamily: 'Outfit,sans-serif', fontSize: 13 }} />
              <button disabled={busy || !reply.trim()} onClick={sendManual}
                style={{ background: '#1565C0', color: 'white', border: 'none', padding: '0 18px', borderRadius: 10, fontWeight: 600, fontSize: 14, cursor: 'pointer', fontFamily: 'Outfit,sans-serif' }}>Send</button>
            </div>
            {err && <div style={{ marginTop: 10, fontSize: 13, color: '#EF4444' }}>{err}</div>}
          </>
        )}
      </div>
    </div>
  )
}
