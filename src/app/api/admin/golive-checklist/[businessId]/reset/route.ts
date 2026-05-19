import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/admin-auth'
import { MANUAL_CHECK_KEYS } from '@/lib/golive-checks'

// Session 20 — Reset the manual portion of a client's Go-Live checklist.
// Auto checks recompute on the next GET, so we don't touch those.
// Also clears the verified_at / verified_by columns and flips
// businesses.golive_verified back to false.

export const dynamic = 'force-dynamic'

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ businessId: string }> },
) {
  const auth = await requireAdmin()
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { businessId } = await params
  const admin = createAdminClient()

  const manualReset = MANUAL_CHECK_KEYS.reduce((acc, k) => {
    acc[k] = false
    return acc
  }, {} as Record<string, boolean>)

  await admin
    .from('client_golive_checklist')
    .update({
      ...manualReset,
      verified_at: null,
      verified_by: null,
      updated_at: new Date().toISOString(),
    })
    .eq('business_id', businessId)

  await admin
    .from('businesses')
    .update({ golive_verified: false, golive_verified_at: null })
    .eq('id', businessId)

  return NextResponse.json({ ok: true })
}
