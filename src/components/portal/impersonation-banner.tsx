'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'

// Persistent red banner shown when an admin impersonates a client.
// The magic-link flow lands on /dashboard?impersonate=1&biz=<id> — we
// stash that flag in sessionStorage so it survives client-side navigation
// inside the portal. Closing the tab clears it; clicking "Exit" returns
// to /admin/clients.
export default function ImpersonationBanner({ businessName }: { businessName: string }) {
  const search = useSearchParams()
  const [active, setActive] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (search.get('impersonate') === '1') {
      sessionStorage.setItem('tm_impersonate', '1')
      setActive(true)
    } else if (sessionStorage.getItem('tm_impersonate') === '1') {
      setActive(true)
    }
  }, [search])

  function exit() {
    if (typeof window === 'undefined') return
    sessionStorage.removeItem('tm_impersonate')
    window.location.href = '/admin/clients'
  }

  if (!active) return null

  return (
    <div style={{
      position: 'sticky', top: 0, zIndex: 80,
      background: '#EF4444',
      color: 'white',
      padding: '10px 20px',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      gap: 12,
      fontFamily: 'Outfit, sans-serif',
      boxShadow: '0 2px 10px rgba(239,68,68,0.4)',
    }}>
      <span style={{ fontSize: 13, fontWeight: 700 }}>
        ⚠️ Admin view — you are viewing this portal as {businessName}.
      </span>
      <button
        onClick={exit}
        style={{
          padding: '6px 14px', borderRadius: 7,
          background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.4)',
          color: 'white', fontSize: 12, fontWeight: 700, cursor: 'pointer',
          fontFamily: 'Outfit, sans-serif',
        }}
      >Exit →</button>
    </div>
  )
}
