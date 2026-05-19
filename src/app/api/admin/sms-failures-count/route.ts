import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/admin-auth'

// Session 19 — count of SMS delivery failures in the last 24h, used to
// drive a red badge in the sidebar Admin section.

export const dynamic = 'force-dynamic'

export async function GET() {
  const auth = await requireAdmin()
  if (!auth.ok) return NextResponse.json({ count: 0 })

  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const admin = createAdminClient()
  const { count } = await admin
    .from('sms_log')
    .select('id', { count: 'exact', head: true })
    .in('status', ['failed', 'rejected'])
    .gte('sent_at', cutoff)

  return NextResponse.json({ count: count ?? 0 })
}
