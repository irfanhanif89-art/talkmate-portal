'use client'

// Sessions 36-37 — driver-side GPS broadcast. While online (and with
// consent), every 30 seconds upsert the driver's current position to
// `driver_locations`. Supabase Realtime forwards the row change to
// the dispatcher map without polling.
//
// If the driver is on an active job, also append to
// `driver_location_history` for route replay.
//
// Cleanup: when the driver goes offline (the parent flips `isOnline`)
// or the component unmounts, delete the row so the pin disappears
// from the dispatcher map immediately.

import { useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

export function useDriverLocationBroadcast({
  driverId,
  clientId,
  isOnline,
  activeJobId,
  intervalMs = 30_000,
}: {
  driverId: string | null
  clientId: string | null
  isOnline: boolean
  activeJobId: string | null
  intervalMs?: number
}) {
  const supabase = createClient()

  useEffect(() => {
    if (!isOnline || !driverId || !clientId) return
    if (typeof navigator === 'undefined' || !navigator.geolocation) return

    let cancelled = false

    const broadcast = () => {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          if (cancelled) return
          const { latitude, longitude, heading, speed, accuracy } = position.coords

          await supabase.from('driver_locations').upsert({
            driver_id: driverId,
            client_id: clientId,
            lat: latitude,
            lng: longitude,
            heading: heading ?? null,
            speed_kmh: speed != null && Number.isFinite(speed)
              ? Math.round(speed * 3.6 * 10) / 10
              : null,
            accuracy_m: accuracy ? Math.round(accuracy) : null,
            updated_at: new Date().toISOString(),
          })

          if (activeJobId) {
            await supabase.from('driver_location_history').insert({
              driver_id: driverId,
              client_id: clientId,
              dispatch_job_id: activeJobId,
              lat: latitude,
              lng: longitude,
            })
          }
        },
        (err) => console.error('[driver-location] GPS error', err),
        { enableHighAccuracy: true, timeout: 10_000, maximumAge: 0 },
      )
    }

    // Fire immediately on going online, then every interval.
    broadcast()
    const handle = setInterval(broadcast, intervalMs)

    return () => {
      cancelled = true
      clearInterval(handle)
      // Best-effort: remove the pin from the dispatcher map when the
      // driver goes offline / navigates away.
      supabase.from('driver_locations').delete().eq('driver_id', driverId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOnline, driverId, clientId, activeJobId])
}
