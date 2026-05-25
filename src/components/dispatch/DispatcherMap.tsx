'use client'

// Sessions 36-37 — dispatcher live map. MapLibre GL JS over
// OpenStreetMap tiles (no API key). Subscribes to driver_locations
// via Supabase Realtime so pins move within ~30s of the driver's
// last broadcast.
//
// Pin colours:
//   - orange : online + available (no active job)
//   - blue   : online + on an active job
//   - grey   : offline (hidden by default toggle)
//
// Clicking a pin fires onDriverClick so the parent can open the
// driver's current job detail.

import { useEffect, useMemo, useRef, useState } from 'react'
import maplibregl, { Map as MapLibreMap, Marker } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { createClient } from '@/lib/supabase/client'

export interface DispatcherMapDriver {
  id: string
  name: string
  truck_type: string | null
  truck_rego: string | null
  is_online: boolean
  is_available: boolean
  active_job_id?: string | null
  active_job_status?: string | null
}

export interface DispatcherMapLocation {
  driver_id: string
  lat: number
  lng: number
  heading: number | null
  updated_at: string
}

export interface DispatcherMapProps {
  clientId: string
  drivers: DispatcherMapDriver[]
  initialLocations: DispatcherMapLocation[]
  onDriverClick?: (driverId: string) => void
}

const MAP_STYLE = {
  version: 8 as const,
  sources: {
    osm: {
      type: 'raster' as const,
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution: '© OpenStreetMap contributors',
    },
  },
  layers: [{ id: 'osm', type: 'raster' as const, source: 'osm' }],
}

const DEFAULT_CENTRE: [number, number] = [153.4, -28.0] // Gold Coast-ish

export function DispatcherMap({
  clientId,
  drivers,
  initialLocations,
  onDriverClick,
}: DispatcherMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const markersRef = useRef<Map<string, Marker>>(new Map())
  const supabase = useMemo(() => createClient(), [])
  const [showOffline, setShowOffline] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<number | null>(
    initialLocations.length
      ? Math.max(...initialLocations.map(l => new Date(l.updated_at).getTime()))
      : null,
  )
  const [tick, setTick] = useState(0)

  // Live "x seconds ago" counter.
  useEffect(() => {
    const t = setInterval(() => setTick(n => n + 1), 1000)
    return () => clearInterval(t)
  }, [])

  const driversById = useMemo(() => {
    const m = new Map<string, DispatcherMapDriver>()
    drivers.forEach(d => m.set(d.id, d))
    return m
  }, [drivers])

  // Boot the map once.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    mapRef.current = new maplibregl.Map({
      container: containerRef.current,
      style: MAP_STYLE,
      center: DEFAULT_CENTRE,
      zoom: 10,
      attributionControl: { compact: true },
    })
    mapRef.current.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')

    // Drop initial pins.
    initialLocations.forEach(loc => upsertMarker(loc))

    // Centre on the fleet if we have any.
    centreOnFleet()

    return () => {
      markersRef.current.forEach(m => m.remove())
      markersRef.current.clear()
      mapRef.current?.remove()
      mapRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Subscribe to driver_locations changes for this business.
  useEffect(() => {
    const channel = supabase
      .channel(`dispatcher-locations-${clientId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'driver_locations',
          filter: `client_id=eq.${clientId}`,
        },
        (payload) => {
          if (payload.eventType === 'DELETE') {
            const id = (payload.old as { driver_id?: string }).driver_id
            if (id) removeMarker(id)
          } else {
            const row = payload.new as DispatcherMapLocation
            upsertMarker(row)
            setLastUpdated(new Date(row.updated_at).getTime())
          }
        },
      )
      .subscribe()
    return () => { void supabase.removeChannel(channel) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId])

  function upsertMarker(loc: DispatcherMapLocation) {
    const map = mapRef.current
    if (!map) return
    const driver = driversById.get(loc.driver_id)
    if (!driver) return
    if (!driver.is_online && !showOffline) {
      removeMarker(loc.driver_id)
      return
    }

    const colour = !driver.is_online
      ? '#9ca3af'
      : driver.active_job_id
        ? '#1565C0'
        : '#E8622A'

    const el = document.createElement('div')
    el.style.cssText = `
      width: 28px; height: 28px; border-radius: 50%;
      background: ${colour}; border: 3px solid #fff;
      box-shadow: 0 2px 6px rgba(0,0,0,0.25);
      cursor: pointer; display: flex; align-items: center; justify-content: center;
      font-size: 11px; font-weight: 700; color: #fff; font-family: 'Outfit', sans-serif;
    `
    el.textContent = initials(driver.name)
    el.title = `${driver.name}${driver.truck_type ? ' · ' + driver.truck_type : ''}`
    el.onclick = () => onDriverClick?.(driver.id)

    const existing = markersRef.current.get(loc.driver_id)
    if (existing) existing.remove()
    const marker = new maplibregl.Marker({ element: el })
      .setLngLat([Number(loc.lng), Number(loc.lat)])
      .addTo(map)
    markersRef.current.set(loc.driver_id, marker)
  }

  function removeMarker(driverId: string) {
    const m = markersRef.current.get(driverId)
    if (m) {
      m.remove()
      markersRef.current.delete(driverId)
    }
  }

  function centreOnFleet() {
    const map = mapRef.current
    if (!map || markersRef.current.size === 0) return
    const bounds = new maplibregl.LngLatBounds()
    markersRef.current.forEach(m => bounds.extend(m.getLngLat()))
    map.fitBounds(bounds, { padding: 60, maxZoom: 14, duration: 600 })
  }

  // Recompute visibility whenever the toggle flips.
  useEffect(() => {
    initialLocations.forEach(loc => {
      const driver = driversById.get(loc.driver_id)
      if (!driver) return
      if (!driver.is_online && !showOffline) removeMarker(loc.driver_id)
      else upsertMarker(loc)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showOffline, drivers])

  const ago = lastUpdated == null ? null : Math.max(0, Math.floor((Date.now() - lastUpdated) / 1000))

  return (
    <div style={{ position: 'relative', borderRadius: 12, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.08)' }}>
      <div ref={containerRef} style={{ width: '100%', height: 300 }} />
      <div style={{
        position: 'absolute',
        left: 10,
        bottom: 10,
        background: 'rgba(6,19,34,0.85)',
        color: '#fff',
        padding: '6px 10px',
        borderRadius: 6,
        fontSize: 12,
        fontFamily: 'Outfit, sans-serif',
        display: 'flex',
        gap: 10,
        alignItems: 'center',
      }}>
        <span suppressHydrationWarning>
          {ago == null ? 'Waiting for first ping…' : `Last update ${ago}s ago`}
          <span style={{ display: 'none' }}>{tick}</span>
        </span>
        <button
          onClick={centreOnFleet}
          style={{
            background: 'rgba(255,255,255,0.12)',
            border: 'none',
            color: '#fff',
            padding: '4px 10px',
            borderRadius: 4,
            fontSize: 11,
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          Centre on fleet
        </button>
        <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={showOffline}
            onChange={e => setShowOffline(e.target.checked)}
            style={{ accentColor: '#E8622A' }}
          />
          Show offline
        </label>
      </div>
    </div>
  )
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map(p => p[0]?.toUpperCase() ?? '')
    .slice(0, 2)
    .join('')
}
