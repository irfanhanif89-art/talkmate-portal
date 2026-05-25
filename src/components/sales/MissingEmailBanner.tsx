'use client'

import Link from 'next/link'
import { Mail } from 'lucide-react'

// Yellow banner shown atop /sales/dashboard and /sales/leads when the
// rep hasn't set their reply-to email. Proposals can't go out without
// it (the send-proposal route also gates on this).
export default function MissingEmailBanner() {
  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '12px 16px', marginBottom: 16, borderRadius: 10,
        background: 'rgba(245,158,11,0.08)',
        border: '1px solid rgba(245,158,11,0.3)',
        color: '#f59e0b',
        fontFamily: 'Outfit, sans-serif', fontSize: 13,
      }}
    >
      <Mail size={16} style={{ flexShrink: 0 }} />
      <span style={{ flex: 1, color: '#fde68a' }}>
        Add your reply email in Profile before sending proposals.
      </span>
      <Link
        href="/sales/profile"
        style={{
          color: '#f59e0b', fontWeight: 700, textDecoration: 'none',
          padding: '6px 12px', borderRadius: 7,
          background: 'rgba(245,158,11,0.12)',
          border: '1px solid rgba(245,158,11,0.3)',
        }}
      >
        Go to Profile →
      </Link>
    </div>
  )
}
