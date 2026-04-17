'use client'

import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { BUSINESS_TYPE_CONFIG, type BusinessType } from '@/lib/business-types'
import {
  LayoutDashboard, Phone, BookOpen, Calendar, BarChart2,
  Settings, CreditCard, Shield, LogOut
} from 'lucide-react'

interface Props {
  businessName: string
  businessType: BusinessType
  userEmail: string
  userRole: string
  onboardingCompleted: boolean
}

export default function PortalSidebar({ businessName, businessType, userEmail, userRole, onboardingCompleted }: Props) {
  const pathname = usePathname()
  const router = useRouter()
  const config = BUSINESS_TYPE_CONFIG[businessType]

  const navItems = [
    { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, show: true },
    { href: '/calls', label: 'Calls', icon: Phone, show: true },
    { href: '/catalog', label: config.catalogLabel, icon: BookOpen, show: true },
    { href: '/appointments', label: config.hasJobDispatch ? 'Jobs' : 'Appointments', icon: Calendar, show: config.hasAppointments || config.hasJobDispatch },
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

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden md:flex flex-col w-60 flex-shrink-0 border-r" style={{ background: '#071829', borderColor: 'rgba(255,255,255,0.06)' }}>
        {/* Logo */}
        <div className="flex items-center gap-3 px-5 py-5 border-b" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
          <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: '#E8622A' }}>
            <svg viewBox="0 0 36 36" width="26" height="26">
              <rect x="6" y="8" width="24" height="5" rx="2.5" fill="white"/>
              <rect x="14" y="8" width="8" height="22" rx="2.5" fill="white"/>
            </svg>
          </div>
          <div className="leading-none">
            <span style={{ fontFamily: 'Outfit,sans-serif', fontWeight: 800, letterSpacing: '-2px', color: 'white', fontSize: '1.2rem' }}>talk</span>
            <span style={{ fontFamily: 'Outfit,sans-serif', fontWeight: 300, letterSpacing: '4px', color: '#4A9FE8', fontSize: '1.2rem' }}>mate</span>
          </div>
        </div>

        {/* Onboarding warning */}
        {!onboardingCompleted && (
          <a href="/onboarding" className="mx-3 mt-3 p-3 rounded-lg text-xs font-semibold flex items-center gap-2" style={{ background: 'rgba(232,98,42,0.15)', color: '#E8622A', border: '1px solid rgba(232,98,42,0.3)' }}>
            ⚡ Complete setup →
          </a>
        )}

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-1">
          {navItems.filter(i => i.show).map(item => {
            const active = pathname === item.href || pathname.startsWith(item.href + '/')
            const Icon = item.icon
            return (
              <a key={item.href} href={item.href}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all"
                style={{
                  background: active ? 'rgba(232,98,42,0.15)' : 'transparent',
                  color: active ? '#E8622A' : '#7BAED4',
                  border: active ? '1px solid rgba(232,98,42,0.2)' : '1px solid transparent'
                }}>
                <Icon size={18} />
                {item.label}
              </a>
            )
          })}
        </nav>

        {/* User */}
        <div className="p-4 border-t" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0" style={{ background: 'rgba(232,98,42,0.2)', color: '#E8622A' }}>{initials}</div>
            <div className="overflow-hidden">
              <div className="text-sm font-semibold text-white truncate">{businessName}</div>
              <div className="text-xs truncate" style={{ color: '#4A7FBB' }}>{userEmail}</div>
            </div>
          </div>
          <button onClick={logout} className="flex items-center gap-2 text-sm w-full px-3 py-2 rounded-lg transition-colors" style={{ color: '#4A7FBB' }}>
            <LogOut size={16} /> Log out
          </button>
        </div>
      </aside>

      {/* Mobile bottom tab bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 flex border-t" style={{ background: '#071829', borderColor: 'rgba(255,255,255,0.1)' }}>
        {navItems.filter(i => i.show).slice(0, 5).map(item => {
          const active = pathname === item.href
          const Icon = item.icon
          return (
            <a key={item.href} href={item.href} className="flex-1 flex flex-col items-center py-3 gap-1 text-xs"
              style={{ color: active ? '#E8622A' : '#4A7FBB' }}>
              <Icon size={20} />
              <span>{item.label}</span>
            </a>
          )
        })}
      </nav>
    </>
  )
}
