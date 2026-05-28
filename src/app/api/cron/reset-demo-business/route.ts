// Reset demo business state every 4 hours - Session 56 demo system.
//
// Restores the canonical demo business snapshot so that one rep's edits during
// a demo do not bleed into another rep's demo. Runs at off-minute :17 every 4
// hours to avoid top-of-hour stampede.
//
// Defense-in-depth: updates only filter on is_demo=true to ensure this cron
// can never touch a real client business.

import { NextResponse } from 'next/server'
import { verifyCron } from '@/lib/cron-auth'
import { createAdminClient } from '@/lib/supabase/server'
import { DEMO_BUSINESS_SNAPSHOTS } from '@/lib/demo-config'

export async function GET(request: Request) {
  const auth = verifyCron(request)
  if (auth) return auth

  const supabase = createAdminClient()
  const resetBusinesses: string[] = []
  const errors: Array<{ business_id: string; error: string }> = []

  try {
    for (const [key, snapshot] of Object.entries(DEMO_BUSINESS_SNAPSHOTS)) {
      const { error } = await supabase
        .from('businesses')
        .update({
          name: snapshot.name,
          business_type: snapshot.business_type,
          industry: snapshot.industry,
          phone_number: snapshot.phone_number,
          address: snapshot.address,
          plan: snapshot.plan,
          account_status: snapshot.account_status,
          greeting: snapshot.greeting,
          services: snapshot.services,
        })
        .eq('id', snapshot.id)
        .eq('is_demo', true)

      if (error) {
        errors.push({ business_id: snapshot.id, error: error.message })
      } else {
        resetBusinesses.push(snapshot.id)
      }
    }

    return NextResponse.json({
      status: 'reset',
      businesses: resetBusinesses,
      errors: errors.length > 0 ? errors : undefined,
    })
  } catch (err) {
    console.error('[reset-demo-business]', err)
    return NextResponse.json(
      {
        status: 'error',
        detail: err instanceof Error ? err.message : 'Unknown error',
      },
      { status: 500 },
    )
  }
}
