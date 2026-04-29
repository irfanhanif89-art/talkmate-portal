'use client'

import { useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { getPlan } from '@/lib/plan'
import {
  LayoutDashboard, Phone, BarChart2, FileText, Settings, Calendar,
  MessageSquare, Star, MessageCircle, DollarSign, CreditCard, User as UserIcon,
  Lock, LogOut, Shield, X, Users, GitBranch,
} from 'lucide-react'

interface Props {
  businessName: string
  userEmail: string
  userRole: string
  plan: string
  callsThisMonth: number
  partnerEarningsThisMonth: number
  isPartner: boolean
  todayCallCount: number
  contactsTotal?: number
  hasCommandCentre: boolean
  hasPipeline?: boolean
  isOpenMobile: boolean
  onCloseMobile: () => void
}

export default function PortalSidebar(props: Props) {
  const pathname = usePathname()
  const router = useRouter()
  const planConfig = getPlan(props.plan)
  const [hovering, setHovering] = useState<string | null>(null)

  async function logout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  function go(href: string) {
    router.push(href)
    props.onCloseMobile()
  }

  const sections: Array<{
    label: string
    items: Array<{
      href: string
      label: string
      icon: React.ComponentType<{ size?: number }>
      badge?: { text: string; bg: string; color: string }
      locked?: boolean
      lockReason?: string
      show: boolean
    }>
  }> = [
    {
      label: 'Overview',
      items: [
        { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, show: true },
        {
          href: '/calls', label: 'Calls', icon: Phone, show: true,
          badge: props.todayCallCount > 0 ? { text: String(props.todayCallCount), bg: 'rgba(74,159,232,0.18)', color: '#4A9FE8' } : undefined,
        },
        { href: '/analytics', label: 'Analytics', icon: BarChart2, show: true },
      ],
    },
    {
      label: 'Your Agent',
      items: [
        {
          href: '/contacts', label: 'Contacts', icon: Users, show: true,
          badge: props.contactsTotal && props.contactsTotal > 0 ? { text: String(props.contactsTotal), bg: 'rgba(74,159,232,0.18)', color: '#4A9FE8' } : undefined,
        },
        { href: '/contacts/pipeline', label: 'Pipeline', icon: GitBranch, show: !!props.hasPipeline },
        { href: '/catalog', label: 'Services & Menu', icon: FileText, show: true },
        { href: '/settings', label: 'Agent Settings', icon: Settings, show: true },
        { href: '/appointments', label: 'Jobs', icon: Calendar, show: true },
      ],
    },
    {
      label: 'Assistant',
      items: [
        {
          href: '/command-centre',
          label: 'Command Centre',
          icon: MessageSquare,
          locked: !props.hasCommandCentre,
          lockReason: 'Growth+',
          show: true,
        },
      ],
    },
    {
      label: 'Grow',
      items: [
        {
          href: '/refer-and-earn', label: 'Refer & Earn', icon: DollarSign, show: true,
          badge: props.partnerEarningsThisMonth > 0
            ? { text: `$${Math.round(props.partnerEarningsThisMonth)}/mo`, bg: 'rgba(34,197,94,0.18)', color: '#22C55E' }
            : undefined,
        },
        { href: '/grow/google-reviews', label: 'Google Reviews', icon: Star, locked: true, lockReason: 'Coming soon', show: true },
        { href: '/grow/sms-followups', label: 'SMS Follow-ups', icon: MessageCircle, locked: true, lockReason: 'Coming soon', show: true },
      ],
    },
    {
      label: 'Account',
      items: [
        { href: '/billing', label: 'Billing', icon: CreditCard, show: true },
        { href: '/settings', label: 'Settings', icon: UserIcon, show: true },
        { href: '/admin', label: 'Admin', icon: Shield, show: props.userRole === 'admin' },
      ],
    },
  ]

  function NavLink(item: { href: string; label: string; icon: React.ComponentType<{ size?: number }>; badge?: { text: string; bg: string; color: string }; locked?: boolean; lockReason?: string }) {
    const Icon = item.icon
    const active = pathname === item.href || pathname.startsWith(item.href + '/')
    const isHovering = hovering === item.href
    return (
      <button
        type="button"
        onClick={() => item.locked ? router.push('/billing') : go(item.href)}
        onMouseEnter={() => setHovering(item.href)}
        onMouseLeave={() => setHovering(null)}
        style={{
          display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px',
          borderRadius: 10, fontSize: 14, fontWeight: 500, cursor: 'pointer',
          background: active ? 'rgba(232,98,42,0.13)' : isHovering ? 'rgba(255,255,255,0.04)' : 'transparent',
          color: active ? '#E8622A' : item.locked ? '#4A7FBB' : '#7BAED4',
          border: active ? '1px solid rgba(232,98,42,0.22)' : '1px solid transparent',
          width: '100%',
          marginBottom: 2,
          fontFamily: 'Outfit, sans-serif',
          transition: 'all 0.15s',
        }}
      >
        {item.locked ? <Lock size={15} /> : <Icon size={16} />}
        <span style={{ flex: 1, textAlign: 'left' }}>{item.label}</span>
        {item.badge && (
          <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: item.badge.bg, color: item.badge.color }}>
            {item.badge.text}
          </span>
        )}
        {item.locked && item.lockReason && (
          <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 99, background: 'rgba(232,98,42,0.18)', color: '#E8622A', letterSpacing: '0.05em' }}>
            {item.lockReason}
          </span>
        )}
      </button>
    )
  }

  const sidebarBody = (
    <>
      <div style={{ padding: '20px 18px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 32, height: 32, background: '#E8622A', borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg viewBox="0 0 36 36" width="18" height="18" fill="none">
              <rect x="6" y="8" width="24" height="5" rx="2.5" fill="white" />
              <rect x="14" y="8" width="8" height="22" rx="2.5" fill="white" />
            </svg>
          </div>
          <span style={{ fontFamily: 'Outfit,sans-serif', fontWeight: 800, fontSize: '1.1rem', color: 'white', letterSpacing: '-0.5px' }}>
            Talk<span style={{ fontWeight: 300, color: '#4A9FE8', letterSpacing: '2px' }}>Mate</span>
          </span>
        </div>
        <button
          onClick={props.onCloseMobile}
          aria-label="Close menu"
          className="lg:hidden"
          style={{ background: 'transparent', border: 'none', color: '#7BAED4', cursor: 'pointer', padding: 4, display: 'flex' }}
        >
          <X size={18} />
        </button>
      </div>

      <nav style={{ flex: 1, padding: 12, overflowY: 'auto' }}>
        {sections.map(section => (
          <div key={section.label} style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgba(255,255,255,0.25)', padding: '4px 14px 6px' }}>{section.label}</div>
            {section.items.filter(i => i.show).map(item => (
              <NavLink key={item.href + item.label} {...item} />
            ))}
          </div>
        ))}
      </nav>

      <div style={{ padding: 14, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{
          background: 'rgba(232,98,42,0.06)', border: '1px solid rgba(232,98,42,0.2)', borderRadius: 12, padding: 12, marginBottom: 10,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#E8622A', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{planConfig.label}</span>
            <span style={{ fontSize: 11, color: '#7BAED4' }}>${planConfig.monthlyPrice}/mo</span>
          </div>
          <div style={{ fontSize: 11, color: '#7BAED4' }}>
            {planConfig.callLimit ? `${props.callsThisMonth} / ${planConfig.callLimit} calls used` : `${props.callsThisMonth} calls — unlimited plan`}
          </div>
          {planConfig.callLimit && (
            <div style={{ height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 2, marginTop: 8, overflow: 'hidden' }}>
              <div style={{
                width: `${Math.min(100, Math.round((props.callsThisMonth / planConfig.callLimit) * 100))}%`,
                height: '100%',
                background: props.callsThisMonth / planConfig.callLimit > 0.8 ? '#EF4444' : '#E8622A',
                borderRadius: 2,
              }} />
            </div>
          )}
          {planConfig.key !== 'pro' && planConfig.key !== 'professional' && (
            <button
              onClick={() => go('/billing')}
              style={{
                marginTop: 10, width: '100%', background: '#E8622A', color: 'white', border: 'none',
                padding: '8px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'Outfit,sans-serif',
              }}
            >
              Upgrade →
            </button>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(232,98,42,0.2)', color: '#E8622A', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
            {(props.businessName[0] || 'T').toUpperCase()}
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'white', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{props.businessName}</div>
            <div style={{ fontSize: 10, color: '#4A7FBB', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{props.userEmail}</div>
          </div>
        </div>

        <button
          onClick={logout}
          style={{
            display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '8px 12px',
            background: 'transparent', border: '1px solid rgba(255,255,255,0.06)', color: '#7BAED4', borderRadius: 8,
            fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: 'Outfit,sans-serif',
          }}
        >
          <LogOut size={13} /> Log out
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
          width: 240, background: '#071829', borderRight: '1px solid rgba(255,255,255,0.06)',
          flexDirection: 'column', height: '100vh', flexShrink: 0, position: 'sticky', top: 0,
        }}
      >
        {sidebarBody}
      </aside>

      {/* Mobile drawer */}
      <div
        onClick={props.onCloseMobile}
        className="lg:hidden"
        style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 40,
          opacity: props.isOpenMobile ? 1 : 0, pointerEvents: props.isOpenMobile ? 'auto' : 'none',
          transition: 'opacity 0.2s ease',
        }}
      />
      <aside
        className="lg:hidden"
        style={{
          position: 'fixed', top: 0, bottom: 0, left: 0, width: 260, zIndex: 50,
          background: '#071829', borderRight: '1px solid rgba(255,255,255,0.06)',
          display: 'flex', flexDirection: 'column',
          transform: props.isOpenMobile ? 'translateX(0)' : 'translateX(-100%)',
          transition: 'transform 0.25s ease',
        }}
      >
        {sidebarBody}
      </aside>
    </>
  )
}
