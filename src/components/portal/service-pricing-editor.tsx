'use client'

// ── Service Pricing Editor ────────────────────────────────────────────────────
// Each vehicle/service type has 4 pricing fields:
//   1. Call out fee        — base price for the job
//   2. Included km         — how many km the callout covers
//   3. Additional km rate  — charge per km beyond the included km
//   4. Hourly rate         — depot to depot travel rate

export type VehiclePrice = {
  callout?: string     // e.g. "$350"
  callout_km?: string  // e.g. "10"
  extra_km?: string    // e.g. "$5/km"
  hourly?: string      // e.g. "$120/hr"
}

export type HeavyVehiclePrice = VehiclePrice & {
  height?: string   // e.g. "3.5m"
  length?: string   // e.g. "8m"
}

export type ServicePricing = {
  plant_machinery?: {
    excavator?: VehiclePrice
    roller?: VehiclePrice
    bobcat?: VehiclePrice
    tractor?: VehiclePrice
  }
  containers_20ft?: {
    loaded?: VehiclePrice
    empty?: VehiclePrice
  }
  cars_light_vehicles?: {
    standard?: VehiclePrice
    sports_lowered?: VehiclePrice
    suv_light_truck?: VehiclePrice
  }
  breakdown_recovery?: {
    tyre_change?: VehiclePrice
    jump_start?: VehiclePrice
    fuel_recovery?: VehiclePrice
  }
  heavy_vehicles?: {
    mr?: HeavyVehiclePrice
    hr?: HeavyVehiclePrice
  }
}

interface Props {
  value: ServicePricing
  onChange: (v: ServicePricing) => void
}

// ── Styles ────────────────────────────────────────────────────────────────────

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

const vehicleLabel: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: '#7BAED4',
  letterSpacing: '0.05em',
  textTransform: 'uppercase',
  marginBottom: 8,
  marginTop: 4,
}

const fieldLbl: React.CSSProperties = {
  fontSize: 10,
  color: '#4A7FBB',
  fontWeight: 600,
  display: 'block',
  marginBottom: 4,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
}

const inp: React.CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  background: '#071829',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 7,
  color: 'white',
  fontSize: 12,
  fontFamily: 'Outfit, sans-serif',
  outline: 'none',
  boxSizing: 'border-box',
}

const grid4: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr 1fr 1fr',
  gap: 8,
  marginBottom: 12,
}

const divider: React.CSSProperties = {
  borderTop: '1px solid rgba(255,255,255,0.05)',
  marginBottom: 12,
}

// ── Sub-components ────────────────────────────────────────────────────────────

function PriceField({ label, value, onChange, placeholder }: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  return (
    <div>
      <label style={fieldLbl}>{label}</label>
      <input
        style={inp}
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder ?? '—'}
      />
    </div>
  )
}

function VehicleBlock({ label, value, onChange, showDims }: {
  label: string
  value: VehiclePrice & { height?: string; length?: string }
  onChange: (v: VehiclePrice & { height?: string; length?: string }) => void
  showDims?: boolean
}) {
  const v = value ?? {}
  return (
    <div>
      <div style={vehicleLabel}>{label}</div>
      <div style={grid4}>
        <PriceField
          label="Call out fee"
          value={v.callout ?? ''}
          onChange={val => onChange({ ...v, callout: val })}
          placeholder="e.g. $350"
        />
        <PriceField
          label="Included km"
          value={v.callout_km ?? ''}
          onChange={val => onChange({ ...v, callout_km: val })}
          placeholder="e.g. 10"
        />
        <PriceField
          label="Additional km"
          value={v.extra_km ?? ''}
          onChange={val => onChange({ ...v, extra_km: val })}
          placeholder="e.g. $5/km"
        />
        <PriceField
          label="Hourly rate"
          value={v.hourly ?? ''}
          onChange={val => onChange({ ...v, hourly: val })}
          placeholder="e.g. $120/hr"
        />
      </div>
      {showDims && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
          <PriceField
            label="Max height"
            value={(v as { height?: string }).height ?? ''}
            onChange={val => onChange({ ...v, height: val })}
            placeholder="e.g. 3.5m"
          />
          <PriceField
            label="Max length"
            value={(v as { length?: string }).length ?? ''}
            onChange={val => onChange({ ...v, length: val })}
            placeholder="e.g. 8m"
          />
        </div>
      )}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ServicePricingEditor({ value, onChange }: Props) {
  const pm = value.plant_machinery ?? {}
  const c20 = value.containers_20ft ?? {}
  const cars = value.cars_light_vehicles ?? {}
  const br = value.breakdown_recovery ?? {}
  const hv = value.heavy_vehicles ?? {}

  return (
    <div style={{ marginTop: 4 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#4A7FBB', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 6 }}>
        Service Pricing (quoted by agent on calls)
      </div>
      <p style={{ fontSize: 12, color: '#4A7FBB', marginTop: 0, marginBottom: 14 }}>
        Call out fee covers the included km. Beyond that, the additional km rate applies. Hourly rate is depot to depot.
      </p>

      {/* Plant & Machinery */}
      <div style={sectionStyle}>
        <div style={sectionTitle}>🏗️ Plant &amp; Machinery</div>
        <VehicleBlock label="Excavator" value={pm.excavator ?? {}} onChange={v => onChange({ ...value, plant_machinery: { ...pm, excavator: v } })} />
        <div style={divider} />
        <VehicleBlock label="Roller" value={pm.roller ?? {}} onChange={v => onChange({ ...value, plant_machinery: { ...pm, roller: v } })} />
        <div style={divider} />
        <VehicleBlock label="Bobcat / Positrac" value={pm.bobcat ?? {}} onChange={v => onChange({ ...value, plant_machinery: { ...pm, bobcat: v } })} />
        <div style={divider} />
        <VehicleBlock label="Tractor" value={pm.tractor ?? {}} onChange={v => onChange({ ...value, plant_machinery: { ...pm, tractor: v } })} />
      </div>

      {/* 20ft Containers */}
      <div style={sectionStyle}>
        <div style={sectionTitle}>📦 20ft Containers</div>
        <VehicleBlock label="Loaded 20ft Container" value={c20.loaded ?? {}} onChange={v => onChange({ ...value, containers_20ft: { ...c20, loaded: v } })} />
        <div style={divider} />
        <VehicleBlock label="Empty 20ft Container" value={c20.empty ?? {}} onChange={v => onChange({ ...value, containers_20ft: { ...c20, empty: v } })} />
      </div>

      {/* Cars & Light Vehicles */}
      <div style={sectionStyle}>
        <div style={sectionTitle}>🚗 Cars &amp; Light Vehicles</div>
        <VehicleBlock label="Standard (Hatchback / Sedan)" value={cars.standard ?? {}} onChange={v => onChange({ ...value, cars_light_vehicles: { ...cars, standard: v } })} />
        <div style={divider} />
        <VehicleBlock label="Sports / Lowered Car" value={cars.sports_lowered ?? {}} onChange={v => onChange({ ...value, cars_light_vehicles: { ...cars, sports_lowered: v } })} />
        <div style={divider} />
        <VehicleBlock label="SUV / Light Truck" value={cars.suv_light_truck ?? {}} onChange={v => onChange({ ...value, cars_light_vehicles: { ...cars, suv_light_truck: v } })} />
      </div>

      {/* Breakdown Recovery */}
      <div style={sectionStyle}>
        <div style={sectionTitle}>🔧 Breakdown Recovery</div>
        <VehicleBlock label="Tyre Change" value={br.tyre_change ?? {}} onChange={v => onChange({ ...value, breakdown_recovery: { ...br, tyre_change: v } })} />
        <div style={divider} />
        <VehicleBlock label="Jump Start" value={br.jump_start ?? {}} onChange={v => onChange({ ...value, breakdown_recovery: { ...br, jump_start: v } })} />
        <div style={divider} />
        <VehicleBlock label="Fuel Recovery" value={br.fuel_recovery ?? {}} onChange={v => onChange({ ...value, breakdown_recovery: { ...br, fuel_recovery: v } })} />
      </div>

      {/* Heavy Vehicles */}
      <div style={sectionStyle}>
        <div style={sectionTitle}>🚛 Heavy Vehicles</div>
        <div style={{ fontSize: 12, color: '#7BAED4', fontWeight: 700, marginBottom: 6 }}>MR — Medium Rigid</div>
        <VehicleBlock label="" value={hv.mr ?? {}} onChange={v => onChange({ ...value, heavy_vehicles: { ...hv, mr: v } })} showDims />
        <div style={divider} />
        <div style={{ fontSize: 12, color: '#7BAED4', fontWeight: 700, marginBottom: 6 }}>HR — Heavy Rigid</div>
        <VehicleBlock label="" value={hv.hr ?? {}} onChange={v => onChange({ ...value, heavy_vehicles: { ...hv, hr: v } })} showDims />
      </div>
    </div>
  )
}
