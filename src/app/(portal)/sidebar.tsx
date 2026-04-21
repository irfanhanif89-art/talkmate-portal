'use client'

import { useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { BUSINESS_TYPE_CONFIG, type BusinessType } from '@/lib/business-types'
import {
  LayoutDashboard, Phone, BookOpen, Calendar, BarChart2,
  Settings, CreditCard, Shield, LogOut, TrendingUp, Lock,
  Star, MessageSquare, PhoneOutgoing, Building2, X,
} from 'lucide-react'

interface Props {
  businessName: string
  businessType: BusinessType
  userEmail: string
  userRole: string
  onboardingCompleted: boolean
}

const PRO_ITEMS = [
  {
    label: 'Star Review Requests',
    icon: Star,
    price: 49,
    features: [
      'Automated SMS review requests after every call',
      'Google & Facebook review deep links',
      'Customer name personalisation',
      'Review response templates',
      'Monthly review performance report',
    ],
  },
  {
    label: 'SMS Follow-Ups',
    icon: MessageSquare,
    price: 49,
    features: [
      'Auto-SMS sent after every missed or transferred call',
      'Custom message templates per call type',
      'Two-way reply inbox',
      'Opt-out compliance (Spam Act 2003)',
      'Campaign drip sequences',
    ],
  },
  {
    label: 'Outbound AI Calls',
    icon: PhoneOutgoing,
    price: 79,
    features: [
      'AI proactively calls your leads & customers',
      'Appointment confirmation & reminder calls',
      'Quote follow-up campaigns',
      'Voice drop messages',
      'Full call transcripts & outcomes',
    ],
  },
  {
    label: 'Multi-Location',
    icon: Building2,
    price: 99,
    features: [
      'Manage up to 10 business locations',
      'Separate AI agents per location',
      'Centralised reporting dashboard',
      'Shared knowledge base across locations',
      'Location-specific routing & hours',
    ],
  },
]

export default function PortalSidebar({ businessName, businessType, userEmail, userRole, onboardingCompleted }: Props) {
  const pathname = usePathname()
  const router = useRouter()
  const config = BUSINESS_TYPE_CONFIG[businessType]
  const [modal, setModal] = useState<typeof PRO_ITEMS[0] | null>(null)

  const navItems = [
    { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, show: true },
    { href: '/calls', label: 'Calls', icon: Phone, show: true },
    { href: '/catalog', label: config.catalogLabel, icon: BookOpen, show: true },
    {
      href: '/appointments',
      label: config.hasJobDispatch ? 'Jobs' : 'Appointments',
      icon: Calendar,
      show: config.hasAppointments || config.hasJobDispatch,
    },
    { href: '/analytics', label: 'Analytics', icon: BarChart2, show: true },
    { href: '/settings', label: 'Settings', icon: Settings, show: true },
    { href: '/billing', label: 'Billing', icon: CreditCard, show: true },
    { href: '/admin', label: 'Admin', icon: Shield, show: userRole === 'admin' },
  ]

  async function logout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  const initials = businessName.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)

  function NavLink({ href, label, Icon }: { href: string; label: string; Icon: React.ElementType }) {
    const active = pathname === href || pathname.startsWith(href + '/')
    return (
      <a href={href} style={{
        display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px',
        borderRadius: 10, fontSize: 14, fontWeight: 500, cursor: 'pointer',
        background: active ? 'rgba(232,98,42,0.13)' : 'transparent',
        color: active ? '#E8622A' : '#7BAED4',
        border: active ? '1px solid rgba(232,98,42,0.22)' : '1px solid transparent',
        textDecoration: 'none', marginBottom: 2, transition: 'all 0.15s',
      }}>
        <Icon size={17} />
        {label}
      </a>
    )
  }

  return (
    <>
      {/* Desktop sidebar */}
      <aside style={{
        width: 240, background: '#071829', borderRight: '1px solid rgba(255,255,255,0.06)',
        display: 'flex', flexDirection: 'column', height: '100vh', flexShrink: 0,
      }} className="hidden md:flex">

        {/* Logo */}
        <div style={{ padding: '22px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 34, height: 34, background: '#E8622A', borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg viewBox="0 0 36 36" width="20" height="20" fill="none">
                <rect x="6" y="8" width="24" height="5" rx="2.5" fill="white"/>
                <rect x="14" y="8" width="8" height="22" rx="2.5" fill="white"/>
              </svg>
            </div>
            <span style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 800, letterSpacing: '-0.5px', color: 'white', fontSize: '1.15rem' }}>
              talk<span style={{ fontWeight: 300, letterSpacing: '3px', color: '#4A9FE8' }}>mate</span>
            </span>
          </div>
        </div>

        {/* Onboarding warning */}
        {!onboardingCompleted && (
          <a href="/onboarding" style={{
            margin: '12px 12px 0', padding: '10px 14px', borderRadius: 10, fontSize: 12, fontWeight: 600,
            display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(232,98,42,0.13)',
            color: '#E8622A', border: '1px solid rgba(232,98,42,0.28)', textDecoration: 'none',
          }}>⚡ Complete your setup →</a>
        )}

        {/* Nav */}
        <nav style={{ flex: 1, padding: 12, overflowY: 'auto' }}>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgba(255,255,255,0.25)', padding: '10px 14px 6px' }}>Main</div>
          {navItems.filter(i => i.show && !['Settings', 'Billing', 'Admin'].includes(i.label)).map(item => (
            <NavLink key={item.href} href={item.href} label={item.label} Icon={item.icon} />
          ))}

          {/* Grow — locked PRO section */}
          <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgba(255,255,255,0.25)', padding: '0 14px 6px' }}>
              <TrendingUp size={11} /> Grow
            </div>
            {PRO_ITEMS.map(item => {
              const Icon = item.icon
              return (
                <button key={item.label} type="button" onClick={() => setModal(item)} style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderRadius: 10,
                  fontSize: 14, fontWeight: 500, cursor: 'pointer', background: 'transparent',
                  color: '#4A7FBB', border: 'none', width: '100%', marginBottom: 2,
                }}>
                  <Lock size={14} style={{ flexShrink: 0, color: '#4A7FBB' }} />
                  <span style={{ flex: 1, textAlign: 'left' }}>{item.label}</span>
                  <span style={{ fontSize: 9, background: 'rgba(232,98,42,0.2)', color: '#E8622A', padding: '2px 6px', borderRadius: 99, fontWeight: 800, letterSpacing: '0.05em' }}>PRO</span>
                </button>
              )
            })}
          </div>

          {/* Account */}
          <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgba(255,255,255,0.25)', padding: '0 14px 6px' }}>Account</div>
            {navItems.filter(i => i.show && ['Settings', 'Billing', 'Admin'].includes(i.label)).map(item => (
              <NavLink key={item.href} href={item.href} label={item.label} Icon={item.icon} />
            ))}
          </div>
        </nav>

        {/* User footer */}
        <div style={{ padding: 14, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'rgba(232,98,42,0.2)', color: '#E8622A', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, flexShrink: 0 }}>{initials}</div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'white', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{businessName}</div>
              <div style={{ fontSize: 11, color: '#4A7FBB', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{userEmail}</div>
            </div>
          </div>
          <button onClick={logout} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#4A7FBB', background: 'transparent', border: 'none', cursor: 'pointer', padding: '8px 14px', borderRadius: 8, width: '100%' }}>
            <LogOut size={15} /> Log out
          </button>
        </div>
      </aside>

      {/* Mobile bottom tab bar */}
      <nav className="md:hidden" style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 50, display: 'flex', background: '#071829', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
        {navItems.filter(i => i.show).slice(0, 5).map(item => {
          const active = pathname === item.href
          const Icon = item.icon
          return (
            <a key={item.href} href={item.href} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '10px 4px 6px', gap: 4, fontSize: 10, color: active ? '#E8622A' : '#4A7FBB', textDecoration: 'none' }}>
              <Icon size={20} />
              <span>{item.label}</span>
            </a>
          )
        })}
      </nav>

      {/* PRO Upgrade Modal */}
      {modal && (
        <div onClick={() => setModal(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.78)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#0A1E38', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 20, padding: 36, maxWidth: 440, width: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
              <div>
                <div style={{ fontSize: 40, marginBottom: 10 }}>🔒</div>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'white', margin: 0 }}>{modal.label}</h2>
                <p style={{ color: '#4A7FBB', fontSize: 13, margin: '4px 0 0' }}>Pro add-on feature</p>
              </div>
              <button onClick={() => setModal(null)} style={{ background: 'transparent', border: 'none', color: '#4A7FBB', cursor: 'pointer', padding: 4 }}>
                <X size={20} />
              </button>
            </div>

            <div style={{ background: '#071829', borderRadius: 14, padding: 18, marginBottom: 22 }}>
              {modal.features.map(f => (
                <div key={f} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 14, marginBottom: 10, color: '#e2e8f0', lineHeight: 1.4 }}>
                  <span style={{ color: '#E8622A', fontWeight: 700, flexShrink: 0, marginTop: 1 }}>✓</span>{f}
                </div>
              ))}
            </div>

            <div style={{ textAlign: 'center', marginBottom: 20 }}>
              <span style={{ fontSize: '2rem', fontWeight: 800, color: 'white' }}>${modal.price}</span>
              <span style={{ fontSize: 14, color: '#4A7FBB' }}>/mo add-on</span>
            </div>

            <a href="/billing" style={{ display: 'block', width: '100%', padding: '14px 0', background: '#E8622A', color: 'white', border: 'none', borderRadius: 12, fontSize: 15, fontWeight: 700, cursor: 'pointer', marginBottom: 10, textAlign: 'center', textDecoration: 'none' }}>
              Upgrade to Pro →
            </a>
            <button onClick={() => setModal(null)} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: '#4A7FBB', borderRadius: 12, fontSize: 14, cursor: 'pointer', width: '100%', padding: '10px 0' }}>
              Maybe later
            </button>
          </div>
        </div>
      )}
    </>
  )
}
