import { redirect } from 'next/navigation'
import Link from 'next/link'
import { requireAdmin } from '@/lib/admin-auth'
import { createAdminClient } from '@/lib/supabase/server'
import OnboardingWizard from '@/components/admin/OnboardingWizard'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Onboarding Wizard — TalkMate Admin' }

interface Props {
  params: Promise<{ id: string }>
  searchParams: Promise<{ type?: string }>
}

export default async function OnboardingWizardPage({ params, searchParams }: Props) {
  const auth = await requireAdmin()
  if (!auth.ok) redirect('/login')

  const { id } = await params
  const { type: rawType } = await searchParams
  const type: 'lead' | 'business' = rawType === 'business' ? 'business' : 'lead'

  const admin = createAdminClient()

  if (type === 'lead') {
    const { data: lead } = await admin
      .from('leads')
      .select('id, business_name, contact_name, phone, email, industry, suburb, state, website, notes, won_plan, won_billing_cycle')
      .eq('id', id)
      .maybeSingle()

    if (!lead) {
      return <NotFound href="/admin/onboarding-queue" />
    }

    return (
      <div style={pageStyle}>
        <Breadcrumb name={lead.business_name} />
        <OnboardingWizard
          mode="lead"
          adminEmail={auth.user.email ?? 'admin'}
          lead={{
            id: lead.id,
            business_name: lead.business_name ?? '',
            contact_name: lead.contact_name,
            phone: lead.phone,
            email: lead.email,
            industry: lead.industry,
            suburb: lead.suburb,
            state: lead.state,
            website: lead.website,
            notes: lead.notes,
            won_plan: lead.won_plan,
            won_billing_cycle: lead.won_billing_cycle,
          }}
        />
      </div>
    )
  }

  // mode === 'business' — load existing business
  const { data: business } = await admin
    .from('businesses')
    .select('id, name, phone_number, email, address, abn, website, industry, trade_type, timezone, plan, billing_cycle, account_status, welcome_email_sent, temp_password, owner_user_id, vapi_agent_id')
    .eq('id', id)
    .maybeSingle()

  if (!business) {
    return <NotFound href="/admin/onboarding-queue" />
  }

  // Stamp onboarding_started_at if missing
  await admin.from('businesses').update({
    onboarding_started_at: new Date().toISOString(),
  }).eq('id', business.id).is('onboarding_started_at', null)

  return (
    <div style={pageStyle}>
      <Breadcrumb name={business.name ?? ''} />
      <OnboardingWizard
        mode="business"
        adminEmail={auth.user.email ?? 'admin'}
        business={{
          id: business.id,
          name: business.name ?? '',
          phone_number: business.phone_number,
          email: business.email,
          address: business.address,
          abn: business.abn,
          website: business.website,
          industry: business.industry,
          trade_type: business.trade_type,
          timezone: business.timezone,
          plan: business.plan,
          billing_cycle: business.billing_cycle,
          account_status: business.account_status ?? '',
          welcome_email_sent: Boolean(business.welcome_email_sent),
          temp_password: business.temp_password,
          owner_user_id: business.owner_user_id,
          has_agent: Boolean(business.vapi_agent_id),
        }}
      />
    </div>
  )
}

function Breadcrumb({ name }: { name: string }) {
  return (
    <div style={{ marginBottom: 18, fontSize: 13 }}>
      <Link href="/admin/onboarding-queue" style={{ color: '#4A9FE8', textDecoration: 'none' }}>
        Onboarding Queue
      </Link>
      <span style={{ color: '#4A7FBB', margin: '0 8px' }}>/</span>
      <span style={{ color: 'white', fontWeight: 700 }}>{name}</span>
    </div>
  )
}

function NotFound({ href }: { href: string }) {
  return (
    <div style={pageStyle}>
      <div style={{ color: '#7BAED4', fontSize: 14 }}>
        Not found. <Link href={href} style={{ color: '#E8622A' }}>Back to queue</Link>
      </div>
    </div>
  )
}

const pageStyle: React.CSSProperties = {
  padding: '32px 28px', fontFamily: 'Outfit, sans-serif', maxWidth: 920,
}
