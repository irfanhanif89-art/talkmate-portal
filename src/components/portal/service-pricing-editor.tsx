'use client'

// ── Service Pricing Editor ────────────────────────────────────────────────────
// Shared component used in both the admin modal and the client settings page.
// Stores structured pricing per service type in notifications_config.service_pricing

export type ServicePricing = {
  plant_machinery?: {
    excavator?: string
    roller?: string
    bobcat?: string
    tractor?: string
  }
  containers_20ft?: {
    loaded?: string
    empty?: string
  }
  cars_light_vehicles?: {
    standard?: string
    sports_lowered?: string
    suv_light_truck?: string
  }
  breakdown_recovery?: {
    tyre_change?: string
    jump_start?: string
    fuel_recovery?: string
  }
  heavy_vehicles?: {
    mr_price?: string
    mr_height?: string
    mr_length?: string
    hr_price?: string
    hr_height?: string
    hr_length?: string
  }
}

interface Props {
  value: ServicePricing
  onChange: (v: ServicePricing) => void
}

const sectionStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.03)',
  border: '1px solid rgba(255,255,255,0.07)',
  borderRadius: 12,
  padding: '16px 18px',
  marginBottom: 12,
}

const sectionTitle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 700,
  color: 'white',
  marginBottom: 14,
  display: 'flex',
  alignItems: 'center',
  gap: 8,
}

const row: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: 10,
  marginBottom: 10,
}

const rowThree: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr 1fr',
  gap: 10,
  marginBottom: 10,
}

const lbl: React.CSSProperties = {
  fontSize: 11,
  color: '#4A7FBB',
  fontWeight: 600,
  marginBottom: 5,
  display: 'block',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
}

const inp: React.CSSProperties = {
  width: '100%',
  padding: '9px 12px',
  background: '#071829',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 8,
  color: 'white',
  fontSize: 13,
  fontFamily: 'Outfit, sans-serif',
  outline: 'none',
  boxSizing: 'border-box',
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div>
      <label style={lbl}>{label}</label>
      <input
        style={inp}
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder ?? '$0.00 or POA'}
      />
    </div>
  )
}

export default function ServicePricingEditor({ value, onChange }: Props) {
  const pm = value.plant_machinery ?? {}
  const c20 = value.containers_20ft ?? {}
  const cars = value.cars_light_vehicles ?? {}
  const br = value.breakdown_recovery ?? {}
  const hv = value.heavy_vehicles ?? {}

  function setPM(patch: Partial<typeof pm>) {
    onChange({ ...value, plant_machinery: { ...pm, ...patch } })
  }
  function setC20(patch: Partial<typeof c20>) {
    onChange({ ...value, containers_20ft: { ...c20, ...patch } })
  }
  function setCars(patch: Partial<typeof cars>) {
    onChange({ ...value, cars_light_vehicles: { ...cars, ...patch } })
  }
  function setBR(patch: Partial<typeof br>) {
    onChange({ ...value, breakdown_recovery: { ...br, ...patch } })
  }
  function setHV(patch: Partial<typeof hv>) {
    onChange({ ...value, heavy_vehicles: { ...hv, ...patch } })
  }

  return (
    <div style={{ marginTop: 4 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#4A7FBB', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 12 }}>
        Service Pricing (quoted by agent on calls)
      </div>

      {/* Plant & Machinery */}
      <div style={sectionStyle}>
        <div style={sectionTitle}>🏗️ Plant &amp; Machinery</div>
        <div style={row}>
          <Field label="Excavator" value={pm.excavator ?? ''} onChange={v => setPM({ excavator: v })} />
          <Field label="Roller" value={pm.roller ?? ''} onChange={v => setPM({ roller: v })} />
        </div>
        <div style={row}>
          <Field label="Bobcat / Positrac" value={pm.bobcat ?? ''} onChange={v => setPM({ bobcat: v })} />
          <Field label="Tractor" value={pm.tractor ?? ''} onChange={v => setPM({ tractor: v })} />
        </div>
      </div>

      {/* 20ft Containers */}
      <div style={sectionStyle}>
        <div style={sectionTitle}>📦 20ft Containers</div>
        <div style={row}>
          <Field label="Loaded 20ft Container" value={c20.loaded ?? ''} onChange={v => setC20({ loaded: v })} />
          <Field label="Empty 20ft Container" value={c20.empty ?? ''} onChange={v => setC20({ empty: v })} />
        </div>
      </div>

      {/* Cars & Light Vehicles */}
      <div style={sectionStyle}>
        <div style={sectionTitle}>🚗 Cars &amp; Light Vehicles</div>
        <div style={rowThree}>
          <Field label="Standard (Hatchback / Sedan)" value={cars.standard ?? ''} onChange={v => setCars({ standard: v })} />
          <Field label="Sports / Lowered Car" value={cars.sports_lowered ?? ''} onChange={v => setCars({ sports_lowered: v })} />
          <Field label="SUV / Light Truck" value={cars.suv_light_truck ?? ''} onChange={v => setCars({ suv_light_truck: v })} />
        </div>
      </div>

      {/* Breakdown Recovery */}
      <div style={sectionStyle}>
        <div style={sectionTitle}>🔧 Breakdown Recovery</div>
        <div style={rowThree}>
          <Field label="Tyre Change" value={br.tyre_change ?? ''} onChange={v => setBR({ tyre_change: v })} />
          <Field label="Jump Start" value={br.jump_start ?? ''} onChange={v => setBR({ jump_start: v })} />
          <Field label="Fuel Recovery" value={br.fuel_recovery ?? ''} onChange={v => setBR({ fuel_recovery: v })} />
        </div>
      </div>

      {/* Heavy Vehicles */}
      <div style={sectionStyle}>
        <div style={sectionTitle}>🚛 Heavy Vehicles</div>
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 12, color: '#7BAED4', fontWeight: 600, marginBottom: 8 }}>MR — Medium Rigid</div>
          <div style={rowThree}>
            <Field label="Price" value={hv.mr_price ?? ''} onChange={v => setHV({ mr_price: v })} />
            <Field label="Max Height" value={hv.mr_height ?? ''} onChange={v => setHV({ mr_height: v })} placeholder="e.g. 3.5m" />
            <Field label="Max Length" value={hv.mr_length ?? ''} onChange={v => setHV({ mr_length: v })} placeholder="e.g. 8m" />
          </div>
        </div>
        <div>
          <div style={{ fontSize: 12, color: '#7BAED4', fontWeight: 600, marginBottom: 8 }}>HR — Heavy Rigid</div>
          <div style={rowThree}>
            <Field label="Price" value={hv.hr_price ?? ''} onChange={v => setHV({ hr_price: v })} />
            <Field label="Max Height" value={hv.hr_height ?? ''} onChange={v => setHV({ hr_height: v })} placeholder="e.g. 4.5m" />
            <Field label="Max Length" value={hv.hr_length ?? ''} onChange={v => setHV({ hr_length: v })} placeholder="e.g. 12.5m" />
          </div>
        </div>
      </div>
    </div>
  )
}
