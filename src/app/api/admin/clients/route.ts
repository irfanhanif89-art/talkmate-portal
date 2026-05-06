import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/admin-auth'

// GET /api/admin/clients
// Returns every business in the system with the fields the admin "Clients"
// list and "Overview" page need. Sorted newest-first per the brief.
export async function GET() {
  const auth = await requireAdmin()
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status })

  const admin = createAdminClient()

  const { data: businesses, error } = await admin
    .from('businesses')
    .select(`
      id, name, phone_number, address, website, abn, industry, plan,
      account_status, onboarded_by, agent_status, agent_phone_number,
      welcome_email_sent, stripe_payment_link, stripe_customer_id,
      billing_override_note, manual_next_billing_date,
      onboarding_completed, owner_user_id,
      tos_accepted_at, tos_accepted_version,
      created_at, signup_at
    `)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, businesses: businesses ?? [] })
}
