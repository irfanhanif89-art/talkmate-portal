import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/server'
import {
  validateDemoPortalToken,
  getDemoBusinessId,
  getDemoIndustry,
} from '@/lib/demo-config'
import DemoTokenInvalid from '../_components/DemoTokenInvalid'
import { formatRelative, formatScheduled } from '../_components/format'

interface PageProps {
  params: Promise<{ industry: string }>
  searchParams: Promise<{ token?: string }>
}

type BookingRow = {
  id: string
  caller_name: string | null
  caller_phone: string
  truck_type: string | null
  description: string | null
  pickup_address: string | null
  dropoff_address: string | null
  scheduled_start: string | null
  status: string
  created_at: string
}

function statusStyle(status: string): { bg: string; fg: string } {
  const s = (status ?? '').toLowerCase()
  if (s === 'confirmed') return { bg: 'rgba(59,130,246,0.14)', fg: '#3B82F6' }
  if (s === 'completed') return { bg: 'rgba(16,185,129,0.14)', fg: '#10B981' }
  if (s === 'cancelled') return { bg: 'rgba(239,68,68,0.14)', fg: '#EF4444' }
  return { bg: 'rgba(148,163,184,0.14)', fg: '#94A3B8' }
}

const CARD: React.CSSProperties = {
  background: '#0A1E38',
  border: '1px solid rgba(255,255,255,0.06)',
  borderRadius: 12,
  padding: 22,
  fontFamily: "'Outfit', system-ui, sans-serif",
}

export default async function DemoBookingsPage({ params, searchParams }: PageProps) {
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

  const { data: bookings } = await supabase
    .from('bookings')
    .select(
      'id, caller_name, caller_phone, truck_type, description, pickup_address, dropoff_address, scheduled_start, status, created_at'
    )
    .eq('client_id', businessId)
    .order('created_at', { ascending: false })
    .returns<BookingRow[]>()

  const list = bookings ?? []

  return (
    <div style={{ fontFamily: "'Outfit', system-ui, sans-serif" }}>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ color: '#ffffff', fontSize: 28, fontWeight: 700, margin: 0 }}>
          Bookings
        </h1>
        <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: 14, margin: '6px 0 0' }}>
          Live jobs booked by the receptionist.
        </p>
      </div>

      {/* Booking cards */}
      {list.length === 0 ? (
        <div style={CARD}>
          <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: 13, margin: 0 }}>
            No bookings yet.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {list.map((booking) => {
            const { bg, fg } = statusStyle(booking.status)
            return (
              <div key={booking.id} style={CARD}>
                {/* Row 1: caller name + status badge */}
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: 10,
                  }}
                >
                  <span style={{ color: '#ffffff', fontSize: 15, fontWeight: 600 }}>
                    {booking.caller_name ?? booking.caller_phone}
                  </span>
                  <span
                    style={{
                      background: bg,
                      color: fg,
                      fontSize: 11,
                      fontWeight: 600,
                      padding: '3px 10px',
                      borderRadius: 6,
                      textTransform: 'capitalize',
                    }}
                  >
                    {booking.status}
                  </span>
                </div>

                {/* Truck type chip */}
                {booking.truck_type && (
                  <div style={{ marginBottom: 8 }}>
                    <span
                      style={{
                        background: 'rgba(232,98,42,0.12)',
                        color: '#E8622A',
                        fontSize: 11,
                        fontWeight: 600,
                        padding: '2px 8px',
                        borderRadius: 4,
                      }}
                    >
                      {booking.truck_type}
                    </span>
                  </div>
                )}

                {/* Description */}
                {booking.description && (
                  <p
                    style={{
                      color: 'rgba(255,255,255,0.5)',
                      fontSize: 13,
                      fontStyle: 'italic',
                      margin: '0 0 10px',
                      lineHeight: 1.4,
                    }}
                  >
                    {booking.description}
                  </p>
                )}

                {/* Route */}
                {(booking.pickup_address || booking.dropoff_address) && (
                  <p
                    style={{
                      color: 'rgba(255,255,255,0.65)',
                      fontSize: 13,
                      margin: '0 0 10px',
                    }}
                  >
                    {booking.pickup_address ?? 'Unknown pickup'}
                    {' -> '}
                    {booking.dropoff_address ?? 'Unknown dropoff'}
                  </p>
                )}

                {/* Scheduled start */}
                {booking.scheduled_start && (
                  <p style={{ color: '#ffffff', fontSize: 13, margin: '0 0 8px', fontWeight: 500 }}>
                    Scheduled:{' '}
                    <span style={{ color: '#E8622A' }}>
                      {formatScheduled(booking.scheduled_start)}
                    </span>
                  </p>
                )}

                {/* Footer */}
                <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 12, margin: 0 }}>
                  Booked {formatRelative(booking.created_at)}
                </p>
              </div>
            )
          })}
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
        Status changes in demo mode reset every 4 hours.
      </p>
    </div>
  )
}
