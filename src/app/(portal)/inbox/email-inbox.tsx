'use client'

// Email inbox pane — Session 3C. Self-contained: lists email threads, shows a
// thread with its messages, surfaces the queued AI draft (edit / send / regen /
// discard) and a manual reply box. Uses the /api/email/* routes.
// Styling uses design-system tokens so it adapts to dark/light.

import { useCallback, useEffect, useState } from 'react'

interface ThreadListItem {
  id: string; from_email: string; from_name: string | null; subject: string | null
  last_message_preview: string | null; last_message_at: string | null; unread_count: number; status: string
}
interface Message {
  id: string; direction: 'inbound' | 'outbound'; from_name: string | null; from_email: string
  body_text: string | null; subject: string | null; status: string; sent_by: string; ai_drafted: boolean; created_at: string
}

const fieldCls =
  'w-full rounded-[10px] border border-[var(--line-strong)] bg-card-2 px-3 py-2.5 ' +
  'text-[13px] text-text font-sans outline-none transition-colors ' +
  'focus:border-orange focus:shadow-[0_0_0_3px_rgba(238,106,44,.15)]'

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
  }, [adminClientId])

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
  }, [adminClientId])

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

  return (
    <div className="grid gap-4" style={{ gridTemplateColumns: narrow ? '1fr' : 'minmax(0, 320px) 1fr', minHeight: 480 }}>
      {/* Thread list */}
      <div
        className="overflow-y-auto rounded-[14px] border border-line bg-card"
        style={{ maxHeight: narrow ? 280 : 640, minWidth: 0 }}
      >
        {loading ? (
          <div className="p-[18px] text-[13px] text-dim">Loading…</div>
        ) : threads.length === 0 ? (
          <div className="p-[18px] text-[13px] text-dim">
            No emails yet. When customers email your TalkMate address, their messages will appear here.
          </div>
        ) : threads.map((t) => (
          <button
            key={t.id}
            onClick={() => openThread(t.id)}
            className={[
              'block w-full border-b border-line px-3.5 py-3 text-left text-text transition',
              selected === t.id ? 'bg-orange/10' : 'hover:bg-white/[.03]',
            ].join(' ')}
          >
            <div className="flex justify-between gap-2">
              <span className="text-[14px] font-bold">{t.from_name || t.from_email}</span>
              {t.unread_count > 0 && <span className="mt-[5px] h-2 w-2 shrink-0 rounded-full bg-orange" />}
            </div>
            <div className="mt-0.5 text-[12px] text-dim">{t.subject || 'No subject'}</div>
            <div className="mt-0.5 truncate text-[12px] text-dim">{t.last_message_preview ?? ''}</div>
            <div className="mt-0.5 text-[11px] text-faint">{fmt(t.last_message_at)}</div>
          </button>
        ))}
      </div>

      {/* Thread view */}
      <div className="flex min-w-0 flex-col rounded-[14px] border border-line bg-card p-[18px]">
        {!selected ? (
          <div className="m-auto text-[14px] text-dim">Select an email to view the conversation.</div>
        ) : loadingThread ? (
          <div className="m-auto text-[14px] text-dim">Loading…</div>
        ) : (
          <>
            <div className="mb-3 flex-1 overflow-y-auto" style={{ maxHeight: 360 }}>
              {messages.filter((m) => m.status !== 'queued' && m.status !== 'discarded').map((m) => (
                <div
                  key={m.id}
                  className={[
                    'mb-2 rounded-[10px] px-3 py-2.5',
                    m.direction === 'inbound' ? 'bg-card-2 mr-10' : 'bg-blue/[.16] ml-10',
                  ].join(' ')}
                >
                  <div className="mb-1 flex gap-2 text-[11px] text-dim">
                    <span>{m.direction === 'inbound' ? (m.from_name || m.from_email) : 'You'}</span>
                    {m.sent_by === 'ai' && <span className="font-bold text-orange">AI</span>}
                    <span className="ml-auto">{fmt(m.created_at)}</span>
                  </div>
                  <div className="whitespace-pre-wrap text-[13px] text-text">{m.body_text}</div>
                </div>
              ))}
            </div>

            {draftId ? (
              <div className="mb-2 rounded-[12px] border border-orange/25 bg-orange/[.06] p-3.5">
                <div className="mb-2 text-[13px] font-bold text-text">AI Draft Ready</div>
                <textarea value={draftBody} onChange={(e) => setDraftBody(e.target.value)} rows={6} className={fieldCls + ' resize-y'} />
                <div className="mt-2.5 flex items-center gap-2.5">
                  <button disabled={busy} onClick={sendDraft} className="rounded-[9px] bg-[linear-gradient(135deg,#f58a42,#e86526)] px-[18px] py-2.5 text-[14px] font-bold text-white shadow-[0_4px_14px_rgba(238,106,44,.35)] disabled:opacity-50">Send Now</button>
                  <button disabled={busy} onClick={generate} className="rounded-[9px] border border-line-strong px-3.5 py-2.5 text-[14px] text-dim transition hover:text-text disabled:opacity-50">Regenerate</button>
                  <button disabled={busy} onClick={discardDraft} className="text-[13px] text-dim transition hover:text-text disabled:opacity-50">Discard</button>
                </div>
              </div>
            ) : (
              <button disabled={busy} onClick={generate} className="mb-2 self-start rounded-[9px] border border-orange px-4 py-2.5 text-[14px] font-semibold text-orange transition hover:bg-orange/[.08] disabled:opacity-50">
                Generate AI Reply
              </button>
            )}

            <div className="flex gap-2">
              <input value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Write a reply…" className={fieldCls + ' flex-1'} />
              <button disabled={busy || !reply.trim()} onClick={sendManual} className="rounded-[10px] bg-blue px-[18px] font-semibold text-white transition hover:brightness-110 disabled:opacity-50">Send</button>
            </div>
            {err && <div className="mt-2.5 text-[13px] text-red">{err}</div>}
          </>
        )}
      </div>
    </div>
  )
}
