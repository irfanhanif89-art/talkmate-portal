import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/server'
import {
  validateDemoPortalToken,
  getDemoBusinessId,
  getDemoIndustry,
} from '@/lib/demo-config'
import DemoTokenInvalid from '../_components/DemoTokenInvalid'

interface PageProps {
  params: Promise<{ industry: string }>
  searchParams: Promise<{ token?: string }>
}

type ServiceItem = {
  id: string
  name: string
  description: string
  price: number
  duration_minutes: number
  active: boolean
}

type BusinessRow = {
  services: ServiceItem[] | null
}

const CARD: React.CSSProperties = {
  background: '#0A1E38',
  border: '1px solid rgba(255,255,255,0.06)',
  borderRadius: 12,
  padding: 22,
  fontFamily: "'Outfit', system-ui, sans-serif",
}

export default async function DemoServicesPage({ params, searchParams }: PageProps) {
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

  const { data: business } = await supabase
    .from('businesses')
    .select('services')
    .eq('id', businessId)
    .single<BusinessRow>()

  const services: ServiceItem[] = business?.services ?? []

  return (
    <div style={{ fontFamily: "'Outfit', system-ui, sans-serif" }}>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ color: '#ffffff', fontSize: 28, fontWeight: 700, margin: 0 }}>
          Services
        </h1>
        <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: 14, margin: '6px 0 0' }}>
          What your receptionist can book or quote.
        </p>
      </div>

      {/* Service cards */}
      {services.length === 0 ? (
        <div style={CARD}>
          <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: 13, margin: 0 }}>
            No services configured.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {services.map((svc) => (
            <div key={svc.id} style={CARD}>
              {/* Name + active toggle */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 8,
                }}
              >
                <span style={{ color: '#ffffff', fontSize: 16, fontWeight: 600 }}>
                  {svc.name}
                </span>
                {/* Visual-only active toggle */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12 }}>
                    {svc.active ? 'Active' : 'Inactive'}
                  </span>
                  <div
                    style={{
                      width: 36,
                      height: 20,
                      borderRadius: 10,
                      background: svc.active ? '#10B981' : 'rgba(255,255,255,0.15)',
                      position: 'relative',
                      cursor: 'default',
                    }}
                  >
                    <div
                      style={{
                        position: 'absolute',
                        top: 3,
                        left: svc.active ? 19 : 3,
                        width: 14,
                        height: 14,
                        borderRadius: '50%',
                        background: '#ffffff',
                        transition: 'left 0.2s',
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* Description */}
              <p
                style={{
                  color: 'rgba(255,255,255,0.5)',
                  fontSize: 14,
                  margin: '0 0 12px',
                  lineHeight: 1.5,
                }}
              >
                {svc.description}
              </p>

              {/* Price + duration chips */}
              <div style={{ display: 'flex', gap: 8 }}>
                <span
                  style={{
                    background: 'rgba(232,98,42,0.12)',
                    color: '#E8622A',
                    fontSize: 12,
                    fontWeight: 600,
                    padding: '3px 10px',
                    borderRadius: 6,
                  }}
                >
                  ${svc.price}
                </span>
                <span
                  style={{
                    background: 'rgba(255,255,255,0.07)',
                    color: 'rgba(255,255,255,0.6)',
                    fontSize: 12,
                    fontWeight: 500,
                    padding: '3px 10px',
                    borderRadius: 6,
                  }}
                >
                  {svc.duration_minutes} min
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Demo mode note */}
      <p
        style={{
          color: 'rgba(255,255,255,0.25)',
          fontSize: 12,
          marginTop: 20,
          textAlign: 'center',
        }}
      >
        Service changes in demo mode reset every 4 hours.
      </p>
    </div>
  )
}
