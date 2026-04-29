'use client'

import { useRouter } from 'next/navigation'
import { AlertTriangle } from 'lucide-react'

// Persistent banner shown to existing clients who haven't accepted the
// current versions of the legal docs. Cannot be dismissed — only resolved
// by completing /accept-terms.
export default function RetroactiveTCBanner({ pendingCount }: { pendingCount: number }) {
  const router = useRouter()
  if (pendingCount <= 0) return null
  return (
    <div
      role="alert"
      style={{
        background: 'linear-gradient(135deg, rgba(245,158,11,0.16), rgba(232,98,42,0.08))',
        border: '1px solid rgba(245,158,11,0.4)', borderRadius: 14, padding: '14px 18px',
        marginBottom: 18,
        display: 'flex', alignItems: 'center', gap: 14,
      }}
    >
      <AlertTriangle size={22} color="#F59E0B" style={{ flexShrink: 0 }} />
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'white' }}>Action required</div>
        <div style={{ fontSize: 12, color: '#7BAED4', marginTop: 3 }}>
          Please review and accept our updated Terms of Service and Privacy Policy to continue using TalkMate.
        </div>
      </div>
      <button
        onClick={() => router.push('/accept-terms?next=/dashboard')}
        style={{
          background: '#E8622A', color: 'white', border: 'none',
          padding: '9px 16px', borderRadius: 9, fontSize: 13, fontWeight: 700,
          cursor: 'pointer', fontFamily: 'Outfit, sans-serif', whiteSpace: 'nowrap',
        }}
      >
        Review and accept →
      </button>
    </div>
  )
}
