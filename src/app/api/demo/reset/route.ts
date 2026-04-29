import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { DEMO_PHONE_PREFIX } from '@/lib/demo-data'

// POST /api/demo/reset
// Body: { businessId: string }
// Admin-only. Deletes any contact whose phone starts with the demo prefix
// for the specified business. CASCADE handles contact_calls + contact_pipeline.
export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })

  const { data: userProfile } = await supabase.from('users').select('role').eq('id', user.id).single()
  const isSuperAdmin = user.email === process.env.INTERNAL_ALERT_EMAIL || user.email === 'hello@talkmate.com.au'
  if (userProfile?.role !== 'admin' && !isSuperAdmin) {
    return NextResponse.json({ ok: false, error: 'Admin only' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({})) as { businessId?: string }
  const businessId = body.businessId
  if (!businessId) return NextResponse.json({ ok: false, error: 'businessId required' }, { status: 400 })

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('contacts')
    .delete()
    .eq('client_id', businessId)
    .like('phone', `${DEMO_PHONE_PREFIX}%`)
    .select('id')
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, deleted: data?.length ?? 0 })
}
