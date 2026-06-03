'use client'

import { useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  LayoutDashboard, GitBranch, Users, Target, PlayCircle,
  DollarSign, FileText, User as UserIcon, LogOut, X, BookOpen, Send, Receipt, FolderOpen,
} from 'lucide-react'

interface Props {
  repName: string
  repEmail: string
  isOpenMobile: boolean
  onCloseMobile: () => void
}

const NAV_ITEMS = [
  { href: '/sales/training',    label: 'Training',       icon: BookOpen },
  { href: '/sales/resources',   label: 'Resources',      icon: FolderOpen },
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
  const [hovering, setHovering] = useState<string | null>(null)

  async function logout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    window.location.href = '/login?next=/sales/dashboard'
  }

  function go(href: string) {
    router.push(href)
    onCloseMobile()
  }

  // Avatar initials from rep name
  const avatarInitials = (repName || repEmail || 'S')
    .trim()
    .split(/\s+/)
    .map(s => s[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

  const sidebarBody = (
    <>
      {/* Brand block */}
      <div style={{
        padding: '20px 14px',
        borderBottom: '1px solid var(--line)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* Same logo SVG as portal sidebar — gradient orange #f58a42→#e66020 */}
          <svg width="34" height="34" viewBox="0 0 34 34" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <rect width="34" height="34" rx="8" fill="url(#tmGSales)" />
            <path d="M9 10.5h16v3H19V24h-4V13.5H9z" fill="white" />
            <path d="M23 27a4 4 0 0 1 0-6" stroke="rgba(255,255,255,.8)" strokeWidth="1.4" strokeLinecap="round" fill="none" />
            <path d="M20.5 29.5a7.5 7.5 0 0 1 0-11" stroke="rgba(255,255,255,.4)" strokeWidth="1.4" strokeLinecap="round" fill="none" />
            <defs>
              <linearGradient id="tmGSales" x1="0" y1="0" x2="34" y2="34" gradientUnits="userSpaceOnUse">
                <stop stopColor="#f58a42" />
                <stop offset="1" stopColor="#e66020" />
              </linearGradient>
            </defs>
          </svg>

          {/* Wordmark + Sales HQ sub-label */}
          <div>
            <span style={{ fontWeight: 800, fontSize: 17, color: 'var(--text)', letterSpacing: '-0.5px', lineHeight: 1 }}>
              Talk<span style={{ fontWeight: 300, color: '#4a9fe8' }}>mate</span>
            </span>
            {/* Sales HQ brand-sub label */}
            <div style={{
              fontSize: 10,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.12em',
              color: 'var(--orange)',
              marginTop: 3,
              lineHeight: 1,
            }}>
              Sales HQ
            </div>
          </div>
        </div>

        {/* Mobile close button */}
        <button
          onClick={onCloseMobile}
          aria-label="Close menu"
          className="lg:hidden"
          style={{
            background: 'transparent',
            border: 'none',
            color: 'var(--dim)',
            cursor: 'pointer',
            padding: 4,
            display: 'flex',
          }}
        >
          <X size={18} />
        </button>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: '12px 14px', overflowY: 'auto' }}>
        {NAV_ITEMS.map(item => {
          const Icon = item.icon
          const active = pathname === item.href || pathname.startsWith(item.href + '/')
          const isHovering = hovering === item.href
          return (
            <button
              key={item.href}
              type="button"
              onClick={() => go(item.href)}
              onMouseEnter={() => setHovering(item.href)}
              onMouseLeave={() => setHovering(null)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 11,
                padding: '9px 12px',
                borderRadius: 10,
                fontSize: 13.5,
                fontWeight: active ? 600 : 500,
                cursor: 'pointer',
                background: active
                  ? 'rgba(240,120,50,.09)'
                  : isHovering
                  ? 'rgba(255,255,255,.04)'
                  : 'transparent',
                color: active ? 'var(--text)' : 'var(--dim)',
                boxShadow: active ? 'inset 2px 0 0 var(--orange)' : 'none',
                border: 'none',
                width: '100%',
                marginBottom: 2,
                transition: 'all 0.15s',
                textAlign: 'left',
              }}
            >
              <span style={{ color: active ? 'var(--orange)' : 'inherit', display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                <Icon size={16} />
              </span>
              <span style={{ flex: 1, color: active ? 'var(--text)' : 'var(--dim)' }}>{item.label}</span>
            </button>
          )
        })}
      </nav>

      {/* Footer / sidefoot — blue gradient avatar for rep */}
      <div style={{ padding: 14, borderTop: '1px solid var(--line)' }}>
        {/* Avatar card */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          {/* Blue gradient avatar (distinct from orange client avatar) */}
          <div style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            background: 'linear-gradient(135deg,#1a4a6a,#0d2e50)',
            color: '#cfe0f2',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 13,
            fontWeight: 700,
            flexShrink: 0,
          }}>
            {avatarInitials}
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{
              fontSize: 12,
              fontWeight: 600,
              color: 'var(--text)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              maxWidth: 160,
            }}>
              {repName}
            </div>
            <div style={{
              fontSize: 10,
              color: 'var(--faint)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              maxWidth: 160,
            }}>
              Sales Rep
            </div>
          </div>
        </div>

        {/* Log out */}
        <button
          onClick={logout}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            width: '100%',
            padding: '8px 12px',
            background: 'transparent',
            border: '1px solid var(--line)',
            color: 'var(--dim)',
            borderRadius: 8,
            fontSize: 12,
            fontWeight: 500,
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          <LogOut size={13} /> Sign out
        </button>
      </div>
    </>
  )

  return (
    <>
      {/* Desktop sidebar */}
      <aside
        className="hidden lg:flex"
        style={{
          width: 240,
          background: 'var(--sidebar)',
          borderRight: '1px solid var(--line)',
          flexDirection: 'column',
          height: '100vh',
          flexShrink: 0,
          position: 'sticky',
          top: 0,
        }}
      >
        {sidebarBody}
      </aside>

      {/* Mobile overlay */}
      <div
        onClick={onCloseMobile}
        className="lg:hidden"
        style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 40,
          opacity: isOpenMobile ? 1 : 0, pointerEvents: isOpenMobile ? 'auto' : 'none',
          transition: 'opacity 0.2s ease',
        }}
      />
      {/* Mobile drawer */}
      <aside
        className="lg:hidden"
        style={{
          position: 'fixed', top: 0, bottom: 0, left: 0, width: 260, zIndex: 50,
          background: 'var(--sidebar)',
          borderRight: '1px solid var(--line)',
          display: 'flex',
          flexDirection: 'column',
          transform: isOpenMobile ? 'translateX(0)' : 'translateX(-100%)',
          transition: 'transform 0.25s ease',
        }}
      >
        {sidebarBody}
      </aside>
    </>
  )
}
