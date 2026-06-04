'use client'

import { useState } from 'react'
import { Menu } from 'lucide-react'
import SalesNav from './sales-nav'
import CommissionPolicyModal from './commission-policy-modal'
import NotificationBell from './NotificationBell'
import { SalesRepProvider } from '@/context/sales-rep-context'
import { ThemeToggle } from '@/components/theme-toggle'
import type { SalesRepRow } from '@/lib/sales-auth'

interface Props {
  rep: SalesRepRow
  children: React.ReactNode
}

export default function SalesShell({ rep, children }: Props) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const needsPolicy = !rep.policy_acknowledged_at

  // Avatar initials for topbar right cluster
  const avatarInitials = (rep.full_name || rep.email || 'S')
    .trim()
    .split(/\s+/)
    .map((s: string) => s[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

  return (
    <SalesRepProvider rep={rep}>
      <div style={{
        display: 'flex',
        minHeight: '100vh',
        background: 'var(--bg)',
        color: 'var(--text)',
      }}>
        <SalesNav
          repName={rep.full_name}
          repEmail={rep.email}
          isOpenMobile={sidebarOpen}
          onCloseMobile={() => setSidebarOpen(false)}
        />

        <main style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          {/* Topbar — 68px, border-b border-line */}
          <header style={{
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
          }}>
            {/* Left: hamburger (mobile) + title */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <button
                onClick={() => setSidebarOpen(true)}
                aria-label="Open menu"
                className="lg:hidden"
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--dim)',
                  padding: 6,
                  cursor: 'pointer',
                  display: 'flex',
                }}
              >
                <Menu size={22} />
              </button>
              <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--text)', lineHeight: 1.1, letterSpacing: '-0.4px' }}>
                Sales HQ
              </div>
            </div>

            {/* Right cluster: ThemeToggle → NotificationBell → avatar */}
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
              <ThemeToggle />

              {/* NotificationBell — has its own button styles */}
              <NotificationBell repId={rep.id} />

              {/* Avatar — blue gradient, matching sidebar footer */}
              <div style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                background: 'linear-gradient(135deg,#1a4a6a,#0d2e50)',
                color: '#cfe0f2',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 12,
                fontWeight: 700,
                flexShrink: 0,
              }}>
                {avatarInitials}
              </div>
            </div>
          </header>

          {/* Page content */}
          <div style={{ flex: 1, minHeight: 0 }}>{children}</div>
        </main>
      </div>

      {needsPolicy && <CommissionPolicyModal />}
    </SalesRepProvider>
  )
}
