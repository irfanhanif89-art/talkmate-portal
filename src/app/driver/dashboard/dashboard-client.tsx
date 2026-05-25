'use client'

// Sessions 36-37 — dashboard client shell.
// Renders driver header, stat cards, optional active-job card, and
// the recent-completed list. Phase 4 wired in useDriverLocationBroadcast
// so the dispatcher map updates while the driver is online.

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { DriverShell } from '@/components/driver/DriverShell'
import { LocationConsentModal } from '@/components/driver/LocationConsentModal'
import { useDriverLocationBroadcast } from '@/hooks/useDriverLocationBroadcast'
import type { DriverRow } from '@/lib/driver-auth'

interface ActiveJob {
  id: string
  job_number: string | null
  job_type: string
  status: string
  pickup_address: string
  response_deadline: string | null
  driver_eta_mins: number | null
  customer_name: string | null
  vehicle_make: string | null
  vehicle_model: string | null
  vehicle_rego: string | null
}

interface CompletedJob {
  id: string
  job_number: string | null
  job_type: string
  completed_at: string | null
  final_amount: number | string | null
  payment_collected: boolean
  pickup_address: string
}

interface Props {
  driver: DriverRow
  businessName: string
  activeJob: ActiveJob | null
  completedToday: CompletedJob[]
  stats: { jobs_today: number; earnings_today: number }
}

const BRAND = {
  orange: '#E8622A',
  navy: '#061322',
  blue: '#1565C0',
  green: '#22C55E',
  grey: '#6b7280',
  card: '#ffffff',
}

const JOB_TYPE_LABELS: Record<string, string> = {
  tow: 'Tow',
  roadside: 'Roadside assist',
  accident_recovery: 'Accident recovery',
  impound_release: 'Impound release',
  winch: 'Winch recovery',
  battery_jump: 'Battery jump',
  tyre_change: 'Tyre change',
  fuel_delivery: 'Fuel delivery',
  lockout: 'Lockout',
  other: 'Other',
}

const STATUS_LABELS: Record<string, string> = {
  driver_notified: 'Awaiting your response',
  accepted: 'Accepted',
  en_route: 'En route to pickup',
  on_scene: 'On scene',
  loaded: 'Vehicle loaded',
  in_transit: 'In transit to dropoff',
  at_dropoff: 'At dropoff',
}

export function DriverDashboardClient({
  driver: initialDriver,
  businessName,
  activeJob,
  completedToday,
  stats,
}: Props) {
  const router = useRouter()
  const [driver, setDriver] = useState(initialDriver)
  const [consentOpen, setConsentOpen] = useState(driver.location_consent_at == null)

  // Only broadcast GPS when: driver is online + consent given.
  useDriverLocationBroadcast({
    driverId: driver.id,
    clientId: driver.client_id,
    isOnline: driver.is_online && driver.location_consent_at != null,
    activeJobId: activeJob?.id ?? null,
  })

  async function acceptConsent() {
    const res = await fetch('/api/driver/me', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ location_consent: true }),
    })
    if (res.ok) {
      const data = await res.json()
      setDriver(data.driver)
      setConsentOpen(false)
    }
  }

  return (
    <DriverShell
      driver={driver}
      businessName={businessName}
      onStatusChanged={(isOnline) => setDriver({ ...driver, is_online: isOnline })}
    >
      <LocationConsentModal open={consentOpen} onAccept={acceptConsent} />

      {/* Active job */}
      {activeJob && (
        <Link
          href={`/driver/job/${activeJob.id}`}
          style={{
            display: 'block',
            background: BRAND.orange,
            color: '#fff',
            padding: 18,
            borderRadius: 14,
            textDecoration: 'none',
            marginBottom: 16,
            boxShadow: '0 4px 16px rgba(232, 98, 42, 0.25)',
          }}
        >
          <div style={{ fontSize: 12, opacity: 0.85, fontWeight: 600 }}>
            ACTIVE JOB · {activeJob.job_number ?? ''}
          </div>
          <div style={{ fontSize: 22, fontWeight: 700, marginTop: 4 }}>
            {STATUS_LABELS[activeJob.status] ?? activeJob.status}
          </div>
          <div style={{ fontSize: 15, opacity: 0.95, marginTop: 6 }}>
            {JOB_TYPE_LABELS[activeJob.job_type] ?? activeJob.job_type} · {activeJob.pickup_address}
          </div>
          <div style={{ fontSize: 13, opacity: 0.85, marginTop: 10, fontWeight: 600 }}>
            TAP TO CONTINUE →
          </div>
        </Link>
      )}

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, marginBottom: 16 }}>
        <StatCard label="Jobs today" value={String(stats.jobs_today)} />
        <StatCard
          label="Earnings today"
          value={`$${stats.earnings_today.toFixed(2)}`}
          accent={BRAND.green}
        />
      </div>

      {/* Recent completed */}
      <SectionHeader>Recent completed</SectionHeader>
      {completedToday.length === 0 ? (
        <EmptyState>No jobs completed yet today. When jobs are assigned to you, they will appear here.</EmptyState>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {completedToday.map((j) => (
            <Link
              key={j.id}
              href={`/driver/job/${j.id}`}
              style={{
                background: BRAND.card,
                padding: 14,
                borderRadius: 10,
                border: '1px solid #e5e7eb',
                textDecoration: 'none',
                color: BRAND.navy,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 12,
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12, color: BRAND.grey, fontWeight: 600 }}>
                  {j.job_number} · {JOB_TYPE_LABELS[j.job_type] ?? j.job_type}
                </div>
                <div style={{
                  fontSize: 14,
                  marginTop: 2,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}>
                  {j.pickup_address}
                </div>
              </div>
              <div style={{ fontSize: 15, fontWeight: 700, color: j.payment_collected ? BRAND.green : BRAND.grey }}>
                {j.final_amount != null ? `$${Number(j.final_amount).toFixed(0)}` : '—'}
              </div>
            </Link>
          ))}
        </div>
      )}
    </DriverShell>
  )
}

function StatCard({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div style={{
      background: '#fff',
      padding: 14,
      borderRadius: 12,
      border: '1px solid #e5e7eb',
    }}>
      <div style={{ fontSize: 12, color: '#6b7280', fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700, color: accent ?? '#061322', marginTop: 4 }}>
        {value}
      </div>
    </div>
  )
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 12,
      fontWeight: 700,
      color: '#6b7280',
      textTransform: 'uppercase',
      letterSpacing: '0.05em',
      marginBottom: 8,
      marginTop: 4,
    }}>{children}</div>
  )
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      background: '#fff',
      padding: 18,
      borderRadius: 10,
      border: '1px dashed #d1d5db',
      color: '#6b7280',
      fontSize: 14,
      textAlign: 'center',
    }}>{children}</div>
  )
}
