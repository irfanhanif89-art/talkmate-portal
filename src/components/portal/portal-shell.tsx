'use client'

import { useState } from 'react'
import { usePathname } from 'next/navigation'
import PortalSidebar from './sidebar'
import PortalTopbar from './topbar'
import ChangelogDrawer from './changelog-drawer'

interface Props {
  businessName: string
  userName: string
  userEmail: string
  userRole: string
  plan: string
  callsThisMonth: number
  todayCallCount: number
  partnerEarningsThisMonth: number
  isPartner: boolean
  hasCommandCentre: boolean
  unseenChangelog: number
  children: React.ReactNode
}

// Client-side shell: holds the open/close state for the mobile sidebar drawer
// and the changelog slide-out panel. Server data is hydrated via props from
// the portal layout (`(portal)/layout.tsx`).
export default function PortalShell(props: Props) {
  const pathname = usePathname()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [changelogOpen, setChangelogOpen] = useState(false)

  // Hide the chrome on the standalone onboarding page (full-page wizard).
  const isOnboarding = pathname === '/onboarding'

  if (isOnboarding) {
    return <>{props.children}</>
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#061322' }}>
      <PortalSidebar
        businessName={props.businessName}
        userEmail={props.userEmail}
        userRole={props.userRole}
        plan={props.plan}
        callsThisMonth={props.callsThisMonth}
        partnerEarningsThisMonth={props.partnerEarningsThisMonth}
        isPartner={props.isPartner}
        todayCallCount={props.todayCallCount}
        hasCommandCentre={props.hasCommandCentre}
        isOpenMobile={sidebarOpen}
        onCloseMobile={() => setSidebarOpen(false)}
      />

      <main style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <PortalTopbar
          userName={props.userName}
          userEmail={props.userEmail}
          unseenChangelog={props.unseenChangelog}
          onOpenChangelog={() => setChangelogOpen(true)}
          onOpenSidebar={() => setSidebarOpen(true)}
        />
        <div style={{ flex: 1 }}>{props.children}</div>
      </main>

      <ChangelogDrawer open={changelogOpen} onClose={() => setChangelogOpen(false)} />
    </div>
  )
}
