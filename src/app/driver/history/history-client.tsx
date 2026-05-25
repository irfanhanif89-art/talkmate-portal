'use client'

import { useState } from 'react'
import Link from 'next/link'
import { DriverShell } from '@/components/driver/DriverShell'
import type { DriverRow } from '@/lib/driver-auth'

interface HistoryJob {
  id: string
  job_number: string | null
  job_type: string
  status: string
  completed_at: string | null
  final_amount: number | string | null
  payment_collected: boolean
  payment_collected_type: string | null
  pickup_address: string
  dropoff_address: string | null
  actual_distance_km: number | string | null
}

interface Props {
  driver: DriverRow
  businessName: string
  jobs: HistoryJob[]
  monthTotals: { jobs: number; distance_km: number; earnings: number }
}

const BRAND = {
  orange: '#E8622A',
  navy: '#061322',
  grey: '#6b7280',
  green: '#22C55E',
}

const JOB_TYPE_LABELS: Record<string, string> = {
  tow: 'Tow', roadside: 'Roadside', accident_recovery: 'Accident',
  impound_release: 'Impound', winch: 'Winch', battery_jump: 'Battery',
  tyre_change: 'Tyre', fuel_delivery: 'Fuel', lockout: 'Lockout',
  other: 'Other',
}

export function DriverHistoryClient({
  driver: initialDriver,
  businessName,
  jobs,
  monthTotals,
}: Props) {
  const [driver, setDriver] = useState(initialDriver)
  return (
    <DriverShell
      driver={driver}
      businessName={businessName}
      onStatusChanged={(isOnline) => setDriver({ ...driver, is_online: isOnline })}
    >
      <h1 style={{ fontSize: 22, fontWeight: 700, color: BRAND.navy, marginTop: 4, marginBottom: 16 }}>
        History
      </h1>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 20 }}>
        <Stat label="This month" value={String(monthTotals.jobs)} />
        <Stat label="Distance (km)" value={String(monthTotals.distance_km)} />
        <Stat label="Earnings" value={`$${monthTotals.earnings.toFixed(0)}`} accent={BRAND.green} />
      </div>

      {jobs.length === 0 ? (
        <div style={{
          background: '#fff', borderRadius: 10, border: '1px dashed #d1d5db',
          padding: 20, textAlign: 'center', color: BRAND.grey, fontSize: 14,
        }}>
          No completed jobs yet.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {jobs.map(j => (
            <Link
              key={j.id}
              href={`/driver/job/${j.id}`}
              style={{
                background: '#fff', padding: 14, borderRadius: 10,
                border: '1px solid #e5e7eb', textDecoration: 'none', color: BRAND.navy,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <div style={{ fontSize: 12, color: BRAND.grey, fontWeight: 600 }}>
                  {j.job_number} · {JOB_TYPE_LABELS[j.job_type] ?? j.job_type}
                </div>
                <div style={{ fontSize: 12, color: BRAND.grey }}>
                  {j.completed_at ? new Date(j.completed_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }) : ''}
                </div>
              </div>
              <div style={{
                fontSize: 14, marginTop: 4,
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}>
                {j.pickup_address}
                {j.dropoff_address ? ` → ${j.dropoff_address}` : ''}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
                <div style={{ fontSize: 13, color: BRAND.grey }}>
                  {j.actual_distance_km ? `${Number(j.actual_distance_km).toFixed(1)} km` : ''}
                  {j.payment_collected_type ? ` · ${j.payment_collected_type}` : ''}
                </div>
                <div style={{ fontSize: 15, fontWeight: 700, color: j.payment_collected ? BRAND.green : BRAND.grey }}>
                  {j.final_amount != null ? `$${Number(j.final_amount).toFixed(0)}` : '—'}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </DriverShell>
  )
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div style={{
      background: '#fff', padding: 12, borderRadius: 10,
      border: '1px solid #e5e7eb',
    }}>
      <div style={{ fontSize: 11, color: '#6b7280', fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: accent ?? '#061322', marginTop: 2 }}>
        {value}
      </div>
    </div>
  )
}
