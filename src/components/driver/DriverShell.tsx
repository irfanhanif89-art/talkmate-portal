'use client'

// Sessions 36-37 — shared driver-app shell. Renders a top bar with
// business name + driver name + online/offline toggle, then the
// page body. Mobile-first: targets 375px viewport, gracefully expands
// at desktop widths.

import Link from 'next/link'
import { useRouter, usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { DriverRow } from '@/lib/driver-auth'

export interface DriverShellProps {
  driver: DriverRow
  businessName: string
  children: React.ReactNode
  onStatusChanged?: (isOnline: boolean) => void
}

const BRAND = {
  orange: '#E8622A',
  navy: '#061322',
  blue: '#1565C0',
  green: '#22C55E',
  grey: '#6b7280',
  bg: '#f5f5f7',
  card: '#ffffff',
}

export function DriverShell({ driver, businessName, children, onStatusChanged }: DriverShellProps) {
  const router = useRouter()
  const pathname = usePathname()
  const supabase = createClient()

  async function toggleOnline() {
    const target = !driver.is_online
    const res = await fetch('/api/driver/me/status', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_online: target }),
    })
    if (res.ok) {
      onStatusChanged?.(target)
      router.refresh()
    }
  }

  async function signOut() {
    await supabase.auth.signOut()
    router.replace('/driver/login')
    router.refresh()
  }

  const tabs = [
    { href: '/driver/dashboard', label: 'Today' },
    { href: '/driver/history', label: 'History' },
    { href: '/driver/profile', label: 'Profile' },
  ]

  return (
    <div style={{ minHeight: '100vh', background: BRAND.bg, fontFamily: 'Outfit, sans-serif' }}>
      <header style={{
        background: BRAND.navy,
        color: '#fff',
        padding: '14px 16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        position: 'sticky',
        top: 0,
        zIndex: 10,
      }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, minWidth: 0 }}>
          <span style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-0.5px' }}>TalkMate</span>
          <span style={{
            fontSize: 13,
            opacity: 0.8,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}>{businessName}</span>
        </div>

        <button
          onClick={toggleOnline}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            background: driver.is_online ? BRAND.green : 'rgba(255,255,255,0.12)',
            color: '#fff',
            border: 'none',
            padding: '8px 14px',
            borderRadius: 999,
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          <span style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: '#fff',
            display: 'inline-block',
            opacity: driver.is_online ? 1 : 0.5,
          }} />
          {driver.is_online ? 'Online' : 'Offline'}
        </button>
      </header>

      <nav style={{
        background: '#fff',
        borderBottom: '1px solid #e5e7eb',
        display: 'flex',
        gap: 4,
        padding: '0 8px',
        overflowX: 'auto',
      }}>
        {tabs.map(t => {
          const active = pathname?.startsWith(t.href)
          return (
            <Link
              key={t.href}
              href={t.href}
              style={{
                padding: '14px 16px',
                fontSize: 14,
                fontWeight: active ? 700 : 500,
                color: active ? BRAND.orange : BRAND.grey,
                borderBottom: active ? `2px solid ${BRAND.orange}` : '2px solid transparent',
                textDecoration: 'none',
                whiteSpace: 'nowrap',
              }}
            >
              {t.label}
            </Link>
          )
        })}
        <button
          onClick={signOut}
          style={{
            marginLeft: 'auto',
            padding: '14px 16px',
            fontSize: 13,
            fontWeight: 500,
            color: BRAND.grey,
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          Sign out
        </button>
      </nav>

      <main style={{ padding: '16px', maxWidth: 720, margin: '0 auto' }}>
        {!driver.is_online && (
          <div style={{
            background: '#fff7ed',
            border: '1px solid #fed7aa',
            color: '#9a3412',
            padding: '12px 14px',
            borderRadius: 10,
            fontSize: 14,
            marginBottom: 16,
          }}>
            You are offline. You will not receive new jobs.
          </div>
        )}
        {children}
      </main>
    </div>
  )
}
