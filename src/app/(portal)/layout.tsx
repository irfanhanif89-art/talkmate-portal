import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { BusinessTypeProvider } from '@/context/business-type-context'
import { type BusinessType } from '@/lib/business-types'
import { getPlan } from '@/lib/plan'
import PortalShell from '@/components/portal/portal-shell'

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: business } = await supabase
    .from('businesses')
    .select('id, name, business_type, plan, onboarding_completed')
    .eq('owner_user_id', user.id)
    .single()

  if (!business) redirect('/register')

  const { data: userProfile } = await supabase
    .from('users')
    .select('role, full_name')
    .eq('id', user.id)
    .single()

  const planConfig = getPlan(business.plan)

  // Quick stats — used to render the sidebar plan card and the topbar badges.
  const startOfMonth = new Date()
  startOfMonth.setDate(1); startOfMonth.setHours(0, 0, 0, 0)
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0)

  const [{ count: callsThisMonth }, { count: todayCount }, { data: partner }, { data: changelogRows }] = await Promise.all([
    supabase.from('calls').select('id', { count: 'exact', head: true }).eq('business_id', business.id).gte('created_at', startOfMonth.toISOString()),
    supabase.from('calls').select('id', { count: 'exact', head: true }).eq('business_id', business.id).gte('created_at', todayStart.toISOString()),
    supabase.from('partners').select('id, pending_payout').eq('user_id', user.id).maybeSingle(),
    supabase.from('changelog').select('id, seen_by').order('published_at', { ascending: false }).limit(20),
  ])

  const { count: contactsTotal } = await supabase.from('contacts')
    .select('id', { count: 'exact', head: true })
    .eq('client_id', business.id).eq('is_merged', false)

  const partnerEarnings = partner?.pending_payout ?? 0
  const isPartner = !!partner

  const unseenChangelog = (changelogRows ?? []).filter(c => {
    const seen = (c.seen_by ?? []) as string[]
    return !seen.includes(user.id)
  }).length

  const userName = userProfile?.full_name || (user.user_metadata?.full_name as string) || ''

  return (
    <BusinessTypeProvider
      businessType={business.business_type as BusinessType}
      businessName={business.name}
      businessId={business.id}
    >
      <PortalShell
        businessName={business.name}
        userName={userName}
        userEmail={user.email ?? ''}
        userRole={userProfile?.role ?? 'owner'}
        plan={business.plan ?? 'starter'}
        callsThisMonth={callsThisMonth ?? 0}
        todayCallCount={todayCount ?? 0}
        contactsTotal={contactsTotal ?? 0}
        partnerEarningsThisMonth={partnerEarnings}
        isPartner={isPartner}
        hasCommandCentre={planConfig.hasCommandCentre}
        unseenChangelog={unseenChangelog}
      >
        {children}
      </PortalShell>
    </BusinessTypeProvider>
  )
}
