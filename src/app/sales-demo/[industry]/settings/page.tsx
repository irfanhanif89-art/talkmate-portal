import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/server'
import {
  validateDemoPortalToken,
  getDemoBusinessId,
  getDemoIndustry,
} from '@/lib/demo-config'
import DemoTokenInvalid from '../_components/DemoTokenInvalid'
import DemoSettingsForm from '../_components/DemoSettingsForm'

interface PageProps {
  params: Promise<{ industry: string }>
  searchParams: Promise<{ token?: string }>
}

type BusinessRow = {
  id: string
  name: string
  phone_number: string | null
  address: string | null
  greeting: string | null
}

export default async function DemoSettingsPage({ params, searchParams }: PageProps) {
  const { industry } = await params
  const { token } = await searchParams

  if (!validateDemoPortalToken(token)) {
    return <DemoTokenInvalid />
  }

  const demoIndustry = getDemoIndustry(industry)
  if (!demoIndustry || !demoIndustry.available) notFound()
  const businessId = getDemoBusinessId(industry)
  if (!businessId) notFound()

  const supabase = createAdminClient()

  const { data: business, error } = await supabase
    .from('businesses')
    .select('id, name, phone_number, address, greeting')
    .eq('id', businessId)
    .single<BusinessRow>()

  if (error || !business) notFound()

  return (
    <div style={{ fontFamily: "'Outfit', system-ui, sans-serif" }}>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ color: '#ffffff', fontSize: 28, fontWeight: 700, margin: 0 }}>
          Settings
        </h1>
        <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: 14, margin: '6px 0 0' }}>
          Edit your business profile.
        </p>
      </div>

      <div
        style={{
          background: '#0A1E38',
          border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: 12,
          padding: 28,
          maxWidth: 540,
        }}
      >
        <DemoSettingsForm
          industry={industry}
          token={token ?? ''}
          initialName={business.name}
          initialPhone={business.phone_number ?? ''}
          initialAddress={business.address ?? ''}
          initialGreeting={business.greeting ?? ''}
        />
      </div>
    </div>
  )
}
