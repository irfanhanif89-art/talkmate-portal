import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/server'
import { getDemoIndustry, getDemoBusinessId } from '@/lib/demo-config'
import { DemoProvider } from './_components/DemoContext'
import DemoSidebar from './_components/DemoSidebar'

interface LayoutProps {
  params: Promise<{ industry: string }>
  children: React.ReactNode
}

type BusinessRow = {
  id: string
  name: string
  business_type: string | null
  industry: string | null
  phone_number: string | null
  address: string | null
  plan: string
  greeting: string | null
}

export default async function DemoLayout({ params, children }: LayoutProps) {
  const { industry } = await params

  // Industry guard
  const demoIndustry = getDemoIndustry(industry)
  if (!demoIndustry || !demoIndustry.available) {
    notFound()
  }

  // Business id guard
  const businessId = getDemoBusinessId(industry)
  if (!businessId) {
    notFound()
  }

  // Fetch business row via service role (no RLS)
  const supabase = createAdminClient()
  const { data: business, error } = await supabase
    .from('businesses')
    .select('id, name, business_type, industry, phone_number, address, plan, greeting')
    .eq('id', businessId)
    .single<BusinessRow>()

  if (error || !business) {
    notFound()
  }

  // Token is validated at the page level (searchParams is available there).
  // The sidebar reads the token from useSearchParams() on the client.
  // DemoProvider supplies businessId + businessName + industry to all child pages.
  return (
    <DemoProvider
      value={{
        businessId: business.id,
        businessName: business.name,
        industry,
        token: '',
      }}
    >
      {/* Fixed orange demo banner */}
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          height: 36,
          background: '#E8622A',
          zIndex: 50,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: "'Outfit', system-ui, sans-serif",
          fontSize: 12,
          fontWeight: 600,
          color: '#ffffff',
          letterSpacing: '0.01em',
        }}
      >
        DEMO MODE - This is a live preview of the TalkMate portal. Changes you make here are for demonstration purposes only.
      </div>

      {/* Left navigation sidebar (client component - reads token from URL via useSearchParams) */}
      <Suspense fallback={null}>
        <DemoSidebar industry={industry} />
      </Suspense>

      {/* Main content area: offset for sidebar + banner */}
      <main
        style={{
          paddingLeft: 220,
          paddingTop: 56,
          background: '#061322',
          minHeight: '100vh',
          fontFamily: "'Outfit', system-ui, sans-serif",
        }}
      >
        <div style={{ padding: 32 }}>
          {children}
        </div>
      </main>
    </DemoProvider>
  )
}
