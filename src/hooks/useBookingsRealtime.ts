'use client'

import { useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

// =====================================================================
// useBookingsRealtime — Subscribe to PostgresChanges on `bookings`
// filtered by client_id. Each event invokes the callback with the
// payload's eventType + new/old rows.
//
// Brief §MOBILE ↔ PORTAL TWO-WAY SYNC ARCHITECTURE. Portal-side hook
// only — mobile-side equivalent is Phase 2 (see DECISIONS-scheduler.md
// §D12).
//
// The caller is responsible for merging the payload into its own
// state. The hook does not own state itself, which keeps it composable
// with the existing scheduler-view.tsx useState/setBookings pattern.
// =====================================================================

type BookingsEvent =
  | { eventType: 'INSERT'; new: Record<string, unknown>; old: null }
  | { eventType: 'UPDATE'; new: Record<string, unknown>; old: Record<string, unknown> }
  | { eventType: 'DELETE'; new: null; old: Record<string, unknown> }

export function useBookingsRealtime(
  clientId: string | null,
  onChange: (event: BookingsEvent) => void,
) {
  useEffect(() => {
    if (!clientId) return
    const supabase = createClient()
    const channel = supabase
      .channel(`bookings-${clientId}`)
      .on(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- supabase realtime payload typings are weak
        'postgres_changes' as any,
        {
          event: '*',
          schema: 'public',
          table: 'bookings',
          filter: `client_id=eq.${clientId}`,
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (payload: any) => {
          // Normalize the payload to our discriminated union shape.
          if (payload.eventType === 'INSERT') {
            onChange({
              eventType: 'INSERT',
              new: payload.new ?? {},
              old: null,
            })
          } else if (payload.eventType === 'UPDATE') {
            onChange({
              eventType: 'UPDATE',
              new: payload.new ?? {},
              old: payload.old ?? {},
            })
          } else if (payload.eventType === 'DELETE') {
            onChange({
              eventType: 'DELETE',
              new: null,
              old: payload.old ?? {},
            })
          }
        },
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
    // The onChange identity is intentionally not a dep; callers should
    // wrap it in useCallback if they need stable identity. Resubscribing
    // on every render would tear down + recreate the websocket channel
    // unnecessarily.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId])
}
