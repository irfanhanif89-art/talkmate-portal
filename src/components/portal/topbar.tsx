'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Bell, ChevronDown, LogOut, Menu, Settings as SettingsIcon, User as UserIcon, Sparkles } from 'lucide-react'

const PAGE_TITLES: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/calls': 'Calls',
  '/analytics': 'Analytics',
  '/catalog': 'Services & Menu',
  '/services': 'Services & Menu',
  '/appointments': 'Jobs',
  '/command-centre': 'Command Centre',
  '/refer-and-earn': 'Refer & Earn',
  '/billing': 'Billing',
  '/settings': 'Settings',
  '/admin': 'Admin',
  '/onboarding': 'Setup',
}

interface Props {
  userName: string
  userEmail: string
  unseenChangelog: number
  onOpenChangelog: () => void
  onOpenSidebar: () => void
}

export default function PortalTopbar({ userName, userEmail, unseenChangelog, onOpenChangelog, onOpenSidebar }: Props) {
  const pathname = usePathname()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement | null>(null)

  // Close avatar menu on outside click.
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!ref.current) return
      if (!ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const title = (() => {
    const match = Object.keys(PAGE_TITLES).find(k => pathname === k || pathname.startsWith(k + '/'))
    return match ? PAGE_TITLES[match] : 'TalkMate'
  })()

  const initials = (userName || userEmail || 'U').trim().split(/\s+/).map(s => s[0]).join('').slice(0, 2).toUpperCase()

  const todayStr = new Date().toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' })

  async function logout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <header
      style={{
        height: 60,
        background: '#071829',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 20px',
        position: 'sticky',
        top: 0,
        zIndex: 30,
        flexShrink: 0,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <button
          onClick={onOpenSidebar}
          aria-label="Open menu"
          className="lg:hidden"
          style={{ background: 'transparent', border: 'none', color: '#7BAED4', padding: 6, cursor: 'pointer', display: 'flex' }}
        >
          <Menu size={22} />
        </button>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'white', lineHeight: 1.1 }}>{title}</div>
          <div className="hidden md:block" style={{ fontSize: 11, color: '#4A7FBB', marginTop: 2 }}>{todayStr}</div>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button
          onClick={onOpenChangelog}
          aria-label="What's new"
          style={{
            position: 'relative', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
            color: '#7BAED4', borderRadius: 10, width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
          }}
        >
          <Sparkles size={16} />
          {unseenChangelog > 0 && (
            <span style={{
              position: 'absolute', top: 6, right: 6, width: 8, height: 8, background: '#E8622A', borderRadius: '50%',
              border: '1.5px solid #071829',
            }} />
          )}
        </button>

        <button
          aria-label="Notifications"
          style={{
            position: 'relative', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
            color: '#7BAED4', borderRadius: 10, width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
          }}
        >
          <Bell size={16} />
          <span style={{
            position: 'absolute', top: 6, right: 6, width: 8, height: 8, background: '#E8622A', borderRadius: '50%',
            border: '1.5px solid #071829',
          }} />
        </button>

        <div ref={ref} style={{ position: 'relative' }}>
          <button
            onClick={() => setOpen(o => !o)}
            style={{
              display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: '4px 8px 4px 4px', cursor: 'pointer',
            }}
          >
            <span
              style={{
                width: 30, height: 30, borderRadius: '50%', background: 'rgba(232,98,42,0.2)', color: '#E8622A',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700,
              }}
            >{initials}</span>
            <ChevronDown size={14} style={{ color: '#4A7FBB' }} />
          </button>

          {open && (
            <div
              role="menu"
              style={{
                position: 'absolute', top: 'calc(100% + 8px)', right: 0, minWidth: 220,
                background: '#0A1E38', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12,
                boxShadow: '0 14px 36px rgba(0,0,0,0.45)', overflow: 'hidden', zIndex: 60,
              }}
            >
              <div style={{ padding: '12px 14px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'white' }}>{userName || 'Account'}</div>
                <div style={{ fontSize: 11, color: '#4A7FBB', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis' }}>{userEmail}</div>
              </div>
              <button
                onClick={() => { setOpen(false); router.push('/settings') }}
                style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '10px 14px', background: 'transparent', border: 'none', color: '#7BAED4', fontSize: 13, cursor: 'pointer', fontFamily: 'Outfit,sans-serif' }}
              >
                <UserIcon size={14} /> Profile
              </button>
              <button
                onClick={() => { setOpen(false); router.push('/settings') }}
                style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '10px 14px', background: 'transparent', border: 'none', color: '#7BAED4', fontSize: 13, cursor: 'pointer', fontFamily: 'Outfit,sans-serif' }}
              >
                <SettingsIcon size={14} /> Settings
              </button>
              <div style={{ height: 1, background: 'rgba(255,255,255,0.06)' }} />
              <button
                onClick={logout}
                style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '10px 14px', background: 'transparent', border: 'none', color: '#EF4444', fontSize: 13, cursor: 'pointer', fontFamily: 'Outfit,sans-serif' }}
              >
                <LogOut size={14} /> Log out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
