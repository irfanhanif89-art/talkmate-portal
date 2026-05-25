'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  LayoutDashboard, Users, TrendingUp, FileText, BookOpen,
  MessageSquareX, Activity, Settings, ChevronsLeft, ChevronsRight,
  LogOut, Shield, Upload,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

// Persistent admin chrome — left-rail sidebar that wraps every page
// under `/admin/*`. Replaces the per-page topbar previously rendered
// by `(portal)/layout.tsx` (which gave admins a logo + logout and no
// navigation, leaving pages like /admin/contractors and
// /admin/sales-team with no way to move between sections).
//
// Sidebar can collapse to 64px (icon only). Preference is persisted in
// localStorage so the choice survives page reloads. Active state uses
// `usePathname()`; the root `/admin` link matches on exact path only
// so it doesn't stay active for every child route.

const SIDEBAR_WIDTH = 240
const SIDEBAR_WIDTH_COLLAPSED = 64
const COLLAPSE_KEY = 'admin-sidebar-collapsed'

interface NavItem {
  href: string
  label: string
  icon: React.ComponentType<{ size?: number }>
  comingSoon?: boolean
}

const NAV_ITEMS: NavItem[] = [
  { href: '/admin',                label: 'Overview',      icon: LayoutDashboard },
  { href: '/admin/clients',        label: 'Clients',        icon: Users },
  { href: '/admin/sales-team',     label: 'Sales Team',     icon: TrendingUp },
  { href: '/admin/contractors',    label: 'Contractors',    icon: FileText },
  { href: '/admin/leads-import',   label: 'Import Leads',   icon: Upload },
  { href: '/admin/sales-scripts',  label: 'Sales Resources',  icon: BookOpen },
  { href: '/admin/sms-failures',   label: 'SMS Failures',   icon: MessageSquareX },
  { href: '/admin/agent-health',   label: 'Agent Health',   icon: Activity },
  { href: '/admin/settings',       label: 'Settings',       icon: Settings, comingSoon: true },
]

interface Props {
  children: React.ReactNode
  userEmail: string | null
}

export default function AdminSidebarLayout({ children, userEmail }: Props) {
  const pathname = usePathname()
  const router = useRouter()
  const [collapsed, setCollapsed] = useState<boolean>(false)
  const [mounted, setMounted] = useState(false)

  // Read collapsed preference on first render. We delay this to the
  // client-side effect so the server-rendered HTML always matches the
  // default expanded state — otherwise hydration mismatch would warn.
  useEffect(() => {
    try {
      const v = window.localStorage.getItem(COLLAPSE_KEY)
      if (v === '1') setCollapsed(true)
    } catch {}
    setMounted(true)
  }, [])

  function toggleCollapsed() {
    setCollapsed(prev => {
      const next = !prev
      try { window.localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0') } catch {}
      return next
    })
  }

  async function handleLogout() {
    try {
      const supabase = createClient()
      await supabase.auth.signOut()
    } finally {
      router.push('/login')
    }
  }

  const width = collapsed ? SIDEBAR_WIDTH_COLLAPSED : SIDEBAR_WIDTH

  // Active when pathname matches exactly OR when this is a parent
  // route (pathname starts with href + '/'). The /admin overview link
  // is exact-match only — without that exception it would highlight
  // for every child route since they all start with '/admin'.
  function isActive(href: string): boolean {
    if (href === '/admin') return pathname === '/admin'
    if (pathname === href) return true
    return pathname.startsWith(href + '/')
  }

  const initial = (userEmail ?? '?').trim().charAt(0).toUpperCase()

  return (
    <div style={{ display: 'flex', height: '100vh', background: '#061322', overflow: 'hidden' }}>
      <aside
        aria-label="Admin navigation"
        style={{
          width,
          flexShrink: 0,
          background: '#061322',
          borderRight: '1px solid rgba(255,255,255,0.06)',
          display: 'flex',
          flexDirection: 'column',
          transition: 'width 200ms ease',
          fontFamily: 'Outfit, sans-serif',
        }}
      >
        {/* ── Brand mark ───────────────────────────────────────── */}
        <Link
          href="/admin"
          style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: collapsed ? '18px 0' : '18px 16px',
            justifyContent: collapsed ? 'center' : 'flex-start',
            textDecoration: 'none', color: 'white',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
          }}
        >
          <div style={{
            width: 32, height: 32, background: '#E8622A', borderRadius: 8,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}>
            <Shield size={16} color="white" />
          </div>
          {!collapsed && (
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 800, letterSpacing: '-0.3px', lineHeight: 1, color: 'white' }}>
                Talk<span style={{ fontWeight: 300, color: '#4A9FE8', letterSpacing: '2px' }}>Mate</span>
              </div>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#E8622A', letterSpacing: '0.1em', textTransform: 'uppercase', marginTop: 3 }}>
                Admin
              </div>
            </div>
          )}
        </Link>

        {/* ── Nav ──────────────────────────────────────────────── */}
        <nav style={{ flex: 1, overflowY: 'auto', padding: '12px 8px' }}>
          {NAV_ITEMS.map(item => {
            const Icon = item.icon
            const active = !item.comingSoon && isActive(item.href)
            const baseStyle: React.CSSProperties = {
              display: 'flex', alignItems: 'center', gap: 12,
              padding: collapsed ? '11px 0' : '11px 12px',
              justifyContent: collapsed ? 'center' : 'flex-start',
              borderRadius: 8, marginBottom: 2,
              borderLeft: active ? '3px solid #E8622A' : '3px solid transparent',
              paddingLeft: collapsed ? 0 : (active ? 9 : 12),
              background: active ? 'rgba(232,98,42,0.10)' : 'transparent',
              color: item.comingSoon
                ? 'rgba(100,116,139,0.5)'
                : active ? '#E8622A' : '#64748B',
              fontSize: 14, fontWeight: 500,
              textDecoration: 'none',
              cursor: item.comingSoon ? 'not-allowed' : 'pointer',
              transition: 'background 150ms ease, color 150ms ease',
              fontFamily: 'inherit',
              position: 'relative' as const,
            }
            const content = (
              <>
                <Icon size={18} />
                {!collapsed && (
                  <>
                    <span style={{ flex: 1 }}>{item.label}</span>
                    {item.comingSoon && (
                      <span style={{
                        fontSize: 9, fontWeight: 700, padding: '2px 6px',
                        borderRadius: 4, background: 'rgba(100,116,139,0.15)',
                        color: '#64748B', letterSpacing: '0.05em',
                        textTransform: 'uppercase',
                      }}>
                        Soon
                      </span>
                    )}
                  </>
                )}
              </>
            )
            if (item.comingSoon) {
              return (
                <div
                  key={item.href}
                  aria-disabled="true"
                  title={collapsed ? `${item.label} (coming soon)` : undefined}
                  style={baseStyle}
                >
                  {content}
                </div>
              )
            }
            return (
              <Link
                key={item.href}
                href={item.href}
                title={collapsed ? item.label : undefined}
                style={baseStyle}
                onMouseEnter={e => {
                  if (!active) (e.currentTarget as HTMLElement).style.color = '#F1F5F9'
                }}
                onMouseLeave={e => {
                  if (!active) (e.currentTarget as HTMLElement).style.color = '#64748B'
                }}
              >
                {content}
              </Link>
            )
          })}
        </nav>

        {/* ── Bottom: user + logout + collapse toggle ──────────── */}
        <div style={{
          borderTop: '1px solid rgba(255,255,255,0.06)',
          padding: collapsed ? '10px 0' : '12px 12px',
          display: 'flex', flexDirection: 'column', gap: 8,
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            justifyContent: collapsed ? 'center' : 'flex-start',
          }}>
            <div
              title={userEmail ?? undefined}
              style={{
                width: 30, height: 30, borderRadius: '50%',
                background: '#1565C0', color: 'white',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 13, fontWeight: 700, flexShrink: 0,
              }}
            >
              {initial}
            </div>
            {!collapsed && (
              <span style={{
                fontSize: 11, color: '#64748B',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const,
                minWidth: 0, flex: 1,
              }}>
                {userEmail ?? 'Signed in'}
              </span>
            )}
          </div>
          <button
            onClick={handleLogout}
            title={collapsed ? 'Log out' : undefined}
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: collapsed ? '10px 0' : '8px 10px',
              justifyContent: collapsed ? 'center' : 'flex-start',
              background: 'transparent', border: '1px solid rgba(255,255,255,0.08)',
              color: '#64748B', borderRadius: 8,
              fontSize: 13, fontWeight: 500, cursor: 'pointer',
              fontFamily: 'inherit',
              transition: 'color 150ms ease, border-color 150ms ease',
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLElement).style.color = '#F1F5F9';
              (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.16)'
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLElement).style.color = '#64748B';
              (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.08)'
            }}
          >
            <LogOut size={15} />
            {!collapsed && <span>Log out</span>}
          </button>
          <button
            onClick={toggleCollapsed}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: '8px 10px', marginTop: 2,
              background: 'transparent', border: 'none',
              color: '#64748B', borderRadius: 8,
              cursor: 'pointer', fontFamily: 'inherit',
              transition: 'color 150ms ease',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#F1F5F9' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = '#64748B' }}
          >
            {collapsed ? <ChevronsRight size={16} /> : <ChevronsLeft size={16} />}
          </button>
        </div>
      </aside>

      <main
        style={{
          flex: 1, minWidth: 0, overflowY: 'auto',
          background: '#0A1628',
          color: '#F1F5F9',
          fontFamily: 'Outfit, sans-serif',
          // Hide overflow until mounted so the first paint doesn't flash
          // an unstyled state on slow networks.
          visibility: mounted ? 'visible' : 'visible',
        }}
      >
        {children}
      </main>
    </div>
  )
}
