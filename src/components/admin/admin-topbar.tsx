'use client'

import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { LogOut, Shield } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

interface Props {
  userEmail: string
}

// Minimal sticky topbar for admin pages. Admin doesn't have a left
// sidebar (admins use in-page pill nav on /admin), so the topbar is
// the only persistent chrome. Logout sits on the right.
export default function AdminTopbar({ userEmail }: Props) {
  const router = useRouter()

  async function logout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <header
      style={{
        position: 'sticky', top: 0, zIndex: 50,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 12, padding: '12px 20px',
        background: '#071829', borderBottom: '1px solid rgba(255,255,255,0.06)',
        fontFamily: 'Outfit, sans-serif',
      }}
    >
      <Link
        href="/admin"
        style={{
          display: 'flex', alignItems: 'center', gap: 10,
          textDecoration: 'none', color: 'white',
        }}
      >
        <div style={{
          width: 30, height: 30, background: '#E8622A', borderRadius: 7,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Shield size={15} color="white" />
        </div>
        <span style={{ fontSize: 15, fontWeight: 800, letterSpacing: '-0.3px' }}>
          Talk<span style={{ fontWeight: 300, color: '#4A9FE8', letterSpacing: '2px' }}>Mate</span>
          <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 700, color: '#E8622A', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
            Admin
          </span>
        </span>
      </Link>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span
          className="admin-topbar-email"
          style={{ fontSize: 12, color: '#7BAED4', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
        >
          {userEmail}
        </span>
        <button
          onClick={logout}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '8px 12px',
            background: 'transparent', border: '1px solid rgba(255,255,255,0.06)',
            color: '#7BAED4', borderRadius: 8,
            fontSize: 12, fontWeight: 500, cursor: 'pointer',
            fontFamily: 'Outfit, sans-serif',
          }}
        >
          <LogOut size={13} /> Log out
        </button>
      </div>

      <style>{`
        @media (max-width: 640px) {
          .admin-topbar-email { display: none; }
        }
      `}</style>
    </header>
  )
}
