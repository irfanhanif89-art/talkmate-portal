import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { BusinessTypeProvider } from '@/context/business-type-context'
import { type BusinessType } from '@/lib/business-types'
import { getPlan } from '@/lib/plan'
import PortalShell from '@/components/portal/portal-shell'
import ImpersonationBanner from '@/components/portal/impersonation-banner'
import TrialBanner, { TrialExpiredOverlay } from '@/components/portal/trial-banner'
import PendingPaymentBanner from '@/components/portal/pending-payment-banner'

const ADMIN_EMAILS = ['hello@talkmate.com.au', 'irfanhanif89@gmail.com']

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Super-admin bypass — hello@talkmate.com.au has no business record.
  // Render a minimal shell so /admin pages work without a business context.
  if (user.email && ADMIN_EMAILS.includes(user.email)) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        {children}
      </div>
    )
  }

  // Fetch ALL business rows for this user, not just one. A single
  // owner can legitimately have multiple rows (e.g. admin created a
  // duplicate, cancelled one, kept the other active). `.single()`
  // throws when there's more than one row and the previous code
  // would redirect to /register — which middleware then bounced back
  // to /dashboard, infinite-looping the browser into "this page
  // couldn't load." (GM Towing hit this exact path.)
  //
  // Pick the highest-priority row: active > trial > pending >
  // pending_payment > suspended > expired > cancelled.
  const { data: bizList } = await supabase
    .from('businesses')
    .select('id, name, business_type, plan, onboarding_completed, industry, is_partner, dispatch_enabled, command_enabled, account_status, created_at')
    .eq('owner_user_id', user.id)

  const STATUS_PRIORITY = [
    'active', 'trial', 'pending', 'pending_payment', 'suspended', 'expired', 'cancelled',
  ]
  let business = (bizList ?? []).slice().sort((a, b) => {
    const ai = STATUS_PRIORITY.indexOf((a.account_status as string) ?? '')
    const bi = STATUS_PRIORITY.indexOf((b.account_status as string) ?? '')
    const aRank = ai === -1 ? STATUS_PRIORITY.length : ai
    const bRank = bi === -1 ? STATUS_PRIORITY.length : bi
    if (aRank !== bRank) return aRank - bRank
    // Tie-break on created_at descending — newer rows usually carry
    // the canonical state for the same owner.
    return new Date(b.created_at as string).getTime() - new Date(a.created_at as string).getTime()
  })[0]

  // Session 11 — if the user isn't an owner, they might be an invited
  // staff/manager. Resolve via staff_members and load the parent
  // business as if they owned it (RLS / API gates handle write
  // permissions separately based on the portalRole).
  let portalRole: 'owner' | 'manager' | 'staff' = 'owner'
  if (!business) {
    const { data: staffRow } = await supabase
      .from('staff_members')
      .select('client_id, role')
      .eq('auth_user_id', user.id)
      .eq('active', true)
      .maybeSingle()
    if (staffRow?.client_id) {
      const { data: staffBiz } = await supabase
        .from('businesses')
        .select('id, name, business_type, plan, onboarding_completed, industry, is_partner, dispatch_enabled, command_enabled, account_status, created_at')
        .eq('id', staffRow.client_id)
        .maybeSingle()
      if (staffBiz) {
        business = staffBiz
        portalRole = staffRow.role === 'manager' ? 'manager' : 'staff'
      }
    }
  }

  if (!business) {
    // Authenticated user but no business record at all. Don't redirect
    // to /register — middleware sends authenticated users back here
    // and we'd loop. Render a friendly screen so the page resolves
    // cleanly and the user can contact support.
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: '#061322', color: 'white', fontFamily: 'Outfit, sans-serif', padding: 24,
      }}>
        <div style={{
          maxWidth: 480, padding: 32, borderRadius: 16,
          background: '#0A1E38', border: '1px solid rgba(255,255,255,0.08)',
          textAlign: 'center' as const,
        }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0, marginBottom: 10 }}>
            Your account isn't fully set up yet
          </h1>
          <p style={{ fontSize: 14, color: '#7BAED4', lineHeight: 1.6, margin: 0, marginBottom: 18 }}>
            We can see your login but no business record is linked to it.
            This usually means setup is still in progress on our end.
            Please contact the TalkMate team and we'll sort it within minutes.
          </p>
          <a
            href="mailto:hello@talkmate.com.au"
            style={{
              display: 'inline-block', padding: '10px 20px', borderRadius: 9,
              background: '#E8622A', color: 'white', textDecoration: 'none',
              fontSize: 13, fontWeight: 700,
            }}
          >Email TalkMate support</a>
          <p style={{ fontSize: 11, color: '#7BAED4', marginTop: 14, marginBottom: 0 }}>
            Signed in as {user.email}
          </p>
        </div>
      </div>
    )
  }

  const { data: userProfile } = await supabase
    .from('users')
    .select('role, full_name')
    .eq('id', user.id)
    .single()

  const planConfig = getPlan(business.plan)

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
        portalRole={portalRole}
        plan={business.plan ?? 'starter'}
        callsThisMonth={callsThisMonth ?? 0}
        todayCallCount={todayCount ?? 0}
        contactsTotal={contactsTotal ?? 0}
        partnerEarningsThisMonth={partnerEarnings}
        isPartner={isPartner}
        hasCommandCentre={planConfig.hasCommandCentre}
        hasPipeline={['real_estate', 'trades', 'professional_services'].includes((business.industry as string | null) ?? '')}
        hasDispatch={Boolean((business as { dispatch_enabled?: boolean }).dispatch_enabled)}
        hasCommand={Boolean((business as { command_enabled?: boolean }).command_enabled)}
        industry={(business.industry as string | null) ?? null}
        isWhiteLabelPartner={Boolean((business as { is_partner?: boolean }).is_partner)}
        unseenChangelog={unseenChangelog}
      >
        <Suspense fallback={null}>
          <ImpersonationBanner businessName={business.name} />
        </Suspense>
        <TrialBanner />
        <PendingPaymentBanner />
        {children}
        <TrialExpiredOverlay />
      </PortalShell>
    </BusinessTypeProvider>
  )
}
