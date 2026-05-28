'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import {
  LayoutDashboard,
  Phone,
  Calendar,
  Wrench,
  Settings,
  Users,
} from 'lucide-react'

interface DemoSidebarProps {
  industry: string
}

type NavItem = {
  label: string
  segment: string
  icon: React.ElementType
}

export default function DemoSidebar({ industry }: DemoSidebarProps) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const token = searchParams.get('token') ?? ''
  const [hovering, setHovering] = useState<string | null>(null)

  const base = `/sales-demo/${industry}`
  const q = token ? `?token=${token}` : ''

  const navItems: NavItem[] = [
    { label: 'Dashboard', segment: '',         icon: LayoutDashboard },
    { label: 'Calls',     segment: 'calls',    icon: Phone },
    { label: 'Bookings',  segment: 'bookings', icon: Calendar },
    { label: 'Services',  segment: 'services', icon: Wrench },
    { label: 'Settings',  segment: 'settings', icon: Settings },
    { label: 'Team',      segment: 'team',     icon: Users },
  ]

  function isActive(segment: string): boolean {
    if (segment === '') {
      return pathname === base || pathname === `${base}/`
    }
    return pathname.startsWith(`${base}/${segment}`)
  }

  function href(segment: string): string {
    if (segment === '') return `${base}${q}`
    return `${base}/${segment}${q}`
  }

  return (
    <nav
      style={{
        width: 220,
        minWidth: 220,
        background: '#0A1E38',
        borderRight: '1px solid rgba(255,255,255,0.06)',
        position: 'fixed',
        top: 36,
        left: 0,
        bottom: 0,
        display: 'flex',
        flexDirection: 'column',
        paddingTop: 24,
        paddingBottom: 24,
        zIndex: 40,
        fontFamily: "'Outfit', system-ui, sans-serif",
      }}
    >
      {/* Business label */}
      <div
        style={{
          paddingLeft: 20,
          paddingRight: 20,
          paddingBottom: 20,
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          marginBottom: 12,
        }}
      >
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: '#E8622A',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
          }}
        >
          DEMO PORTAL
        </span>
      </div>

      {/* Nav items */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, paddingLeft: 8, paddingRight: 8 }}>
        {navItems.map((item) => {
          const active = isActive(item.segment)
          const hovered = hovering === item.segment
          const Icon = item.icon

          return (
            <Link
              key={item.segment}
              href={href(item.segment)}
              onMouseEnter={() => setHovering(item.segment)}
              onMouseLeave={() => setHovering(null)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '9px 12px',
                borderRadius: 8,
                textDecoration: 'none',
                fontFamily: "'Outfit', system-ui, sans-serif",
                fontSize: 14,
                fontWeight: active ? 600 : 400,
                color: active ? '#ffffff' : 'rgba(255,255,255,0.65)',
                background: active
                  ? 'rgba(232,98,42,0.15)'
                  : hovered
                  ? 'rgba(255,255,255,0.04)'
                  : 'transparent',
                borderLeft: active ? '3px solid #E8622A' : '3px solid transparent',
                transition: 'background 0.15s, color 0.15s',
              }}
            >
              <Icon size={16} strokeWidth={1.8} />
              {item.label}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
