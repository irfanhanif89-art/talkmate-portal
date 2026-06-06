'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

// =====================================================================
// useActiveCall — Session 6A live-call indicator.
//
// Returns the current in-progress call for a business (or null). Does an
// initial fetch (so a call already in progress shows on page load) then
// subscribes to realtime INSERT/UPDATE/DELETE on `active_calls` filtered
// by business_id. RLS restricts the row to the owning business.
// =====================================================================

export interface ActiveCall {
  vapi_call_id: string
  from_number: string | null
  started_at: string
}

export function useActiveCall(businessId: string | null): ActiveCall | null {
  const [activeCall, setActiveCall] = useState<ActiveCall | null>(null)

  useEffect(() => {
    if (!businessId) return
    const supabase = createClient()
    let cancelled = false

    // Initial fetch — surface a call that's already live when the page loads.
    supabase
      .from('active_calls')
      .select('vapi_call_id, from_number, started_at')
      .eq('business_id', businessId)
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled && data) setActiveCall(data as ActiveCall)
      })

    const channel = supabase
      .channel(`active-call-${businessId}`)
      .on(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- supabase realtime payload typings are weak
        'postgres_changes' as any,
        {
          event: '*',
          schema: 'public',
          table: 'active_calls',
          filter: `business_id=eq.${businessId}`,
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (payload: any) => {
          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            setActiveCall((payload.new ?? null) as ActiveCall | null)
          } else if (payload.eventType === 'DELETE') {
            setActiveCall(null)
          }
        },
      )
      .subscribe()

    return () => {
      cancelled = true
      supabase.removeChannel(channel)
    }
  }, [businessId])

  return activeCall
}
