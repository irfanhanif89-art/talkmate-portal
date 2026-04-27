import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { BusinessTypeProvider } from '@/context/business-type-context'
import { type BusinessType } from '@/lib/business-types'
import PortalSidebar from './sidebar'

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: business } = await supabase
    .from('businesses')
    .select('id, name, business_type, onboarding_completed')
    .eq('owner_user_id', user.id)
    .single()

  if (!business) redirect('/register')

  const { data: userProfile } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single()

  return (
    <BusinessTypeProvider
      businessType={business.business_type as BusinessType}
      businessName={business.name}
      businessId={business.id}
    >
      <div className="flex h-screen overflow-hidden" style={{ background: '#061322' }}>
        <PortalSidebar
          businessName={business.name}
          businessType={business.business_type as BusinessType}
          userEmail={user.email ?? ''}
          userRole={userProfile?.role ?? 'owner'}
          onboardingCompleted={business.onboarding_completed}
        />
        <main className="flex-1 overflow-y-auto pb-20 lg:pb-0" style={{ background: '#061322' }}>
          {children}
        </main>
      </div>
    </BusinessTypeProvider>
  )
}
