'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Bell, ChevronDown, LogOut, Menu, Settings as SettingsIcon, User as UserIcon, Lock, Gift } from 'lucide-react'
import { ThemeToggle } from '@/components/theme-toggle'

const PAGE_TITLES: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/calls': 'Calls',
  '/analytics': 'Analytics',
  '/catalog': 'Services',
  '/services': 'Services',
  '/appointments': 'Jobs',
  '/command-centre': 'Command Centre',
  '/refer-and-earn': 'Refer & Earn',
  '/billing': 'Billing',
  '/settings': 'Settings',
  '/admin': 'Admin',
  '/onboarding': 'Setup',
  '/bookings': 'Bookings',
  '/sms-activity': 'Engage',
  '/train': 'AI Receptionist',
  '/contacts': 'Customers',
  '/quotes': 'Quotes',
  '/scheduler': 'Scheduler',
  '/chatbot': 'Chatbot',
  '/inbox': 'Inbox',
  '/team': 'Team',
  '/vip-callers': 'VIP Callers',
  '/callbacks': 'Callbacks',
  '/dispatch': 'Dispatch Board',
  '/profile': 'My Profile',
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

  // On the dashboard, show a greeting + search box (matches the design); other pages show the page title.
  const isDashboard = pathname === '/dashboard'
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
  const firstName = (userName || '').trim().split(/\s+/)[0]

  async function logout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <header
      style={{
        height: 68,
        background: 'var(--bg)',
        borderBottom: '1px solid var(--line)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 28px',
        position: 'sticky',
        top: 0,
        zIndex: 30,
        flexShrink: 0,
        gap: 18,
      }}
    >
      {/* Left: hamburger + title */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <button
          onClick={onOpenSidebar}
          aria-label="Open menu"
          className="flex lg:hidden"
          style={{ background: 'transparent', border: 'none', color: 'var(--dim)', padding: 6, cursor: 'pointer' }}
        >
          <Menu size={22} />
        </button>
        <div>
          {isDashboard ? (
            <>
              <div style={{ fontSize: 19, fontWeight: 800, color: 'var(--text)', lineHeight: 1.1, letterSpacing: '-0.4px' }}>
                {greeting}{firstName ? `, ${firstName}` : ''}
              </div>
              <div className="hidden md:block" style={{ fontSize: 12.5, color: 'var(--dim)', marginTop: 2 }}>{todayStr} · your receptionist is live</div>
            </>
          ) : (
            <>
              <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--text)', lineHeight: 1.1, letterSpacing: '-0.4px' }}>{title}</div>
              <div className="hidden md:block" style={{ fontSize: 12.5, color: 'var(--dim)', marginTop: 2 }}>{todayStr}</div>
            </>
          )}
        </div>
      </div>

      {/* Search (dashboard only, desktop) — routes to Calls where search lives */}
      {isDashboard && (
        <button
          onClick={() => router.push('/calls')}
          className="hidden lg:flex"
          style={{ alignItems: 'center', gap: 9, flex: 1, maxWidth: 280, background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 10, padding: '8px 12px', color: 'var(--faint)', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>
          Search calls, customers…
        </button>
      )}

      {/* Right cluster: live pill → theme toggle → icon buttons → avatar */}
      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12 }}>

        {/* Live pill — cosmetic status indicator */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 7,
            background: 'var(--green-soft)',
            border: '1px solid rgba(53,201,138,.3)',
            borderRadius: 999,
            padding: '6px 13px',
            fontSize: 12.5,
            fontWeight: 700,
            color: 'var(--green)',
          }}
        >
          {/* Pulsing green dot */}
          <span style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', width: 7, height: 7, flexShrink: 0 }}>
            <span
              style={{
                position: 'absolute',
                inset: -4,
                borderRadius: '50%',
                background: 'var(--green)',
                opacity: 0.4,
                animation: 'tm-pulse 1.8s ease-out infinite',
              }}
            />
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--green)', position: 'relative', zIndex: 1 }} />
          </span>
          Receptionist live
        </div>

        {/* Theme toggle */}
        <ThemeToggle />

        {/* Notifications bell (also opens What's New) */}
        <button
          onClick={onOpenChangelog}
          aria-label="Notifications"
          style={{
            position: 'relative',
            background: 'var(--card)',
            border: '1px solid var(--line)',
            color: 'var(--dim)',
            borderRadius: 10,
            width: 36,
            height: 36,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            flexShrink: 0,
          }}
        >
          <Bell size={17} />
          {unseenChangelog > 0 && (
            <span style={{
              position: 'absolute', top: 8, right: 9, width: 7, height: 7,
              background: 'var(--orange)', borderRadius: '50%',
              border: '2px solid var(--card)',
            }} />
          )}
        </button>

        {/* Avatar + dropdown */}
        <div ref={ref} style={{ position: 'relative' }}>
          <button
            onClick={() => setOpen(o => !o)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              background: 'var(--card)',
              border: '1px solid var(--line)',
              borderRadius: 10,
              padding: '4px 8px 4px 4px',
              cursor: 'pointer',
            }}
          >
            <span
              style={{
                width: 28,
                height: 28,
                borderRadius: 8,
                background: 'linear-gradient(135deg,#3d5573,#26384f)',
                color: '#cfe0f2',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 12,
                fontWeight: 700,
                flexShrink: 0,
              }}
            >{initials}</span>
            <ChevronDown size={14} style={{ color: 'var(--dim)' }} />
          </button>

          {open && (
            <div
              role="menu"
              style={{
                position: 'absolute', top: 'calc(100% + 8px)', right: 0, minWidth: 220,
                background: 'var(--card)', border: '1px solid var(--line-strong)', borderRadius: 12,
                boxShadow: '0 14px 36px rgba(0,0,0,0.45)', overflow: 'hidden', zIndex: 60,
              }}
            >
              <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--line)' }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{userName || 'Account'}</div>
                <div style={{ fontSize: 11, color: 'var(--dim)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis' }}>{userEmail}</div>
              </div>
              <button
                onClick={() => { setOpen(false); router.push('/profile') }}
                style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '10px 14px', background: 'transparent', border: 'none', color: 'var(--dim)', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}
              >
                <UserIcon size={14} /> Profile
              </button>
              <button
                onClick={() => { setOpen(false); router.push('/settings') }}
                style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '10px 14px', background: 'transparent', border: 'none', color: 'var(--dim)', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}
              >
                <SettingsIcon size={14} /> Settings
              </button>
              <button
                onClick={() => { setOpen(false); router.push('/settings/security') }}
                style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '10px 14px', background: 'transparent', border: 'none', color: 'var(--dim)', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}
              >
                <Lock size={14} /> Security
              </button>
              <button
                onClick={() => { setOpen(false); router.push('/refer-and-earn') }}
                style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '10px 14px', background: 'transparent', border: 'none', color: 'var(--dim)', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}
              >
                <Gift size={14} /> Refer &amp; Earn
              </button>
              <div style={{ height: 1, background: 'var(--line)' }} />
              <button
                onClick={logout}
                style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '10px 14px', background: 'transparent', border: 'none', color: 'var(--red)', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}
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
