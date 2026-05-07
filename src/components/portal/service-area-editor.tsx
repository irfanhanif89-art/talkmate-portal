'use client'

import { useState, useEffect, useRef } from 'react'

export type ServiceArea = {
  base_address?: string
  radius_km?: number
  excluded_areas?: string
  lat?: number
  lng?: number
}

interface Props {
  value: ServiceArea
  businessAddress?: string
  onChange: (v: ServiceArea) => void
}

const RADIUS_PRESETS = [25, 50, 75, 100, 150, 200]

const lbl: React.CSSProperties = {
  fontSize: 11,
  color: '#4A7FBB',
  fontWeight: 700,
  display: 'block',
  marginBottom: 6,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
}

const inp: React.CSSProperties = {
  width: '100%',
  padding: '10px 13px',
  background: '#071829',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 8,
  color: 'white',
  fontSize: 13,
  fontFamily: 'Outfit, sans-serif',
  outline: 'none',
  boxSizing: 'border-box',
}

async function geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&countrycodes=au&limit=1`
    const res = await fetch(url, { headers: { 'User-Agent': 'TalkMate/1.0 (hello@talkmate.com.au)' } })
    const data = await res.json()
    if (data && data.length > 0) {
      return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) }
    }
  } catch {}
  return null
}

function MapEmbed({ lat, lng, radiusKm }: { lat: number; lng: number; radiusKm: number }) {
  // Calculate bbox so the radius circle fits in the viewport
  // 1 degree lat ≈ 111km, 1 degree lng ≈ 111km * cos(lat)
  const latDelta = (radiusKm / 111) * 1.3
  const lngDelta = (radiusKm / (111 * Math.cos((lat * Math.PI) / 180))) * 1.3
  const bbox = [lng - lngDelta, lat - latDelta, lng + lngDelta, lat + latDelta].join(',')
  const src = `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat},${lng}`

  return (
    <div style={{ position: 'relative', borderRadius: 12, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.07)', marginBottom: 14 }}>
      <iframe
        src={src}
        width="100%"
        height="280"
        style={{ display: 'block', border: 'none' }}
        loading="lazy"
        title="Service area map"
      />
      {/* Radius badge overlay */}
      <div style={{
        position: 'absolute',
        top: 10,
        left: 10,
        background: 'rgba(6,19,34,0.9)',
        border: '1px solid rgba(232,98,42,0.4)',
        borderRadius: 8,
        padding: '6px 12px',
        fontSize: 13,
        fontWeight: 700,
        color: '#E8622A',
        fontFamily: 'Outfit, sans-serif',
        backdropFilter: 'blur(4px)',
      }}>
        📍 {radiusKm}km radius
      </div>
    </div>
  )
}

export default function ServiceAreaEditor({ value, businessAddress, onChange }: Props) {
  const [geocoding, setGeocoding] = useState(false)
  const [geocodeError, setGeocodeError] = useState('')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const address = value.base_address ?? businessAddress ?? ''
  const radiusKm = value.radius_km ?? 100

  // Auto-geocode when address changes
  useEffect(() => {
    if (!address) return
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      setGeocoding(true); setGeocodeError('')
      const coords = await geocodeAddress(address)
      setGeocoding(false)
      if (coords) {
        onChange({ ...value, base_address: address, lat: coords.lat, lng: coords.lng })
      } else {
        setGeocodeError('Could not locate address — check spelling or try a suburb + state')
      }
    }, 800)
  }, [address]) // eslint-disable-line react-hooks/exhaustive-deps

  function setAddress(a: string) {
    onChange({ ...value, base_address: a, lat: undefined, lng: undefined })
  }

  function setRadius(r: number) {
    onChange({ ...value, radius_km: r })
  }

  return (
    <div style={{
      background: 'rgba(255,255,255,0.03)',
      border: '1px solid rgba(255,255,255,0.07)',
      borderRadius: 14,
      padding: '18px 20px',
      marginTop: 4,
    }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#4A7FBB', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 16 }}>
        📍 Service Area
      </div>

      {/* Base address */}
      <div style={{ marginBottom: 16 }}>
        <label style={lbl}>Depot / Base address</label>
        <input
          style={inp}
          value={address}
          onChange={e => setAddress(e.target.value)}
          placeholder="123 Main St, Brisbane QLD 4000"
        />
        {geocoding && <p style={{ fontSize: 12, color: '#4A7FBB', marginTop: 5 }}>📍 Locating address…</p>}
        {geocodeError && <p style={{ fontSize: 12, color: '#f59e0b', marginTop: 5 }}>⚠️ {geocodeError}</p>}
      </div>

      {/* Radius picker */}
      <div style={{ marginBottom: 16 }}>
        <label style={lbl}>Service radius</label>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
          {RADIUS_PRESETS.map(r => (
            <button
              key={r}
              type="button"
              onClick={() => setRadius(r)}
              style={{
                padding: '7px 16px',
                borderRadius: 8,
                border: `1.5px solid ${radiusKm === r ? '#E8622A' : 'rgba(255,255,255,0.1)'}`,
                background: radiusKm === r ? 'rgba(232,98,42,0.12)' : 'transparent',
                color: radiusKm === r ? '#E8622A' : '#7BAED4',
                fontFamily: 'Outfit, sans-serif',
                fontSize: 13,
                fontWeight: radiusKm === r ? 700 : 500,
                cursor: 'pointer',
              }}
            >
              {r}km
            </button>
          ))}
          {/* Custom input */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input
              type="number"
              min={1}
              max={999}
              value={RADIUS_PRESETS.includes(radiusKm) ? '' : radiusKm}
              onChange={e => { const v = parseInt(e.target.value); if (!isNaN(v) && v > 0) setRadius(v) }}
              placeholder="Custom"
              style={{ ...inp, width: 90, padding: '7px 10px' }}
            />
            <span style={{ fontSize: 12, color: '#4A7FBB' }}>km</span>
          </div>
        </div>
        <p style={{ fontSize: 12, color: '#4A7FBB', margin: 0 }}>
          Your agent will tell callers you service within <strong style={{ color: 'white' }}>{radiusKm}km</strong> of your depot. Jobs beyond this will be quoted on application.
        </p>
      </div>

      {/* Map preview */}
      {value.lat && value.lng ? (
        <MapEmbed lat={value.lat} lng={value.lng} radiusKm={radiusKm} />
      ) : address ? (
        <div style={{ background: '#071829', border: '1px dashed rgba(255,255,255,0.08)', borderRadius: 10, padding: '24px', textAlign: 'center', marginBottom: 14 }}>
          <p style={{ fontSize: 13, color: '#4A7FBB', margin: 0 }}>Enter an address above to preview the map</p>
        </div>
      ) : null}

      {/* Excluded areas */}
      <div>
        <label style={lbl}>Excluded areas <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, color: '#4A7FBB', fontSize: 11 }}>(optional)</span></label>
        <textarea
          value={value.excluded_areas ?? ''}
          onChange={e => onChange({ ...value, excluded_areas: e.target.value })}
          placeholder="e.g. We do not service CBD or inner suburbs. No interstate jobs."
          rows={2}
          style={{ ...inp, resize: 'vertical' as const }}
        />
        <p style={{ fontSize: 11, color: '#4A7FBB', marginTop: 5 }}>Any areas outside your radius or specific exclusions. Your agent will relay this to callers.</p>
      </div>
    </div>
  )
}
