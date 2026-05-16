import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/admin-auth'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; accountId: string }> },
) {
  const auth = await requireAdmin()
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const { id, accountId } = await params

  const admin = createAdminClient()
  const { data: account, error: accountErr } = await admin
    .from('vip_callers')
    .select('id, company_name, name, phone, linked_numbers, account_type')
    .eq('id', accountId)
    .eq('client_id', id)
    .eq('account_type', 'account')
    .maybeSingle()
  if (accountErr) return NextResponse.json({ error: accountErr.message }, { status: 500 })
  if (!account) return NextResponse.json({ error: 'Account not found' }, { status: 404 })

  const linkedRaw = Array.isArray(account.linked_numbers) ? account.linked_numbers : []
  const phones = Array.from(new Set([
    ...((linkedRaw as Array<{ phone?: string }>).map(n => n?.phone ?? '').filter(Boolean)),
    account.phone,
  ])).filter(Boolean)

  const [jobsRes, callsRes] = await Promise.all([
    admin
      .from('bookings')
      .select('id, scheduled_start, scheduled_end, description, pickup_address, dropoff_address, truck_type, rate_type, status, estimated_value, created_at')
      .eq('client_id', id)
      .eq('account_id', accountId)
      .order('scheduled_start', { ascending: false })
      .limit(200),
    phones.length === 0
      ? Promise.resolve({ data: [] as Array<Record<string, unknown>>, error: null })
      : admin
          .from('calls')
          .select('id, caller_phone, outcome, duration_seconds, summary, started_at, created_at')
          .eq('business_id', id)
          .in('caller_phone', phones)
          .order('created_at', { ascending: false })
          .limit(200),
  ])

  if (jobsRes.error) return NextResponse.json({ error: jobsRes.error.message }, { status: 500 })
  if (callsRes.error) return NextResponse.json({ error: callsRes.error.message }, { status: 500 })

  return NextResponse.json({
    account: {
      id: account.id,
      company_name: account.company_name ?? account.name,
      phones,
    },
    jobs: jobsRes.data ?? [],
    calls: callsRes.data ?? [],
  })
}
