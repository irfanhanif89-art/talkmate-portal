// GET /api/email/threads — user auth (or ?adminClientId). Lists threads.

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { resolveBusinessId } from '@/lib/resolve-business'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const adminClientId = request.nextUrl.searchParams.get('adminClientId')
  const auth = await resolveBusinessId(adminClientId, request)
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status })

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('email_threads')
    .select('id, from_email, from_name, subject, last_message_preview, last_message_at, unread_count, status')
    .eq('business_id', auth.businessId)
    .neq('status', 'spam')
    .order('last_message_at', { ascending: false })
    .limit(200)
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, threads: data ?? [] })
}
