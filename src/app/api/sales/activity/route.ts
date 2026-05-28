import { NextResponse } from 'next/server'
import { requireSalesRep } from '@/lib/sales-auth'
import { createAdminClient } from '@/lib/supabase/server'

export async function GET(req: Request) {
  const auth = await requireSalesRep(req)
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status })

  const url = new URL(req.url)
  const since = url.searchParams.get('since') ?? 'week' // 'today' | 'week' | 'month'

  const now = new Date()
  let sinceDate: Date
  switch (since) {
    case 'today':
      sinceDate = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      break
    case 'month':
      sinceDate = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate())
      break
    case 'week':
    default:
      sinceDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
      break
  }

  const admin = createAdminClient()
  const { data: activities, error } = await admin
    .from('lead_activities')
    .select(`
      id, lead_id, activity_type, title, body, old_status, new_status, created_at,
      leads:lead_id ( business_name, contact_name )
    `)
    .eq('rep_id', auth.rep.id)
    .gte('created_at', sinceDate.toISOString())
    .order('created_at', { ascending: false })
    .limit(500)

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  // Flatten the embedded leads join into top-level fields for the mobile consumer.
  const flattened = (activities ?? []).map((a: any) => ({
    id: a.id,
    lead_id: a.lead_id,
    activity_type: a.activity_type,
    title: a.title,
    body: a.body,
    old_status: a.old_status,
    new_status: a.new_status,
    created_at: a.created_at,
    business_name: a.leads?.business_name ?? null,
    contact_name: a.leads?.contact_name ?? null,
  }))

  return NextResponse.json({ ok: true, activities: flattened })
}
