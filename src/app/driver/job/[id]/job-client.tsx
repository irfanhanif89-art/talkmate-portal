'use client'

// Sessions 36-37 — driver job lifecycle UI.
//
// One component, status-switched rendering. Stages:
//   driver_notified → Accept / Decline
//   accepted        → I am en route
//   en_route        → I have arrived at pickup
//   on_scene        → photos + signature + vehicle correction → Vehicle loaded
//   loaded          → dropoff + actual_distance_km → I am in transit
//   in_transit      → I have arrived at dropoff
//   at_dropoff      → photos + signature + amount + payment → Complete job
//   completed/declined/cancelled → read-only summary
//
// State is refetched after every successful mutation so gating
// (photo counts, signature URLs, status) stays in sync with the
// server-side guards in /api/driver/jobs/[id]/status.

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { DriverShell } from '@/components/driver/DriverShell'
import { PhotoCapture } from '@/components/driver/PhotoCapture'
import { SignaturePad } from '@/components/driver/SignaturePad'
import type { DriverRow } from '@/lib/driver-auth'
import type {
  DispatchJobRow,
  DispatchJobPhotoRow,
  DispatchJobStatus,
  PaymentType,
} from '@/lib/dispatch-types'
import { JOB_TYPE_LABEL, STATUS_LABEL } from '@/lib/dispatch-types'

const BRAND = {
  orange: '#E8622A',
  navy: '#061322',
  blue: '#1565C0',
  green: '#22C55E',
  yellow: '#fef3c7',
  yellowBorder: '#fde68a',
  yellowText: '#92400e',
  grey: '#6b7280',
  card: '#ffffff',
  bg: '#f5f5f7',
}

const PAYMENT_OPTIONS: { value: PaymentType; label: string }[] = [
  { value: 'cash', label: 'Cash' },
  { value: 'card', label: 'Card' },
  { value: 'account', label: 'Account' },
  { value: 'insurance', label: 'Insurance' },
  { value: 'motor_club', label: 'Motor Club' },
  { value: 'other', label: 'Other' },
]

const CONDITION_QUICK_TAGS = [
  'No damage',
  'Windscreen crack',
  'Panel damage',
  'Missing parts',
  'Keys present',
  'No keys',
]

interface Props {
  driver: DriverRow
  businessName: string
  initialJob: DispatchJobRow
  initialPhotos: DispatchJobPhotoRow[]
}

export function JobClient({ driver: initialDriver, businessName, initialJob, initialPhotos }: Props) {
  const router = useRouter()
  const [driver, setDriver] = useState(initialDriver)
  const [job, setJob] = useState(initialJob)
  const [photos, setPhotos] = useState(initialPhotos)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const pickupPhotos = useMemo(
    () => photos.filter(p => p.photo_type === 'pickup'),
    [photos],
  )
  const deliveryPhotos = useMemo(
    () => photos.filter(p => p.photo_type === 'delivery'),
    [photos],
  )

  const refetch = useCallback(async () => {
    const res = await fetch(`/api/driver/jobs/${job.id}`)
    if (!res.ok) return
    const data = await res.json()
    if (data.ok) {
      setJob(data.job as DispatchJobRow)
      setPhotos(data.photos as DispatchJobPhotoRow[])
    }
  }, [job.id])

  async function accept(etaMins: number) {
    setBusy(true); setError(null)
    try {
      const res = await fetch(`/api/driver/jobs/${job.id}/respond`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'accept', eta_mins: etaMins }),
      })
      const data = await res.json()
      if (!res.ok || !data.ok) throw new Error(data.error ?? 'Could not accept')
      await refetch()
    } catch (e) { setError((e as Error).message) }
    finally { setBusy(false) }
  }

  async function decline() {
    if (!confirm('Decline this job? It will be reassigned to another driver.')) return
    setBusy(true); setError(null)
    try {
      const res = await fetch(`/api/driver/jobs/${job.id}/respond`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'decline' }),
      })
      const data = await res.json()
      if (!res.ok || !data.ok) throw new Error(data.error ?? 'Could not decline')
      router.replace('/driver/dashboard')
    } catch (e) { setError((e as Error).message); setBusy(false) }
  }

  async function moveStatus(next: DispatchJobStatus, data?: Record<string, unknown>, confirmText?: string) {
    if (confirmText && !confirm(confirmText)) return
    setBusy(true); setError(null)
    try {
      const res = await fetch(`/api/driver/jobs/${job.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: next, data }),
      })
      const body = await res.json()
      if (!res.ok || !body.ok) throw new Error(body.error ?? 'Could not update status')
      await refetch()
    } catch (e) { setError((e as Error).message) }
    finally { setBusy(false) }
  }

  return (
    <DriverShell
      driver={driver}
      businessName={businessName}
      onStatusChanged={isOnline => setDriver({ ...driver, is_online: isOnline })}
    >
      <JobHeader job={job} />

      {error && (
        <div style={{
          background: '#fee2e2',
          color: '#991b1b',
          border: '1px solid #fecaca',
          padding: '10px 14px',
          borderRadius: 8,
          fontSize: 14,
          marginBottom: 12,
        }}>{error}</div>
      )}

      <JobInfoPanel job={job} />

      {job.status === 'driver_notified' && (
        <NotifiedStage job={job} onAccept={accept} onDecline={decline} busy={busy} />
      )}

      {job.status === 'accepted' && (
        <AcceptedStage
          job={job}
          busy={busy}
          onEnRoute={() => moveStatus('en_route')}
        />
      )}

      {job.status === 'en_route' && (
        <EnRouteStage
          job={job}
          busy={busy}
          onArrived={() => moveStatus('on_scene')}
        />
      )}

      {job.status === 'on_scene' && (
        <OnSceneStage
          job={job}
          photos={pickupPhotos}
          busy={busy}
          onPhotoUploaded={refetch}
          onSignatureSaved={refetch}
          onVehicleSaved={refetch}
          onLoaded={() => moveStatus('loaded')}
        />
      )}

      {job.status === 'loaded' && (
        <LoadedStage
          job={job}
          photos={pickupPhotos}
          busy={busy}
          onInTransit={(distanceKm) => moveStatus('in_transit', distanceKm != null ? { actual_distance_km: distanceKm } : undefined)}
        />
      )}

      {job.status === 'in_transit' && (
        <InTransitStage
          job={job}
          busy={busy}
          onArrived={() => moveStatus('at_dropoff')}
        />
      )}

      {job.status === 'at_dropoff' && (
        <AtDropoffStage
          job={job}
          photos={deliveryPhotos}
          busy={busy}
          onPhotoUploaded={refetch}
          onSignatureSaved={refetch}
          onComplete={(data) => moveStatus('completed', data, 'Mark this job as complete? This cannot be undone.')}
        />
      )}

      {(job.status === 'completed' || job.status === 'invoiced' || job.status === 'paid') && (
        <CompletedSummary job={job} pickupPhotos={pickupPhotos} deliveryPhotos={deliveryPhotos} />
      )}

      {(job.status === 'declined' || job.status === 'cancelled') && (
        <div style={cardStyle}>
          <div style={{ color: BRAND.grey, fontSize: 14 }}>
            This job is {STATUS_LABEL[job.status].toLowerCase()}. No further actions available.
          </div>
        </div>
      )}
    </DriverShell>
  )
}

// ─────────────────────────── Header / shared ─────────────────────────

function JobHeader({ job }: { job: DispatchJobRow }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
      <Link
        href="/driver/dashboard"
        style={{
          padding: '8px 12px',
          borderRadius: 8,
          background: '#fff',
          border: '1px solid #e5e7eb',
          color: BRAND.navy,
          fontSize: 14,
          textDecoration: 'none',
        }}
      >
        ← Back
      </Link>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, color: BRAND.grey, fontWeight: 600 }}>
          {job.job_number ?? ''}
        </div>
        <div style={{ fontSize: 16, fontWeight: 700, color: BRAND.navy }}>
          {STATUS_LABEL[job.status]}
        </div>
      </div>
      <StatusBadge status={job.status} />
    </div>
  )
}

function StatusBadge({ status }: { status: DispatchJobStatus }) {
  const colors: Record<DispatchJobStatus, { bg: string; fg: string }> = {
    created: { bg: '#f3f4f6', fg: '#6b7280' },
    driver_notified: { bg: '#fef3c7', fg: '#92400e' },
    accepted: { bg: '#dbeafe', fg: '#1e40af' },
    declined: { bg: '#fee2e2', fg: '#991b1b' },
    en_route: { bg: '#fed7aa', fg: '#9a3412' },
    on_scene: { bg: '#fed7aa', fg: '#9a3412' },
    loaded: { bg: '#ede9fe', fg: '#6d28d9' },
    in_transit: { bg: '#ede9fe', fg: '#6d28d9' },
    at_dropoff: { bg: '#cffafe', fg: '#155e75' },
    completed: { bg: '#dcfce7', fg: '#166534' },
    invoiced: { bg: '#dcfce7', fg: '#166534' },
    paid: { bg: '#dcfce7', fg: '#166534' },
    cancelled: { bg: '#fee2e2', fg: '#991b1b' },
  }
  const c = colors[status]
  return (
    <span style={{
      padding: '4px 10px',
      borderRadius: 999,
      background: c.bg,
      color: c.fg,
      fontSize: 11,
      fontWeight: 700,
      textTransform: 'uppercase',
      letterSpacing: '0.03em',
      whiteSpace: 'nowrap',
    }}>{status.replace(/_/g, ' ')}</span>
  )
}

function JobInfoPanel({ job }: { job: DispatchJobRow }) {
  const vehicleLine = [
    job.vehicle_year,
    job.vehicle_make,
    job.vehicle_model,
    job.vehicle_colour,
  ].filter(Boolean).join(' ')

  return (
    <div style={cardStyle}>
      <div style={{ fontSize: 12, color: BRAND.grey, fontWeight: 700, textTransform: 'uppercase' }}>
        {JOB_TYPE_LABEL[job.job_type]}
      </div>
      {(job.customer_name || job.customer_phone) && (
        <Row label="Customer">
          {job.customer_name ?? '—'}
          {job.customer_phone && (
            <>
              {' '}·{' '}
              <a href={`tel:${job.customer_phone}`} style={{ color: BRAND.blue }}>{job.customer_phone}</a>
            </>
          )}
        </Row>
      )}
      {(vehicleLine || job.vehicle_rego) && (
        <Row label="Vehicle">
          {vehicleLine || '—'}
          {job.vehicle_rego && <strong>{' '}· {job.vehicle_rego}</strong>}
        </Row>
      )}
      {job.vehicle_condition && (
        <Row label="Condition">{job.vehicle_condition}</Row>
      )}
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: 8, fontSize: 14, color: BRAND.navy, lineHeight: 1.5 }}>
      <span style={{ color: BRAND.grey, fontSize: 12, fontWeight: 600 }}>{label}: </span>
      {children}
    </div>
  )
}

// ─────────────────────────── driver_notified ─────────────────────────

function NotifiedStage({
  job, busy, onAccept, onDecline,
}: { job: DispatchJobRow; busy: boolean; onAccept: (eta: number) => void; onDecline: () => void }) {
  const [showEtaInput, setShowEtaInput] = useState(false)
  const [eta, setEta] = useState('15')

  const remainingSecs = useDeadlineCountdown(job.response_deadline)

  return (
    <div style={{ ...cardStyle, background: BRAND.orange, color: '#fff', border: 'none' }}>
      <div style={{ fontSize: 14, fontWeight: 700, opacity: 0.9, marginBottom: 8 }}>
        NEW JOB INCOMING
      </div>
      <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 8 }}>
        {JOB_TYPE_LABEL[job.job_type]}
      </div>
      <div style={{ fontSize: 14, opacity: 0.95, marginBottom: 4 }}>PICKUP</div>
      <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>{job.pickup_address}</div>
      {job.special_instructions && (
        <div style={{
          background: 'rgba(255,255,255,0.12)',
          padding: '10px 12px',
          borderRadius: 8,
          fontSize: 14,
          marginBottom: 12,
        }}>{job.special_instructions}</div>
      )}
      <div style={{ fontSize: 13, opacity: 0.85, marginBottom: 14 }}>
        Payment: {job.payment_type ?? 'not specified'}
        {remainingSecs != null && (
          <>{' '}· Respond within {Math.max(0, Math.floor(remainingSecs / 60))}:{String(Math.max(0, remainingSecs % 60)).padStart(2, '0')}</>
        )}
      </div>

      {!showEtaInput ? (
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={() => setShowEtaInput(true)}
            disabled={busy}
            style={{
              flex: 1,
              padding: '14px 16px',
              background: '#fff',
              color: BRAND.orange,
              border: 'none',
              borderRadius: 10,
              fontSize: 16,
              fontWeight: 700,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            ACCEPT
          </button>
          <button
            onClick={onDecline}
            disabled={busy}
            style={{
              flex: 1,
              padding: '14px 16px',
              background: 'rgba(0,0,0,0.25)',
              color: '#fff',
              border: 'none',
              borderRadius: 10,
              fontSize: 16,
              fontWeight: 700,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            DECLINE
          </button>
        </div>
      ) : (
        <div>
          <label style={{ display: 'block', fontSize: 13, marginBottom: 6 }}>Minutes to arrival</label>
          <input
            type="number"
            min="1"
            max="180"
            value={eta}
            onChange={e => setEta(e.target.value)}
            inputMode="numeric"
            style={{
              width: '100%',
              padding: '12px 14px',
              borderRadius: 8,
              border: 'none',
              fontSize: 16,
              fontFamily: 'inherit',
              marginBottom: 10,
            }}
          />
          <button
            onClick={() => {
              const n = parseInt(eta, 10)
              if (!Number.isFinite(n) || n <= 0) return
              onAccept(n)
            }}
            disabled={busy}
            style={{
              width: '100%',
              padding: '14px 16px',
              background: '#fff',
              color: BRAND.orange,
              border: 'none',
              borderRadius: 10,
              fontSize: 16,
              fontWeight: 700,
              cursor: busy ? 'wait' : 'pointer',
              fontFamily: 'inherit',
              opacity: busy ? 0.7 : 1,
            }}
          >
            {busy ? 'Accepting…' : `Confirm — ETA ${eta} mins`}
          </button>
        </div>
      )}
    </div>
  )
}

function useDeadlineCountdown(deadline: string | null) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!deadline) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [deadline])
  if (!deadline) return null
  return Math.floor((new Date(deadline).getTime() - now) / 1000)
}

// ─────────────────────────── accepted ────────────────────────────────

function AcceptedStage({ job, busy, onEnRoute }: { job: DispatchJobRow; busy: boolean; onEnRoute: () => void }) {
  return (
    <>
      <AddressBlock label="Pickup" address={job.pickup_address} notes={job.pickup_notes} />
      {job.dropoff_address && (
        <AddressBlock label="Dropoff" address={job.dropoff_address} notes={job.dropoff_notes} />
      )}
      {job.special_instructions && (
        <div style={{
          background: BRAND.yellow,
          border: `1px solid ${BRAND.yellowBorder}`,
          color: BRAND.yellowText,
          padding: '12px 14px',
          borderRadius: 10,
          fontSize: 14,
          marginBottom: 12,
        }}>
          <strong>Note: </strong>{job.special_instructions}
        </div>
      )}
      <PaymentSummary job={job} />
      <PrimaryButton onClick={onEnRoute} busy={busy}>I AM EN ROUTE</PrimaryButton>
    </>
  )
}

// ─────────────────────────── en_route ────────────────────────────────

function EnRouteStage({ job, busy, onArrived }: { job: DispatchJobRow; busy: boolean; onArrived: () => void }) {
  return (
    <>
      <AddressBlock label="Pickup" address={job.pickup_address} notes={job.pickup_notes} highlight />
      <PrimaryButton onClick={onArrived} busy={busy}>I HAVE ARRIVED AT PICKUP</PrimaryButton>
    </>
  )
}

// ─────────────────────────── on_scene ────────────────────────────────

function OnSceneStage({
  job, photos, busy, onPhotoUploaded, onSignatureSaved, onVehicleSaved, onLoaded,
}: {
  job: DispatchJobRow
  photos: DispatchJobPhotoRow[]
  busy: boolean
  onPhotoUploaded: () => void
  onSignatureSaved: () => void
  onVehicleSaved: () => void
  onLoaded: () => void
}) {
  const canLoad = photos.length >= 1 && !!job.pickup_signature_url

  return (
    <>
      <Section title="1. Pickup photos (min 1, recommended 4)">
        <PhotoCapture
          jobId={job.id}
          photoType="pickup"
          existingPhotos={photos.map(p => ({ id: p.id, photo_url: p.photo_url, caption: p.caption }))}
          onUploaded={onPhotoUploaded}
        />
      </Section>

      <Section title="2. Vehicle condition">
        <VehicleConditionForm job={job} onSaved={onVehicleSaved} />
      </Section>

      <Section title="3. Customer signature at pickup">
        <SignaturePad
          jobId={job.id}
          signatureType="pickup"
          currentUrl={job.pickup_signature_url}
          onSaved={onSignatureSaved}
        />
      </Section>

      <Section title="4. Confirm vehicle details">
        <VehicleEditForm job={job} onSaved={onVehicleSaved} />
      </Section>

      <PrimaryButton onClick={onLoaded} busy={busy} disabled={!canLoad}>
        {canLoad ? 'VEHICLE LOADED' : `Add ${photos.length < 1 ? '1+ pickup photo' : ''}${photos.length < 1 && !job.pickup_signature_url ? ' and ' : ''}${!job.pickup_signature_url ? 'signature' : ''} first`}
      </PrimaryButton>
    </>
  )
}

function VehicleConditionForm({ job, onSaved }: { job: DispatchJobRow; onSaved: () => void }) {
  const [condition, setCondition] = useState(job.vehicle_condition ?? '')
  const [saving, setSaving] = useState(false)

  function append(tag: string) {
    setCondition(prev => prev ? `${prev}, ${tag}` : tag)
  }

  async function save() {
    setSaving(true)
    await fetch(`/api/driver/jobs/${job.id}/vehicle`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vehicle_condition: condition }),
    })
    setSaving(false)
    onSaved()
  }

  return (
    <div>
      <textarea
        value={condition}
        onChange={e => setCondition(e.target.value)}
        placeholder="Note any pre-existing damage…"
        rows={3}
        style={{
          width: '100%',
          padding: 12,
          borderRadius: 8,
          border: '1px solid #d1d5db',
          fontFamily: 'inherit',
          fontSize: 14,
          resize: 'vertical',
        }}
      />
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
        {CONDITION_QUICK_TAGS.map(t => (
          <button
            key={t}
            type="button"
            onClick={() => append(t)}
            style={{
              padding: '6px 10px',
              borderRadius: 999,
              border: '1px solid #d1d5db',
              background: '#f9fafb',
              fontSize: 12,
              fontFamily: 'inherit',
              cursor: 'pointer',
              color: BRAND.navy,
            }}
          >
            + {t}
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={save}
        disabled={saving}
        style={{
          marginTop: 10,
          padding: '10px 14px',
          background: '#fff',
          color: BRAND.navy,
          border: '1px solid #d1d5db',
          borderRadius: 8,
          fontSize: 14,
          fontWeight: 600,
          fontFamily: 'inherit',
          cursor: saving ? 'wait' : 'pointer',
          opacity: saving ? 0.7 : 1,
        }}
      >
        {saving ? 'Saving…' : 'Save condition notes'}
      </button>
    </div>
  )
}

function VehicleEditForm({ job, onSaved }: { job: DispatchJobRow; onSaved: () => void }) {
  const [form, setForm] = useState({
    vehicle_make: job.vehicle_make ?? '',
    vehicle_model: job.vehicle_model ?? '',
    vehicle_year: job.vehicle_year ?? '',
    vehicle_colour: job.vehicle_colour ?? '',
    vehicle_rego: job.vehicle_rego ?? '',
  })
  const [saving, setSaving] = useState(false)

  async function save() {
    setSaving(true)
    await fetch(`/api/driver/jobs/${job.id}/vehicle`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    setSaving(false)
    onSaved()
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
      <SmallField label="Rego" value={form.vehicle_rego} onChange={v => setForm({ ...form, vehicle_rego: v })} />
      <SmallField label="Colour" value={form.vehicle_colour} onChange={v => setForm({ ...form, vehicle_colour: v })} />
      <SmallField label="Make" value={form.vehicle_make} onChange={v => setForm({ ...form, vehicle_make: v })} />
      <SmallField label="Model" value={form.vehicle_model} onChange={v => setForm({ ...form, vehicle_model: v })} />
      <SmallField label="Year" value={form.vehicle_year} onChange={v => setForm({ ...form, vehicle_year: v })} inputMode="numeric" />
      <button
        type="button"
        onClick={save}
        disabled={saving}
        style={{
          gridColumn: '1 / -1',
          padding: '10px 14px',
          background: '#fff',
          color: BRAND.navy,
          border: '1px solid #d1d5db',
          borderRadius: 8,
          fontSize: 14,
          fontWeight: 600,
          fontFamily: 'inherit',
          cursor: saving ? 'wait' : 'pointer',
          opacity: saving ? 0.7 : 1,
        }}
      >
        {saving ? 'Saving…' : 'Save vehicle details'}
      </button>
    </div>
  )
}

function SmallField({ label, value, onChange, inputMode }: {
  label: string
  value: string
  onChange: (v: string) => void
  inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode']
}) {
  return (
    <label style={{ display: 'block' }}>
      <span style={{ fontSize: 11, color: BRAND.grey, fontWeight: 600 }}>{label}</span>
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        inputMode={inputMode}
        style={{
          width: '100%',
          padding: '10px 12px',
          marginTop: 4,
          borderRadius: 8,
          border: '1px solid #d1d5db',
          fontSize: 14,
          fontFamily: 'inherit',
          outline: 'none',
        }}
      />
    </label>
  )
}

// ─────────────────────────── loaded ──────────────────────────────────

function LoadedStage({
  job, photos, busy, onInTransit,
}: {
  job: DispatchJobRow
  photos: DispatchJobPhotoRow[]
  busy: boolean
  onInTransit: (distanceKm: number | null) => void
}) {
  const [distance, setDistance] = useState(
    job.distance_km != null ? String(job.distance_km) : '',
  )

  if (!job.dropoff_address) {
    return (
      <>
        <div style={cardStyle}>
          <div style={{ color: BRAND.grey, fontSize: 14 }}>
            No dropoff address on file. Confirm with dispatcher before driving.
          </div>
        </div>
        <PrimaryButton onClick={() => onInTransit(distance ? Number(distance) : null)} busy={busy}>
          I AM IN TRANSIT TO DROPOFF
        </PrimaryButton>
      </>
    )
  }

  return (
    <>
      <AddressBlock label="Dropoff" address={job.dropoff_address} notes={job.dropoff_notes} highlight />

      {photos.length > 0 && (
        <Section title="Pickup photos">
          <div style={{ display: 'flex', gap: 8, overflowX: 'auto' }}>
            {photos.map(p => (
              <img key={p.id} src={p.photo_url} alt="" style={{
                width: 72, height: 72, objectFit: 'cover',
                borderRadius: 8, border: '1px solid #e5e7eb', flexShrink: 0,
              }} />
            ))}
          </div>
        </Section>
      )}

      <Section title="Estimated distance (km)">
        <input
          type="number"
          value={distance}
          onChange={e => setDistance(e.target.value)}
          inputMode="decimal"
          step="0.1"
          style={{
            width: '100%',
            padding: '12px 14px',
            borderRadius: 8,
            border: '1px solid #d1d5db',
            fontSize: 15,
            fontFamily: 'inherit',
          }}
        />
      </Section>

      <PrimaryButton onClick={() => onInTransit(distance ? Number(distance) : null)} busy={busy}>
        I AM IN TRANSIT TO DROPOFF
      </PrimaryButton>
    </>
  )
}

// ─────────────────────────── in_transit ──────────────────────────────

function InTransitStage({ job, busy, onArrived }: { job: DispatchJobRow; busy: boolean; onArrived: () => void }) {
  return (
    <>
      {job.dropoff_address && (
        <AddressBlock label="Dropoff" address={job.dropoff_address} notes={job.dropoff_notes} highlight />
      )}
      <PrimaryButton onClick={onArrived} busy={busy}>I HAVE ARRIVED AT DROPOFF</PrimaryButton>
    </>
  )
}

// ─────────────────────────── at_dropoff ──────────────────────────────

function AtDropoffStage({
  job, photos, busy, onPhotoUploaded, onSignatureSaved, onComplete,
}: {
  job: DispatchJobRow
  photos: DispatchJobPhotoRow[]
  busy: boolean
  onPhotoUploaded: () => void
  onSignatureSaved: () => void
  onComplete: (data: Record<string, unknown>) => void
}) {
  const [finalAmount, setFinalAmount] = useState(
    job.final_amount != null
      ? String(job.final_amount)
      : job.quoted_amount != null
        ? String(job.quoted_amount)
        : '',
  )
  const [paymentCollected, setPaymentCollected] = useState(job.payment_collected)
  const [paymentType, setPaymentType] = useState<PaymentType | ''>(
    (job.payment_collected_type as PaymentType | null) ?? job.payment_type ?? '',
  )
  const [notes, setNotes] = useState(job.driver_completion_notes ?? '')

  const finalNum = Number(finalAmount)
  const canComplete = photos.length >= 1
    && !!job.delivery_signature_url
    && Number.isFinite(finalNum) && finalNum >= 0

  function submit() {
    onComplete({
      final_amount: finalNum,
      payment_collected: paymentCollected,
      payment_collected_type: paymentCollected && paymentType ? paymentType : undefined,
      driver_completion_notes: notes || undefined,
    })
  }

  return (
    <>
      <Section title="1. Delivery photos (min 1)">
        <PhotoCapture
          jobId={job.id}
          photoType="delivery"
          existingPhotos={photos.map(p => ({ id: p.id, photo_url: p.photo_url, caption: p.caption }))}
          onUploaded={onPhotoUploaded}
        />
      </Section>

      <Section title="2. Customer signature at delivery">
        <SignaturePad
          jobId={job.id}
          signatureType="delivery"
          currentUrl={job.delivery_signature_url}
          onSaved={onSignatureSaved}
        />
      </Section>

      <Section title="3. Final amount">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 18, color: BRAND.grey }}>$</span>
          <input
            type="number"
            value={finalAmount}
            onChange={e => setFinalAmount(e.target.value)}
            inputMode="decimal"
            step="0.01"
            style={{
              flex: 1,
              padding: '12px 14px',
              borderRadius: 8,
              border: '1px solid #d1d5db',
              fontSize: 18,
              fontFamily: 'inherit',
            }}
          />
        </div>
        {job.quoted_amount != null && (
          <div style={{ fontSize: 12, color: BRAND.grey, marginTop: 4 }}>
            Quoted: ${Number(job.quoted_amount).toFixed(2)}
          </div>
        )}
      </Section>

      <Section title="4. Payment">
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14 }}>
          <input
            type="checkbox"
            checked={paymentCollected}
            onChange={e => setPaymentCollected(e.target.checked)}
            style={{ width: 18, height: 18 }}
          />
          Payment collected
        </label>
        {paymentCollected && (
          <select
            value={paymentType}
            onChange={e => setPaymentType(e.target.value as PaymentType)}
            style={{
              width: '100%',
              marginTop: 8,
              padding: '12px 14px',
              borderRadius: 8,
              border: '1px solid #d1d5db',
              fontSize: 15,
              fontFamily: 'inherit',
              background: '#fff',
            }}
          >
            <option value="">Select method…</option>
            {PAYMENT_OPTIONS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
        )}
      </Section>

      <Section title="5. Completion notes (optional)">
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          rows={3}
          placeholder="Anything the dispatcher should know…"
          style={{
            width: '100%',
            padding: 12,
            borderRadius: 8,
            border: '1px solid #d1d5db',
            fontFamily: 'inherit',
            fontSize: 14,
            resize: 'vertical',
          }}
        />
      </Section>

      <button
        onClick={submit}
        disabled={busy || !canComplete}
        style={{
          width: '100%',
          padding: '16px',
          background: canComplete ? BRAND.green : '#9ca3af',
          color: '#fff',
          border: 'none',
          borderRadius: 12,
          fontSize: 17,
          fontWeight: 700,
          cursor: busy ? 'wait' : canComplete ? 'pointer' : 'not-allowed',
          fontFamily: 'inherit',
          opacity: busy ? 0.7 : 1,
          marginTop: 8,
        }}
      >
        {busy ? 'Completing…' : 'COMPLETE JOB'}
      </button>
    </>
  )
}

// ─────────────────────────── completed (read-only) ───────────────────

function CompletedSummary({
  job, pickupPhotos, deliveryPhotos,
}: {
  job: DispatchJobRow
  pickupPhotos: DispatchJobPhotoRow[]
  deliveryPhotos: DispatchJobPhotoRow[]
}) {
  const totalMins = job.accepted_at && job.completed_at
    ? Math.round((new Date(job.completed_at).getTime() - new Date(job.accepted_at).getTime()) / 60000)
    : null

  return (
    <>
      <div style={cardStyle}>
        <Row label="Pickup">{job.pickup_address}</Row>
        {job.dropoff_address && <Row label="Dropoff">{job.dropoff_address}</Row>}
        {job.actual_distance_km != null && <Row label="Distance">{Number(job.actual_distance_km).toFixed(1)} km</Row>}
        {totalMins != null && <Row label="Total time">{totalMins} mins</Row>}
        {job.final_amount != null && (
          <Row label="Final amount">
            ${Number(job.final_amount).toFixed(2)}
            {job.payment_collected && job.payment_collected_type && (
              <>{' '}· {job.payment_collected_type}</>
            )}
          </Row>
        )}
        {job.driver_completion_notes && <Row label="Notes">{job.driver_completion_notes}</Row>}
      </div>

      {pickupPhotos.length > 0 && (
        <Section title="Pickup photos">
          <PhotoGrid photos={pickupPhotos} />
        </Section>
      )}
      {job.pickup_signature_url && (
        <Section title="Pickup signature">
          <img src={job.pickup_signature_url} alt="" style={{
            width: '100%', maxHeight: 160, objectFit: 'contain',
            background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8,
          }} />
        </Section>
      )}
      {deliveryPhotos.length > 0 && (
        <Section title="Delivery photos">
          <PhotoGrid photos={deliveryPhotos} />
        </Section>
      )}
      {job.delivery_signature_url && (
        <Section title="Delivery signature">
          <img src={job.delivery_signature_url} alt="" style={{
            width: '100%', maxHeight: 160, objectFit: 'contain',
            background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8,
          }} />
        </Section>
      )}
    </>
  )
}

function PhotoGrid({ photos }: { photos: DispatchJobPhotoRow[] }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
      {photos.map(p => (
        <img
          key={p.id}
          src={p.photo_url}
          alt={p.caption ?? ''}
          style={{
            width: '100%',
            aspectRatio: '1',
            objectFit: 'cover',
            borderRadius: 8,
            border: '1px solid #e5e7eb',
          }}
        />
      ))}
    </div>
  )
}

// ─────────────────────────── shared bits ─────────────────────────────

function AddressBlock({
  label, address, notes, highlight,
}: { label: string; address: string; notes: string | null; highlight?: boolean }) {
  const mapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`
  return (
    <div style={{
      ...cardStyle,
      borderLeft: highlight ? `4px solid ${BRAND.orange}` : cardStyle.borderLeft,
    }}>
      <div style={{ fontSize: 12, color: BRAND.grey, fontWeight: 700, textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 600, color: BRAND.navy, marginTop: 4 }}>{address}</div>
      {notes && <div style={{ fontSize: 14, color: BRAND.grey, marginTop: 6 }}>{notes}</div>}
      <a
        href={mapUrl}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          display: 'inline-block',
          marginTop: 10,
          padding: '10px 14px',
          background: BRAND.blue,
          color: '#fff',
          textDecoration: 'none',
          borderRadius: 8,
          fontSize: 14,
          fontWeight: 600,
        }}
      >
        Open in Maps
      </a>
    </div>
  )
}

function PaymentSummary({ job }: { job: DispatchJobRow }) {
  if (!job.payment_type && job.quoted_amount == null) return null
  return (
    <div style={cardStyle}>
      {job.payment_type && <Row label="Payment">{job.payment_type}</Row>}
      {job.insurance_claim_number && <Row label="Claim #">{job.insurance_claim_number}</Row>}
      {job.motor_club_job_number && <Row label="Motor club job #">{job.motor_club_job_number}</Row>}
      {job.quoted_amount != null && <Row label="Quoted">${Number(job.quoted_amount).toFixed(2)}</Row>}
    </div>
  )
}

function PrimaryButton({
  onClick, busy, disabled, children,
}: { onClick: () => void; busy: boolean; disabled?: boolean; children: React.ReactNode }) {
  const blocked = busy || disabled
  return (
    <button
      onClick={onClick}
      disabled={blocked}
      style={{
        width: '100%',
        padding: '16px',
        background: disabled ? '#9ca3af' : BRAND.orange,
        color: '#fff',
        border: 'none',
        borderRadius: 12,
        fontSize: 17,
        fontWeight: 700,
        cursor: blocked ? (disabled ? 'not-allowed' : 'wait') : 'pointer',
        fontFamily: 'inherit',
        opacity: busy ? 0.7 : 1,
        marginTop: 8,
      }}
    >
      {busy ? 'Working…' : children}
    </button>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{
        fontSize: 12,
        fontWeight: 700,
        color: BRAND.grey,
        textTransform: 'uppercase',
        letterSpacing: '0.04em',
        marginBottom: 8,
      }}>{title}</div>
      <div style={cardStyle}>{children}</div>
    </div>
  )
}

const cardStyle: React.CSSProperties = {
  background: BRAND.card,
  padding: 14,
  borderRadius: 12,
  border: '1px solid #e5e7eb',
  borderLeft: '1px solid #e5e7eb',
  marginBottom: 12,
}
