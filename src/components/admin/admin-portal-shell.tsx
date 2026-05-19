'use client'

import { usePathname, useRouter } from 'next/navigation'
import {
  LayoutDashboard, Phone, FileText, Settings, MessageSquare,
  Lock, Users, PhoneCall, BookOpen,
  UserCheck, Crown, ClipboardList, ExternalLink, ArrowLeft,
  Tag, MapPin, CalendarDays, MessageCircle,
} from 'lucide-react'

interface NavItem {
  href: string
  label: string
  icon: React.ComponentType<{ size?: number }>
}

interface Section {
  label: string
  items: NavItem[]
}

const SECTIONS: Section[] = [
  {
    label: 'Overview',
    items: [
      { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { href: '/calls', label: 'Calls', icon: Phone },
      // Session 14 — quotes log + service area config.
      { href: '/quotes', label: 'Quotes', icon: Tag },
      // Session 15 — native scheduler with day + week views.
      { href: '/scheduler', label: 'Scheduler', icon: CalendarDays },
      // Session 19 — full client SMS log (admin-only view; shows all
      // status values, raw sms_type, twilio_sid).
      { href: '/sms-log', label: 'SMS Log', icon: MessageCircle },
    ],
  },
  {
    label: 'Your Agent',
    items: [
      { href: '/contacts', label: 'Contacts', icon: Users },
      { href: '/catalog', label: 'Services & Menu', icon: FileText },
      { href: '/settings', label: 'Agent Settings', icon: Settings },
      { href: '/settings/routing', label: 'Call Routing', icon: PhoneCall },
      { href: '/settings/service-area', label: 'Service Area', icon: MapPin },
    ],
  },
  {
    label: 'Receptionist',
    items: [
      { href: '/team', label: 'Team', icon: UserCheck },
      { href: '/vip-callers', label: 'VIP Callers', icon: Crown },
      { href: '/bookings', label: 'Bookings', icon: BookOpen },
      { href: '/callbacks', label: 'Callbacks', icon: PhoneCall },
    ],
  },
  {
    label: 'Operations',
    items: [
      { href: '/dispatch', label: 'Dispatch', icon: ClipboardList },
      { href: '/settings/command', label: 'Command Centre', icon: MessageSquare },
      { href: '/settings/security', label: 'Security & Access', icon: Lock },
    ],
  },
]

interface Props {
  clientId: string
  businessName: string
  children: React.ReactNode
}

export default function AdminPortalShell({ clientId, businessName, children }: Props) {
  const pathname = usePathname()
  const router = useRouter()
  const base = `/admin/clients/${clientId}/portal`

  // Determine which nav entry is active by stripping the admin prefix.
  const inner = pathname.startsWith(base) ? (pathname.slice(base.length) || '/dashboard') : '/dashboard'

  function go(href: string) {
    router.push(base + href)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', background: '#061322', color: '#F2F6FB', fontFamily: 'Outfit, sans-serif' }}>
      <AdminBanner businessName={businessName} onBack={() => router.push('/admin/clients')} />
      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        <aside style={{
          width: 240, flexShrink: 0, background: '#071829',
          borderRight: '1px solid rgba(255,255,255,0.06)',
          padding: '20px 12px', overflowY: 'auto',
        }}>
          <div style={{ padding: '0 8px 16px 8px', borderBottom: '1px solid rgba(255,255,255,0.06)', marginBottom: 14 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#F59E0B', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Admin Portal</div>
            <div style={{ fontSize: 14, fontWeight: 800, color: 'white', marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={businessName}>{businessName}</div>
          </div>
          {SECTIONS.map(section => (
            <div key={section.label} style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#4A7FBB', textTransform: 'uppercase', letterSpacing: '0.1em', padding: '0 8px', marginBottom: 6 }}>{section.label}</div>
              {section.items.map(item => {
                const Icon = item.icon
                const active = inner === item.href || inner.startsWith(item.href + '/')
                return (
                  <button
                    key={item.href}
                    onClick={() => go(item.href)}
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                      padding: '9px 10px', borderRadius: 8, marginBottom: 2,
                      background: active ? 'rgba(232,98,42,0.14)' : 'transparent',
                      color: active ? '#E8622A' : '#C8D8EA',
                      border: 'none', cursor: 'pointer',
                      fontFamily: 'Outfit, sans-serif', fontSize: 13,
                      fontWeight: active ? 700 : 500, textAlign: 'left' as const,
                    }}
                  >
                    <Icon size={15} />
                    <span>{item.label}</span>
                  </button>
                )
              })}
            </div>
          ))}
        </aside>
        <main style={{ flex: 1, minWidth: 0, overflowX: 'auto' }}>
          {children}
        </main>
      </div>
    </div>
  )
}

function AdminBanner({ businessName, onBack }: { businessName: string; onBack: () => void }) {
  return (
    <div style={{
      background: 'linear-gradient(90deg, #F59E0B, #D97706)',
      color: '#0A1E38',
      padding: '10px 22px',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      gap: 12, fontFamily: 'Outfit, sans-serif',
      boxShadow: '0 2px 12px rgba(245,158,11,0.4)',
      position: 'sticky' as const, top: 0, zIndex: 90,
    }}>
      <div style={{ fontSize: 13, fontWeight: 800 }}>
        Admin view — {businessName} — Changes are live
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <span style={{ fontSize: 11, fontWeight: 600, opacity: 0.85, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <ExternalLink size={11} /> Service-role mode (RLS bypassed)
        </span>
        <button
          onClick={onBack}
          style={{
            padding: '6px 14px', borderRadius: 8,
            background: 'rgba(10,30,56,0.85)', border: 'none',
            color: 'white', fontSize: 12, fontWeight: 700,
            cursor: 'pointer', fontFamily: 'Outfit, sans-serif',
            display: 'inline-flex', alignItems: 'center', gap: 6,
          }}
        >
          <ArrowLeft size={12} /> Back to Admin
        </button>
      </div>
    </div>
  )
}
