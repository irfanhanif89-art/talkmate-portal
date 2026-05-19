'use client'

import { useEffect, useState } from 'react'
import { getSmsLabel, formatAuPhone, clientSmsStatus } from '@/lib/sms-labels'

interface MessageRow {
  id: string
  to_phone: string | null
  message: string
  sms_type: string | null
  status: string | null
  sent_at: string | null
}

// Session 19 — "Messages sent after this call" section for the client
// /calls transcript modal. Renders nothing if no messages are linked to
// the call (within 10-min window or by call_id).

export default function CallMessagesSection({ callId }: { callId: string }) {
  const [messages, setMessages] = useState<MessageRow[] | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/portal/calls/${callId}/messages`)
      .then(r => r.ok ? r.json() : { messages: [] })
      .then(d => { if (!cancelled) setMessages(d.messages ?? []) })
      .catch(() => { if (!cancelled) setMessages([]) })
    return () => { cancelled = true }
  }, [callId])

  if (!messages || messages.length === 0) return null

  return (
    <div style={{ padding: '14px 24px', borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgba(74,159,232,0.04)' }}>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#4A9FE8', marginBottom: 10 }}>
        Messages sent after this call
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {messages.map(m => {
          const status = clientSmsStatus(m.status)
          const time = m.sent_at
            ? new Date(m.sent_at).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit', hour12: true })
            : ''
          const preview = m.message.length > 120 ? m.message.slice(0, 120) + '…' : m.message
          return (
            <div key={m.id} style={{
              background: 'rgba(255,255,255,0.04)', borderRadius: 10, padding: '10px 12px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4, gap: 8, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'white' }}>{getSmsLabel(m.sms_type)}</span>
                  <span style={{ fontSize: 11, color: '#7BAED4' }}>→ {formatAuPhone(m.to_phone)}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{time}</span>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: status.color }} />
                  <span style={{ fontSize: 11, color: status.color, fontWeight: 600 }}>{status.label}</span>
                </div>
              </div>
              <div style={{ fontSize: 12, color: '#C8D8EA', lineHeight: 1.5 }}>{preview}</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
