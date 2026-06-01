'use client'

import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  LayoutDashboard, GitBranch, Users, Target, PlayCircle,
  DollarSign, FileText, User as UserIcon, LogOut, X, BookOpen, Send, Receipt,
} from 'lucide-react'

interface Props {
  repName: string
  repEmail: string
  isOpenMobile: boolean
  onCloseMobile: () => void
}

const NAV_ITEMS = [
  { href: '/sales/training',    label: 'Training',       icon: BookOpen },
  { href: '/sales/dashboard',   label: 'Dashboard',      icon: LayoutDashboard },
  { href: '/sales/hitlist',     label: 'Hit List',       icon: Target },
  { href: '/sales/leads',       label: 'My Pipeline',    icon: GitBranch },
  { href: '/sales/proposals/new', label: 'Send Proposal', icon: Send },
  { href: '/sales/demo',        label: 'Demo',           icon: PlayCircle },
  { href: '/sales/clients',     label: 'My Clients',     icon: Users },
  { href: '/sales/commissions', label: 'Commissions',    icon: DollarSign },
  { href: '/sales/invoices',    label: 'Invoices',       icon: Receipt },
  { href: '/sales/contract',    label: 'My Contract',    icon: FileText },
  { href: '/sales/profile',     label: 'Profile',        icon: UserIcon },
] as const

export default function SalesNav({ repName, repEmail, isOpenMobile, onCloseMobile }: Props) {
  const pathname = usePathname()
  const router = useRouter()

  async function logout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    window.location.href = '/login?next=/sales/dashboard'
  }

  function go(href: string) {
    router.push(href)
    onCloseMobile()
  }

  const sidebar = (
    <aside
      style={{
        width: 260, minHeight: '100vh', background: '#061322',
        borderRight: '1px solid rgba(255,255,255,0.06)',
        display: 'flex', flexDirection: 'column',
        fontFamily: 'Outfit, sans-serif',
      }}
    >
      {/* Brand */}
      <div style={{ padding: '24px 22px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 800, color: 'white', letterSpacing: '-0.5px' }}>
              Sales <span style={{ color: '#E8622A' }}>HQ</span>
            </div>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#4A7FBB', letterSpacing: '0.1em', textTransform: 'uppercase', marginTop: 2 }}>
              TalkMate
            </div>
          </div>
          <button
            onClick={onCloseMobile}
            aria-label="Close menu"
            className="sales-nav-close"
            style={{
              display: 'none', background: 'transparent', border: 'none',
              color: '#7BAED4', cursor: 'pointer', padding: 4,
            }}
          >
            <X size={20} />
          </button>
        </div>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: '16px 12px', overflowY: 'auto' }}>
        {NAV_ITEMS.map(item => {
          const Icon = item.icon
          const active = pathname === item.href || pathname.startsWith(item.href + '/')
          return (
            <button
              key={item.href}
              onClick={() => go(item.href)}
              style={{
                width: '100%',
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '11px 14px', marginBottom: 4, borderRadius: 9,
                background: active ? 'rgba(232,98,42,0.15)' : 'transparent',
                border: active ? '1px solid rgba(232,98,42,0.3)' : '1px solid transparent',
                color: active ? '#E8622A' : '#7BAED4',
                fontFamily: 'Outfit, sans-serif',
                fontSize: 14, fontWeight: 600,
                cursor: 'pointer', textAlign: 'left',
              }}
            >
              <Icon size={18} />
              {item.label}
            </button>
          )
        })}
      </nav>

      {/* Footer / user */}
      <div style={{ padding: '14px 16px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ fontSize: 13, color: 'white', fontWeight: 700, marginBottom: 2 }}>{repName}</div>
        <div style={{ fontSize: 11, color: '#4A7FBB', marginBottom: 12, wordBreak: 'break-all' }}>{repEmail}</div>
        <button
          onClick={logout}
          style={{
            width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            padding: '9px 12px', borderRadius: 8,
            background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
            color: '#7BAED4', fontFamily: 'Outfit, sans-serif',
            fontSize: 13, fontWeight: 600, cursor: 'pointer',
          }}
        >
          <LogOut size={14} /> Sign out
        </button>
      </div>
    </aside>
  )

  return (
    <>
      {/* Desktop */}
      <div className="sales-nav-desktop">{sidebar}</div>

      {/* Mobile drawer */}
      {isOpenMobile && (
        <div
          onClick={onCloseMobile}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
            zIndex: 100,
          }}
          className="sales-nav-mobile-backdrop"
        >
          <div onClick={e => e.stopPropagation()} style={{ height: '100vh', width: 280 }}>
            {sidebar}
          </div>
        </div>
      )}

      <style>{`
        .sales-nav-desktop { display: none; }
        .sales-nav-mobile-backdrop { display: block; }
        @media (min-width: 1024px) {
          .sales-nav-desktop { display: block; }
          .sales-nav-mobile-backdrop { display: none !important; }
        }
        @media (max-width: 1023px) {
          .sales-nav-close { display: inline-flex !important; }
        }
      `}</style>
    </>
  )
}
