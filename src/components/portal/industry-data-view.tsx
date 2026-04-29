// Structured display of contacts.industry_data per industry — Session 2 brief Part 7.
// Falls back to a simple key/value grid for unknown industries / empty data.

import type { ReactNode } from 'react'

interface Props {
  industry: string | null
  data: Record<string, unknown>
}

export default function IndustryDataView({ industry, data }: Props) {
  if (!data || Object.keys(data).length === 0) return null

  if (industry === 'real_estate') return <RealEstateView d={data} />
  if (industry === 'towing') return <TowingView d={data} />
  if (industry === 'restaurants') return <RestaurantView d={data} />
  if (industry === 'trades') return <TradesView d={data} />
  return <GenericView d={data} />
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#7BAED4', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>{title}</div>
      <div>{children}</div>
    </div>
  )
}

function Badge({ label, color = '#4A9FE8', bg = 'rgba(74,159,232,0.12)' }: { label: string; color?: string; bg?: string }) {
  return <span style={{ display: 'inline-block', fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 99, background: bg, color, textTransform: 'capitalize' as const, marginRight: 6, marginBottom: 4 }}>{label}</span>
}

function RealEstateView({ d }: { d: Record<string, unknown> }) {
  const enquiry = d.enquiry_type as string | undefined
  const budget = d.budget as string | number | undefined
  const preApproved = d.pre_approved as boolean | string | undefined
  const suburbs = (d.suburbs as string[]) ?? []
  const properties = (d.properties as string[]) ?? []
  const single = d.property_interest as string | undefined

  return (
    <div>
      {enquiry && (
        <Section title="Enquiry">
          <Badge label={enquiry} color="#E8622A" bg="rgba(232,98,42,0.12)" />
        </Section>
      )}
      {budget !== undefined && (
        <Section title="Budget"><div style={{ fontSize: 14, color: 'white', fontWeight: 600 }}>{typeof budget === 'number' ? `$${budget.toLocaleString()}` : budget}</div></Section>
      )}
      {preApproved !== undefined && (
        <Section title="Pre-approval">
          {preApproved === true || preApproved === 'true' || preApproved === 'yes'
            ? <Badge label="✓ Pre-approved" color="#22C55E" bg="rgba(34,197,94,0.12)" />
            : preApproved === false || preApproved === 'false' || preApproved === 'no'
              ? <Badge label="✗ Not pre-approved" color="#EF4444" bg="rgba(239,68,68,0.12)" />
              : <Badge label="Unknown" color="#94A3B8" bg="rgba(148,163,184,0.12)" />
          }
        </Section>
      )}
      {suburbs.length > 0 && (
        <Section title="Suburbs of interest">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {suburbs.map(s => <Badge key={s} label={s} />)}
          </div>
        </Section>
      )}
      {(single || properties.length > 0) && (
        <Section title="Properties enquired about">
          <ul style={{ margin: 0, paddingLeft: 20, fontSize: 13, color: '#7BAED4', lineHeight: 1.7 }}>
            {single && <li style={{ color: 'white' }}>{single}</li>}
            {properties.map(p => <li key={p}>{p}</li>)}
          </ul>
        </Section>
      )}
    </div>
  )
}

function TowingView({ d }: { d: Record<string, unknown> }) {
  const make = d.vehicle_make as string | undefined
  const model = d.vehicle_model as string | undefined
  const year = d.vehicle_year as string | undefined
  const breakdownLocation = d.breakdown_location as string | undefined
  const issue = d.issue_type as string | undefined
  return (
    <div>
      {(make || model || year) && (
        <Section title="Vehicle">
          <div style={{ background: '#061322', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 9, padding: 12, fontSize: 13, color: 'white' }}>
            <div style={{ fontWeight: 700 }}>{[year, make, model].filter(Boolean).join(' ')}</div>
            {issue && <div style={{ fontSize: 12, color: '#7BAED4', marginTop: 4 }}>{issue}</div>}
          </div>
        </Section>
      )}
      {breakdownLocation && (
        <Section title="Last breakdown location">
          <div style={{ fontSize: 13, color: 'white' }}>📍 {breakdownLocation}</div>
        </Section>
      )}
    </div>
  )
}

function RestaurantView({ d }: { d: Record<string, unknown> }) {
  const items = (d.order_items as string[]) ?? []
  const value = d.order_value as number | undefined
  const orderType = d.order_type as string | undefined
  return (
    <div>
      {orderType && <Section title="Order type"><Badge label={orderType.replace(/_/g, ' ')} color="#1565C0" bg="rgba(21,101,192,0.12)" /></Section>}
      {value !== undefined && <Section title="Last order value"><div style={{ fontSize: 18, fontWeight: 800, color: '#22C55E' }}>${value}</div></Section>}
      {items.length > 0 && (
        <Section title="Items ordered">
          <ul style={{ margin: 0, paddingLeft: 20, fontSize: 13, color: '#7BAED4', lineHeight: 1.7 }}>
            {items.map((i, idx) => <li key={idx}>{i}</li>)}
          </ul>
        </Section>
      )}
    </div>
  )
}

function TradesView({ d }: { d: Record<string, unknown> }) {
  const jobType = d.job_type as string | undefined
  const urgency = d.urgency as string | undefined
  const address = d.property_address as string | undefined
  return (
    <div>
      {jobType && <Section title="Job type"><Badge label={jobType.replace(/_/g, ' ')} color="#E8622A" bg="rgba(232,98,42,0.12)" /></Section>}
      {urgency && <Section title="Urgency">
        <Badge label={urgency} color={urgency === 'emergency' ? '#EF4444' : urgency === 'urgent' ? '#F59E0B' : '#22C55E'} bg={urgency === 'emergency' ? 'rgba(239,68,68,0.12)' : urgency === 'urgent' ? 'rgba(245,158,11,0.12)' : 'rgba(34,197,94,0.12)'} />
      </Section>}
      {address && <Section title="Property"><div style={{ fontSize: 13, color: 'white' }}>📍 {address}</div></Section>}
    </div>
  )
}

function GenericView({ d }: { d: Record<string, unknown> }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {Object.entries(d).map(([k, v]) => (
        <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 13, color: '#7BAED4', padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
          <span style={{ textTransform: 'capitalize' as const }}>{k.replace(/_/g, ' ')}</span>
          <span style={{ color: 'white', fontWeight: 600, textAlign: 'right' as const }}>{
            typeof v === 'object' && v !== null ? JSON.stringify(v) : String(v ?? '—')
          }</span>
        </div>
      ))}
    </div>
  )
}
