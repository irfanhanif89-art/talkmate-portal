'use client'

import { useState } from 'react'
import { Menu } from 'lucide-react'
import SalesNav from './sales-nav'
import CommissionPolicyModal from './commission-policy-modal'
import NotificationBell from './NotificationBell'
import { SalesRepProvider } from '@/context/sales-rep-context'
import type { SalesRepRow } from '@/lib/sales-auth'

interface Props {
  rep: SalesRepRow
  children: React.ReactNode
}

export default function SalesShell({ rep, children }: Props) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const needsPolicy = !rep.policy_acknowledged_at

  return (
    <SalesRepProvider rep={rep}>
      <div style={{
        display: 'flex', minHeight: '100vh', background: '#061322',
        fontFamily: 'Outfit, sans-serif', color: 'white',
      }}>
        <SalesNav
          repName={rep.full_name}
          repEmail={rep.email}
          isOpenMobile={sidebarOpen}
          onCloseMobile={() => setSidebarOpen(false)}
        />

        <main style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          {/* Top header — visible on every viewport */}
          <div
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              gap: 12,
              padding: '10px 18px',
              borderBottom: '1px solid rgba(255,255,255,0.06)',
              background: '#061322',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <button
                className="sales-topbar-menu"
                onClick={() => setSidebarOpen(true)}
                aria-label="Open menu"
                style={{
                  display: 'none',
                  background: 'transparent', border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 8, padding: '8px 10px',
                  color: '#7BAED4', cursor: 'pointer',
                }}
              >
                <Menu size={18} />
              </button>
              <div className="sales-topbar-brand" style={{ fontSize: 16, fontWeight: 800, display: 'none' }}>
                Sales <span style={{ color: '#E8622A' }}>HQ</span>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <NotificationBell repId={rep.id} />
            </div>
          </div>

          <div style={{ flex: 1, minHeight: 0 }}>{children}</div>
        </main>
      </div>

      {needsPolicy && <CommissionPolicyModal />}

      <style>{`
        @media (max-width: 1023px) {
          .sales-topbar-menu, .sales-topbar-brand { display: inline-flex !important; }
        }
      `}</style>
    </SalesRepProvider>
  )
}
