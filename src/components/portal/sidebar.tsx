'use client'

import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { getPlan } from '@/lib/plan'
import { useBusinessType } from '@/context/business-type-context'
import {
  LayoutDashboard, Phone, BarChart2, FileText, Settings, Calendar,
  MessageSquare, Star, MessageCircle, DollarSign, CreditCard, User as UserIcon,
  Lock, LogOut, Shield, X, Users, GitBranch, Palette,
  UserCheck, Crown, BookOpen, PhoneCall,
  Truck, Car, ClipboardList, Tag, MapPin, CalendarDays, HelpCircle,
  Inbox as InboxIcon, Sparkles, Globe,
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

// Session 16 -- plan gate helpers for sidebar nav badges.
function isProPlan(plan: string): boolean {
  return plan === 'pro'
}
function isPaidPlan(plan: string): boolean {
  return plan === 'growth' || isProPlan(plan)
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
  const isAdmin = props.userRole === 'admin'

  // Session 19 — fetch failed-SMS count for admin badge. Only kicks in
  // when the current user is an admin; otherwise the badge stays at 0.
  const [smsFailures, setSmsFailures] = useState(0)
  useEffect(() => {
    if (!isAdmin) return
    let cancelled = false
    fetch('/api/admin/sms-failures-count')
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (!cancelled && typeof d?.count === 'number') setSmsFailures(d.count) })
      .catch(() => { /* silent */ })
    return () => { cancelled = true }
  }, [isAdmin])

  // Sprint sprint 1 — Inbox unread badge. Subscribes to realtime so the
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
      // Session 16 -- muted plan-gate chip rendered with the
      // LOCKED_BADGE_STYLE. The nav item still navigates to the page
      // (which shows the locked preview); not the same as `locked`,
      // which is for "coming soon" items that route to /billing.
      lockTag?: 'PRO' | 'GROWTH'
      show: boolean
    }>
  }> = [
    {
      label: 'Overview',
      items: [
        { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, show: true },
        // Sprint Session 1 — Two-way SMS inbox. Growth+ feature per the
        // pricing matrix; Starter sees the locked tag but the page itself
        // still renders an upgrade prompt.
        {
          href: '/inbox', label: 'Inbox', icon: InboxIcon, show: true,
          badge: smsUnread > 0
            ? { text: smsUnread > 99 ? '99+' : String(smsUnread), bg: '#E8622A', color: '#FFFFFF' }
            : undefined,
          lockTag: !isPaidPlan(props.plan) ? 'GROWTH' : undefined,
        },
        {
          href: '/calls', label: 'Calls', icon: Phone, show: true,
          badge: props.todayCallCount > 0 ? { text: String(props.todayCallCount), bg: 'rgba(74,159,232,0.18)', color: '#4A9FE8' } : undefined,
        },
        // Session 14 — Quotes log sits between Calls and Contacts as
        // briefed. Visible on all plans so the empty state stays
        // self-explanatory ("upgrade to start quoting") rather than
        // disappearing on Starter.
        { href: '/quotes', label: 'Quotes', icon: Tag, show: true },
        // Session 15 — native scheduler. Position: between Quotes and
        // Bookings (which lives further down). Visible on all plans;
        // Starter sees a locked SMS row inside settings.
        { href: '/scheduler', label: 'Scheduler', icon: CalendarDays, show: true },
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
        // Session 19 — SMS Activity. Visible on all plans; Starter sees
        // an upgrade prompt at the destination page.
        {
          href: '/sms-activity', label: 'SMS Activity', icon: MessageCircle, show: true,
          lockTag: !isPaidPlan(props.plan) ? 'GROWTH' : undefined,
        },
        { href: '/contacts/pipeline', label: 'Pipeline', icon: GitBranch, show: !!props.hasPipeline },
        { href: '/catalog', label: 'Services & Menu', icon: FileText, show: true },
        // Sprint Session 1 — Train TalkMate is the self-service KB editor.
        // Available on every plan; the page itself shows a pending-sync
        // badge when the user has unsynced changes.
        { href: '/train', label: 'Train TalkMate', icon: Sparkles, show: isManagerOrOwner },
        // Sprint features 2 — AI Website Chatbot. Same manager/owner gating as
        // Train; the page itself renders a plan-locked upgrade prompt on Starter.
        { href: '/chatbot', label: 'Chatbot', icon: Globe, show: isManagerOrOwner },
        // Agent Settings + Call Routing are config — staff (view-only)
        // don't get a nav entry. They can still hit /calls etc.
        { href: '/settings', label: 'Agent Settings', icon: Settings, show: isManagerOrOwner },
        { href: '/settings/routing', label: 'Call Routing', icon: PhoneCall, show: isManagerOrOwner },
        // Session 14 — service area + quote config. Locked-state UI
        // is rendered server-side so we can keep it visible on Starter.
        { href: '/settings/service-area', label: 'Service Area', icon: MapPin, show: isManagerOrOwner },
        { href: '/appointments', label: 'Jobs', icon: Calendar, show: true },
      ],
    },
    {
      label: 'Receptionist',
      items: [
        { href: '/team', label: 'Team', icon: UserCheck, show: true },
        { href: '/vip-callers', label: 'VIP Callers', icon: Crown, show: true },
        { href: '/bookings', label: 'Bookings', icon: BookOpen, show: true },
        { href: '/callbacks', label: 'Callbacks', icon: PhoneCall, show: true },
      ],
    },
    {
      // Session 16 -- Dispatch is now always visible for towing clients.
      // Non-Pro clients land on the locked preview page rather than the
      // nav item disappearing on Starter/Growth.
      label: 'Dispatch',
      items: [
        // Dispatch Board: always shown for towing, with a PRO badge when
        // the client isn't on Pro. The page itself renders the locked
        // preview behind the scenes.
        {
          href: '/dispatch', label: 'Dispatch Board', icon: ClipboardList,
          show: props.industry === 'towing',
          lockTag: !isProPlan(props.plan) && props.industry === 'towing' ? 'PRO' : undefined,
        },
        { href: '/dispatch/drivers', label: 'Drivers', icon: UserCheck, show: !!props.hasDispatch },
        { href: '/dispatch/vehicles', label: 'Vehicles', icon: Truck, show: !!props.hasDispatch },
        { href: '/settings/dispatch', label: 'Dispatch Settings', icon: Car, show: !!props.hasDispatch },
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
        // Session 16 -- TalkMate Command is now always visible for
        // towing clients (Starter sees the locked preview). The
        // badge says GROWTH when the client isn't paid-tier.
        {
          href: '/settings/command',
          label: 'TalkMate Command',
          icon: MessageCircle,
          show: props.industry === 'towing',
          lockTag: !isPaidPlan(props.plan) && props.industry === 'towing' ? 'GROWTH' : undefined,
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
        // Billing is owner-only — managers and staff can't change the plan.
        { href: '/billing', label: 'Billing', icon: CreditCard, show: isOwner },
        { href: '/profile', label: 'My Profile', icon: UserIcon, show: true },
        // Security covers MFA, password, and (owner-only) staff invites.
        // Visible to everyone — staff can change their own password.
        { href: '/settings/security', label: 'Security', icon: Lock, show: true },
        // Top-level Settings link kept owner-only; Agent Settings already
        // lives under "Your Agent" for managers.
        { href: '/settings', label: 'Settings', icon: UserIcon, show: isOwner },
        { href: '/account/white-label', label: 'White Label', icon: Palette, show: !!props.isWhiteLabelPartner && isOwner },
        { href: '/admin', label: 'Admin', icon: Shield, show: isAdmin },
        { href: '/admin/audit-log', label: 'Audit Log', icon: FileText, show: isAdmin },
        {
          href: '/admin/sms-failures', label: 'SMS Failures', icon: MessageCircle, show: isAdmin,
          badge: smsFailures > 0
            ? { text: String(smsFailures), bg: 'rgba(239,68,68,0.18)', color: '#EF4444' }
            : undefined,
        },
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
        {sections.map(section => (
          <div key={section.label} style={{ marginBottom: 14 }}>
            {/* Section label: 10px/700 uppercase tracking .12em text-faint */}
            <div style={{
              fontSize: 10,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.12em',
              color: 'var(--faint)',
              padding: '4px 12px 6px',
            }}>
              {section.label}
            </div>
            {section.items.filter(i => i.show).map(item => (
              <NavLink key={item.href + item.label} {...item} />
            ))}
          </div>
        ))}

        {/* Help — mailto link, rendered outside the section loop because
            Next.js <Link>/router.push don't handle mailto: URLs. Never
            highlights as active since no route matches. */}
        <a
          href="mailto:hello@talkmate.com.au?subject=TalkMate%20Portal%20Help"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 11,
            padding: '9px 12px',
            borderRadius: 10,
            fontSize: 13.5,
            fontWeight: 500,
            cursor: 'pointer',
            background: 'transparent',
            color: 'var(--dim)',
            border: 'none',
            width: '100%',
            marginBottom: 2,
            textDecoration: 'none',
            boxSizing: 'border-box',
          }}
        >
          <HelpCircle size={16} />
          <span style={{ flex: 1 }}>Help</span>
        </a>
      </nav>

      {/* Footer / sidefoot */}
      <div style={{ padding: 14, borderTop: '1px solid var(--line)' }}>
        {/* Plan card — bg-card, border-line, rounded-[12px], shadow per spec §1d */}
        <div style={{
          background: 'var(--card)',
          border: '1px solid var(--line)',
          borderRadius: 12,
          padding: 12,
          marginBottom: 10,
          boxShadow: '0 1px 3px rgba(0,0,0,.3)',
        }}>
          {/* "Current plan" label */}
          <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--faint)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }}>
            Current plan
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--orange)' }}>{planConfig.label}</span>
            <span style={{ fontSize: 11, color: 'var(--dim)' }}>${planConfig.monthlyPrice}/mo</span>
          </div>
          <div style={{ fontSize: 11, color: 'var(--dim)' }}>
            {planConfig.callLimit ? `${props.callsThisMonth} / ${planConfig.callLimit} calls used` : `${props.callsThisMonth} calls -- unlimited plan`}
          </div>
          {planConfig.callLimit && (
            <div style={{ height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 2, marginTop: 8, overflow: 'hidden' }}>
              <div style={{
                width: `${Math.min(100, Math.round((props.callsThisMonth / planConfig.callLimit) * 100))}%`,
                height: '100%',
                background: props.callsThisMonth / planConfig.callLimit > 0.8 ? 'var(--red)' : 'var(--orange)',
                borderRadius: 2,
              }} />
            </div>
          )}
          {planConfig.key === 'starter' && (
            <a
              href={process.env.NEXT_PUBLIC_STRIPE_GROWTH_LINK || '/billing'}
              style={{
                display: 'block', marginTop: 10, width: '100%',
                background: 'linear-gradient(135deg,#f58a42,#e86526)',
                color: 'white', border: 'none',
                padding: '8px 12px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                textDecoration: 'none', textAlign: 'center', boxSizing: 'border-box',
              }}
            >
              Upgrade to Growth →
            </a>
          )}
          {planConfig.key === 'growth' && (
            <a
              href={process.env.NEXT_PUBLIC_STRIPE_PRO_LINK || '/billing'}
              style={{
                display: 'block', marginTop: 10, width: '100%',
                background: 'linear-gradient(135deg,#f58a42,#e86526)',
                color: 'white', border: 'none',
                padding: '8px 12px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                textDecoration: 'none', textAlign: 'center', boxSizing: 'border-box',
              }}
            >
              Upgrade to Pro →
            </a>
          )}
          {planConfig.key === 'pro' && (
            <div style={{ marginTop: 10, fontSize: 11, color: 'var(--dim)', textAlign: 'center', fontStyle: 'italic' }}>
              You are on our top plan
            </div>
          )}
        </div>

        {/* Avatar + business name + email */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
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
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 160 }}>
              {props.businessName}
            </div>
            <div title={props.userEmail} style={{ fontSize: 10, color: 'var(--faint)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 160 }}>
              {props.userEmail}
            </div>
          </div>
        </div>

        {/* Log out button */}
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
