import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireSalesRep } from '@/lib/sales-auth'

interface ItemIn {
  type?: string
  day?: number
  email_subject?: string
  email_body?: string
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireSalesRep()
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status })
  const { id: leadId } = await ctx.params

  const body = (await req.json().catch(() => ({}))) as { items?: ItemIn[] }
  const items = Array.isArray(body.items) ? body.items : []

  const admin = createAdminClient()
  const { data: lead } = await admin
    .from('leads')
    .select('id, assigned_to')
    .eq('id', leadId)
    .maybeSingle()

  if (!lead || lead.assigned_to !== auth.rep.id) {
    return NextResponse.json({ ok: false, error: 'Lead not found' }, { status: 404 })
  }

  const now = Date.now()
  const rows = items
    .filter(it => (it.type === 'email' || it.type === 'call_reminder') && typeof it.day === 'number' && it.day > 0)
    .map(it => ({
      lead_id: leadId,
      rep_id: auth.rep.id,
      type: it.type,
      send_at: new Date(now + (it.day as number) * 24 * 60 * 60 * 1000).toISOString(),
      status: 'pending',
      email_subject: it.email_subject ?? null,
      email_body: it.email_body ?? null,
    }))

  if (rows.length === 0) {
    return NextResponse.json({ ok: true, count: 0 })
  }

  const { error } = await admin.from('lead_followups').insert(rows)
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, count: rows.length })
}
