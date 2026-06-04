'use client'

import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { getPlan } from '@/lib/plan'
import { useBusinessType } from '@/context/business-type-context'
import {
  LayoutDashboard, Phone, BarChart2, FileText, Settings, Calendar,
  MessageSquare, MessageCircle, CreditCard, Lock, X, Users,
  ClipboardList, Bot, Palette,
} from 'lucide-react'

interface Props {
  businessName: string
  userEmail: string
  userRole: string
  portalRole?: 'owner' | 'manager' | 'staff'
  plan: string
  callsThisMonth: number
  partnerEarningsThisMonth: number
  isPartner: boolean
  todayCallCount: number
  contactsTotal?: number
  hasCommandCentre: boolean
  hasPipeline?: boolean
  hasDispatch?: boolean
  hasCommand?: boolean
  industry?: string | null
  isWhiteLabelPartner?: boolean
  isOpenMobile: boolean
  onCloseMobile: () => void
}

// Plan-gate helper for the Engage entitlement tag.
function isPaidPlan(plan: string): boolean {
  return plan === 'growth' || plan === 'pro'
}

export default function PortalSidebar(props: Props) {
  const pathname = usePathname()
  const router = useRouter()
  const planConfig = getPlan(props.plan)
  // Sprint 1 hardening — the realtime unread subscription filters on this
  // so a client's browser only wakes on its own SMS events, not every
  // tenant's. Sourced from BusinessTypeProvider (set in the portal layout).
  const { businessId } = useBusinessType()
  const [hovering, setHovering] = useState<string | null>(null)
  // Session 11 — gate sensitive nav items by portal role. Defaults to
  // 'owner' so admin users + legacy contexts keep full visibility.
  const portalRole = props.portalRole ?? 'owner'
  const isOwner = portalRole === 'owner'
  const isManagerOrOwner = portalRole === 'owner' || portalRole === 'manager'

  // Engage (SMS) unread badge. Subscribes to realtime so the
  // count refreshes as soon as a new SMS lands without forcing a poll.
  const [smsUnread, setSmsUnread] = useState(0)
  useEffect(() => {
    const supabase = createClient()
    let cancelled = false
    async function refresh() {
      try {
        const r = await fetch('/api/sms/conversations')
        if (!r.ok) return
        const d = (await r.json()) as { totalUnread?: number }
        if (!cancelled && typeof d.totalUnread === 'number') setSmsUnread(d.totalUnread)
      } catch { /* silent */ }
    }
    void refresh()
    // Guard against an empty businessId (legacy/admin contexts where the
    // provider value isn't set) — without a filter we'd subscribe to every
    // tenant's conversation events, so skip the realtime sub entirely and
    // rely on the initial fetch.
    if (!businessId) return () => { cancelled = true }
    const channel = supabase
      .channel('sidebar-sms-unread')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sms_conversations', filter: `business_id=eq.${businessId}` }, () => {
        void refresh()
      })
      .subscribe()
    return () => {
      cancelled = true
      void supabase.removeChannel(channel)
    }
  }, [businessId])

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
      // Session 16 -- muted plan-gate chip rendered with the
      // LOCKED_BADGE_STYLE. The nav item still navigates to the page
      // (which shows the locked preview); not the same as `locked`,
      // which is for "coming soon" items that route to /billing.
      lockTag?: 'PRO' | 'GROWTH'
      show: boolean
    }>
  }> = [
    {
      // Main group — no label (per design spec §1 / §2)
      label: '',
      items: [
        { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, show: true },
        {
          href: '/calls', label: 'Calls', icon: Phone, show: true,
          badge: props.todayCallCount > 0 ? { text: String(props.todayCallCount), bg: '', color: '#fff' } : undefined,
        },
        { href: '/bookings', label: 'Bookings', icon: Calendar, show: true },
        { href: '/contacts', label: 'Customers', icon: Users, show: true },
        { href: '/analytics', label: 'Analytics', icon: BarChart2, show: true },
        {
          href: '/sms-activity', label: 'Engage', icon: MessageCircle, show: true,
          badge: smsUnread > 0 ? { text: smsUnread > 99 ? '99+' : String(smsUnread), bg: '', color: '#fff' } : undefined,
          lockTag: !isPaidPlan(props.plan) ? 'GROWTH' : undefined,
        },
      ],
    },
    {
      label: 'Configure',
      items: [
        { href: '/catalog', label: 'Services', icon: FileText, show: true },
        // AI Receptionist hub (voice/greeting/FAQ/escalation/hours).
        { href: '/train', label: 'AI Receptionist', icon: Bot, show: isManagerOrOwner },
        { href: '/billing', label: 'Billing', icon: CreditCard, show: isOwner },
        { href: '/settings', label: 'Settings', icon: Settings, show: isManagerOrOwner },
        // Conditional paid features — not part of the core design's 10 items,
        // shown only when the business has actually enabled them so paying
        // customers don't lose access.
        { href: '/dispatch', label: 'Dispatch Board', icon: ClipboardList, show: !!props.hasDispatch },
        { href: '/command-centre', label: 'Command Centre', icon: MessageSquare, show: !!props.hasCommandCentre },
        { href: '/account/white-label', label: 'White Label', icon: Palette, show: !!props.isWhiteLabelPartner && isOwner },
      ],
    },
  ]

  function NavLink(item: { href: string; label: string; icon: React.ComponentType<{ size?: number }>; badge?: { text: string; bg: string; color: string }; locked?: boolean; lockReason?: string; lockTag?: 'PRO' | 'GROWTH' }) {
    const Icon = item.icon
    const active = pathname === item.href || pathname.startsWith(item.href + '/')
    const isHovering = hovering === item.href

    // Determine badge style: orange pill (DM Mono) for sms/call counts,
    // blue pill (.nbadge style) for callbacks/blue-tinted counts.
    // The badge.bg/color from the sections array still drives the color
    // so existing behaviour is unchanged — we only restyle the pill shape.
    const isBlueBadge = item.badge?.color === '#4A9FE8'

    return (
      <button
        type="button"
        onClick={() => item.locked ? router.push('/billing') : go(item.href)}
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
          color: active ? 'var(--text)' : item.locked ? 'var(--dim)' : 'var(--dim)',
          boxShadow: active ? 'inset 2px 0 0 var(--orange)' : 'none',
          border: 'none',
          width: '100%',
          marginBottom: 2,
          transition: 'all 0.15s',
          textAlign: 'left',
        }}
      >
        <span style={{ color: active ? 'var(--orange)' : 'inherit', display: 'flex', alignItems: 'center', flexShrink: 0 }}>
          {item.locked ? <Lock size={15} /> : <Icon size={16} />}
        </span>
        <span style={{ flex: 1, color: active ? 'var(--text)' : 'var(--dim)' }}>{item.label}</span>
        {item.badge && (
          <span
            className="mono"
            style={{
              fontSize: 10,
              fontWeight: 700,
              padding: '2px 6px',
              borderRadius: 99,
              background: isBlueBadge ? 'var(--blue)' : 'var(--orange)',
              color: '#fff',
              flexShrink: 0,
            }}
          >
            {item.badge.text}
          </span>
        )}
        {item.locked && item.lockReason && (
          <span style={{
            fontSize: 9,
            fontWeight: 700,
            padding: '2px 6px',
            borderRadius: 99,
            background: 'rgba(240,120,50,.18)',
            color: 'var(--orange)',
            letterSpacing: '0.05em',
            flexShrink: 0,
          }}>
            {item.lockReason}
          </span>
        )}
        {item.lockTag && (
          <span style={{
            fontSize: 9,
            fontWeight: 700,
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.1)',
            color: 'var(--dim)',
            padding: '1px 5px',
            borderRadius: 4,
            letterSpacing: '0.05em',
            flexShrink: 0,
          }}>
            {item.lockTag}
          </span>
        )}
      </button>
    )
  }

  // Avatar initials for footer — first letter of business name
  const avatarLetter = (props.businessName[0] || 'T').toUpperCase()

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
          {/* Inline SVG logo — 34×34, gradient #f58a42→#e66020 per design spec §1d */}
          <svg width="34" height="34" viewBox="0 0 34 34" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <rect width="34" height="34" rx="8" fill="url(#tmG)" />
            <path d="M9 10.5h16v3H19V24h-4V13.5H9z" fill="white" />
            <path d="M23 27a4 4 0 0 1 0-6" stroke="rgba(255,255,255,.8)" strokeWidth="1.4" strokeLinecap="round" fill="none" />
            <path d="M20.5 29.5a7.5 7.5 0 0 1 0-11" stroke="rgba(255,255,255,.4)" strokeWidth="1.4" strokeLinecap="round" fill="none" />
            <defs>
              <linearGradient id="tmG" x1="0" y1="0" x2="34" y2="34" gradientUnits="userSpaceOnUse">
                <stop stopColor="#f58a42" />
                <stop offset="1" stopColor="#e66020" />
              </linearGradient>
            </defs>
          </svg>
          {/* Wordmark: "Talk" 800-weight text-token, "mate" 300-weight blue, 17px, tracking -.5px */}
          <span style={{ fontWeight: 800, fontSize: 17, color: 'var(--text)', letterSpacing: '-0.5px', lineHeight: 1 }}>
            Talk<span style={{ fontWeight: 300, color: '#4a9fe8' }}>mate</span>
          </span>
        </div>
        <button
          onClick={props.onCloseMobile}
          aria-label="Close menu"
          className="lg:hidden"
          style={{ background: 'transparent', border: 'none', color: 'var(--dim)', cursor: 'pointer', padding: 4, display: 'flex' }}
        >
          <X size={18} />
        </button>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: '12px 14px', overflowY: 'auto' }}>
        {sections.map((section, i) => (
          <div key={i} style={{ marginBottom: 14 }}>
            {/* Section label: 10px/700 uppercase tracking .12em text-faint (omitted for the main group) */}
            {section.label && (
              <div style={{
                fontSize: 10,
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.12em',
                color: 'var(--faint)',
                padding: '12px 12px 6px',
              }}>
                {section.label}
              </div>
            )}
            {section.items.filter(i => i.show).map(item => (
              <NavLink key={item.href + item.label} {...item} />
            ))}
          </div>
        ))}

      </nav>

      {/* Footer / sidefoot — avatar + business name + plan tier ONLY (per design §4).
          Plan price/usage/upgrade live on the Billing page; log out lives in the topbar avatar menu. */}
      <div style={{ padding: 14, borderTop: '1px solid var(--line)' }}>
        <div style={{
          background: 'var(--card)',
          border: '1px solid var(--line)',
          borderRadius: 13,
          padding: 11,
          boxShadow: '0 1px 3px rgba(0,0,0,.3)',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}>
          {/* Rounded-square gradient avatar with initials */}
          <div style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            background: 'linear-gradient(135deg,#f58a42,#e66020)',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 13,
            fontWeight: 700,
            flexShrink: 0,
          }}>
            {avatarLetter}
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {props.businessName}
            </div>
            <div style={{ fontSize: 11, color: 'var(--dim)' }}>
              {planConfig.label} plan
            </div>
          </div>
        </div>
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
        onClick={props.onCloseMobile}
        className="lg:hidden"
        style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 40,
          opacity: props.isOpenMobile ? 1 : 0, pointerEvents: props.isOpenMobile ? 'auto' : 'none',
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
          transform: props.isOpenMobile ? 'translateX(0)' : 'translateX(-100%)',
          transition: 'transform 0.25s ease',
        }}
      >
        {sidebarBody}
      </aside>
    </>
  )
}
