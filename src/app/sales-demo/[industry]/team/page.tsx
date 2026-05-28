import { notFound } from 'next/navigation'
import {
  validateDemoPortalToken,
  getDemoBusinessId,
  getDemoIndustry,
} from '@/lib/demo-config'
import DemoTokenInvalid from '../_components/DemoTokenInvalid'
import DemoTeamSection from '../_components/DemoTeamSection'

interface PageProps {
  params: Promise<{ industry: string }>
  searchParams: Promise<{ token?: string }>
}

const CARD: React.CSSProperties = {
  background: '#0A1E38',
  border: '1px solid rgba(255,255,255,0.06)',
  borderRadius: 12,
  padding: 22,
  fontFamily: "'Outfit', system-ui, sans-serif",
}

export default async function DemoTeamPage({ params, searchParams }: PageProps) {
  const { industry } = await params
  const { token } = await searchParams

  if (!validateDemoPortalToken(token)) {
    return <DemoTokenInvalid />
  }

  const demoIndustry = getDemoIndustry(industry)
  if (!demoIndustry || !demoIndustry.available) notFound()
  const businessId = getDemoBusinessId(industry)
  if (!businessId) notFound()

  return (
    <div style={{ fontFamily: "'Outfit', system-ui, sans-serif" }}>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ color: '#ffffff', fontSize: 28, fontWeight: 700, margin: 0 }}>
          Team
        </h1>
        <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: 14, margin: '6px 0 0' }}>
          People who can access your TalkMate portal.
        </p>
      </div>

      {/* Member card */}
      <div style={CARD}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          {/* Avatar */}
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: '50%',
              background: 'rgba(232,98,42,0.18)',
              border: '1px solid rgba(232,98,42,0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <span
              style={{
                color: '#E8622A',
                fontSize: 14,
                fontWeight: 700,
                fontFamily: "'Outfit', system-ui, sans-serif",
              }}
            >
              DO
            </span>
          </div>

          {/* Details */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <p
              style={{
                color: '#ffffff',
                fontSize: 15,
                fontWeight: 600,
                margin: '0 0 2px',
              }}
            >
              Demo Owner
            </p>
            <p
              style={{
                color: 'rgba(255,255,255,0.45)',
                fontSize: 13,
                margin: 0,
              }}
            >
              owner@demo.talkmate.com.au
            </p>
          </div>

          {/* Role badge */}
          <span
            style={{
              background: 'rgba(59,130,246,0.14)',
              color: '#3B82F6',
              fontSize: 11,
              fontWeight: 600,
              padding: '3px 10px',
              borderRadius: 6,
              letterSpacing: '0.02em',
              flexShrink: 0,
            }}
          >
            Owner
          </span>
        </div>
      </div>

      {/* Client component handles invite modal */}
      <DemoTeamSection />
    </div>
  )
}
