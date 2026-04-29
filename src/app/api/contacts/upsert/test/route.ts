import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// GET /api/contacts/upsert/test — admin only.
// Returns the expected payload structure with example data so Donna (or
// anyone wiring up Make.com) can validate the connection format.
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })

  const { data: userProfile } = await supabase.from('users').select('role').eq('id', user.id).single()
  const isSuperAdmin = user.email === process.env.INTERNAL_ALERT_EMAIL || user.email === 'hello@talkmate.com.au'
  if (userProfile?.role !== 'admin' && !isSuperAdmin) {
    return NextResponse.json({ ok: false, error: 'Admin only' }, { status: 403 })
  }

  return NextResponse.json({
    ok: true,
    sample_payload: {
      client_id: 'uuid-of-business',
      phone: '+61412345678',
      call_id: 'vapi-call-id-12345',
      call_at: new Date().toISOString(),
      duration_seconds: 127,
      transcript: 'Caller: Hi I\'d like to order...',
      summary: 'Customer placed order for fish and chips',
      extracted_name: 'John',
      extracted_email: null,
      outcome: 'order_placed',
      tags: ['new_caller', 'order'],
      industry_data: {
        order_items: ['large fish and chips', 'garlic bread'],
        order_value: 26.0,
        order_type: 'pickup',
      },
    },
    endpoint: 'POST /api/contacts/upsert',
    auth: 'Authorization: Bearer CRON_SECRET',
    notes: 'Send this payload after every completed Vapi call. client_id must match the business in Supabase.',
  })
}
