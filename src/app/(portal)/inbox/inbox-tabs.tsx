'use client'

// Inbox tab switcher — Session 3C. Wraps the existing SMS InboxView (passed as
// children, untouched) and adds an Email tab that mounts EmailInbox. Keeps the
// live SMS surface fully isolated from the new email code.

import { useState } from 'react'
import EmailInbox from './email-inbox'

const ORANGE = '#E8622A'

export default function InboxTabs({ businessId, children }: { businessId: string; children: React.ReactNode }) {
  const [tab, setTab] = useState<'sms' | 'email'>('sms')

  const tabBtn = (key: 'sms' | 'email', label: string): React.CSSProperties => ({
    padding: '8px 18px', borderRadius: 10, border: 'none', cursor: 'pointer', fontFamily: 'Outfit,sans-serif',
    fontSize: 14, fontWeight: 700,
    background: tab === key ? ORANGE : 'rgba(255,255,255,0.06)',
    color: tab === key ? 'white' : '#C8D8EA',
  })

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, padding: '20px 32px 0' }}>
        <button style={tabBtn('sms', 'SMS')} onClick={() => setTab('sms')}>SMS</button>
        <button style={tabBtn('email', 'Email')} onClick={() => setTab('email')}>Email</button>
      </div>

      {/* SMS view stays mounted (preserves its realtime subscription) but is hidden when Email is active. */}
      <div style={{ display: tab === 'sms' ? 'block' : 'none' }}>{children}</div>
      {tab === 'email' && (
        <div style={{ padding: '20px 32px' }}>
          <EmailInbox businessId={businessId} />
        </div>
      )}
    </div>
  )
}
