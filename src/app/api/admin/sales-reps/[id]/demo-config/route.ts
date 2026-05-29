import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-auth'
import { createAdminClient } from '@/lib/supabase/server'
import { DEMO_INDUSTRIES, type DemoIndustryKey } from '@/lib/demo-config'

const VALID_KEYS = new Set<string>(DEMO_INDUSTRIES.map((i) => i.key))

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireAdmin()
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }

    const { id: repId } = await params

    const body = await req.json().catch(() => ({}))
    const raw = body?.demo_industry

    // Normalise: null or empty string -> null, otherwise validate key
    let normalizedValue: string | null = null
    if (raw !== null && raw !== undefined && raw !== '') {
      if (!VALID_KEYS.has(String(raw))) {
        return NextResponse.json(
          { error: `Invalid demo_industry: ${raw}` },
          { status: 400 },
        )
      }
      normalizedValue = String(raw) as DemoIndustryKey
    }

    const supabase = createAdminClient()

    const { data: rep, error: fetchErr } = await supabase
      .from('sales_reps')
      .select('id, email, full_name, demo_industry')
      .eq('id', repId)
      .single()

    if (fetchErr || !rep) {
      return NextResponse.json({ error: 'Sales rep not found' }, { status: 404 })
    }

    const { error: updateErr } = await supabase
      .from('sales_reps')
      .update({ demo_industry: normalizedValue })
      .eq('id', repId)

    if (updateErr) {
      console.error('[demo-config] update error', updateErr)
      return NextResponse.json({ error: 'Failed to update demo industry' }, { status: 500 })
    }

    await supabase.from('admin_audit_log').insert({
      admin_email: auth.user.email,
      action: 'rep_demo_industry_updated',
      before_value: {
        rep_id: repId,
        rep_email: rep.email,
        demo_industry: rep.demo_industry,
      },
      after_value: {
        rep_id: repId,
        rep_email: rep.email,
        demo_industry: normalizedValue,
      },
    })

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[demo-config]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
