import { NextResponse } from 'next/server'
import crypto from 'node:crypto'
import { requireAdmin } from '@/lib/admin-auth'
import { createAdminClient } from '@/lib/supabase/server'

// Session 41 — promote a won lead into a business + auth account.
//
// Mirrors the safety guards from /api/admin/clients/create:
//   * Pre-flight via auth.admin.listUsers() — if email collision, 409 with existing_user_id
//     so the wizard can deep-link to the existing business.
//   * On businesses INSERT failure: delete the orphan auth user (mirrors clients/create:191-195).
//
// Uses crypto.randomBytes for the temp password (NOT the Math.random helper
// in admin-auth.ts).

export async function POST(req: Request) {
  const auth = await requireAdmin()
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status })

  const body = await req.json().catch(() => ({})) as Record<string, unknown>

  const owner_email = String(body.owner_email ?? '').trim().toLowerCase()
  if (!owner_email || !owner_email.includes('@')) {
    return NextResponse.json(
      { ok: false, error: 'Owner email required to create login account' },
      { status: 400 },
    )
  }
  const lead_id = String(body.lead_id ?? '').trim()
  if (!lead_id) return NextResponse.json({ ok: false, error: 'lead_id required' }, { status: 400 })

  const admin = createAdminClient()

  // 1. Idempotency on the lead side.
  const { data: lead } = await admin
    .from('leads').select('*').eq('id', lead_id).maybeSingle()
  if (!lead) return NextResponse.json({ ok: false, error: 'Lead not found' }, { status: 404 })
  if (lead.status !== 'won') {
    return NextResponse.json({ ok: false, error: 'Lead not in won status' }, { status: 400 })
  }
  if (lead.business_id) {
    return NextResponse.json(
      { ok: false, error: 'Lead already linked to a business', existing_business_id: lead.business_id },
      { status: 409 },
    )
  }

  // 2. Email collision pre-flight (mirrors clients/create:88-101).
  const { data: existing } = await admin.auth.admin.listUsers()
  const existingUser = existing?.users?.find(u => u.email?.toLowerCase() === owner_email)
  if (existingUser) {
    const { data: existingBiz } = await admin.from('businesses')
      .select('id, name').eq('owner_user_id', existingUser.id).maybeSingle()
    return NextResponse.json({
      ok: false,
      error: 'An account with this email already exists. Link the lead to the existing business manually.',
      duplicate_field: 'email',
      existing_user_id: existingUser.id,
      existing_business_id: existingBiz?.id ?? null,
    }, { status: 409 })
  }

  // 3. Strong temp_password (crypto.randomBytes, not Math.random).
  const temp_password = crypto.randomBytes(12).toString('base64url').slice(0, 12)

  // 4. Create the Supabase auth user.
  const { data: createdAuth, error: authError } = await admin.auth.admin.createUser({
    email: owner_email,
    password: temp_password,
    email_confirm: true,
    user_metadata: {
      full_name: lead.contact_name ?? '',
      created_by_admin: true,
      source: 'sales_rep_won_lead',
    },
  })
  if (authError || !createdAuth?.user) {
    return NextResponse.json(
      { ok: false, error: authError?.message ?? 'Failed to create auth user' },
      { status: 500 },
    )
  }
  const newUserId = createdAuth.user.id

  // 5. Mirror into public.users.
  await admin.from('users').upsert({
    id: newUserId,
    email: owner_email,
    full_name: lead.contact_name ?? null,
    role: 'owner',
  }, { onConflict: 'id' })

  // 6. Insert the businesses row.
  const { data: business, error: bizError } = await admin.from('businesses').insert({
    name: (body.business_name as string | undefined) ?? lead.business_name,
    phone_number: (body.phone_number as string | undefined) ?? lead.phone,
    address: (body.address as string | undefined) ?? null,
    website: (body.website as string | undefined) ?? lead.website,
    abn: (body.abn as string | undefined) ?? null,
    industry: (body.industry as string | undefined) ?? lead.industry,
    trade_type: (body.trade_type as string | undefined) ?? null,
    timezone: (body.timezone as string | undefined) ?? 'Australia/Brisbane',
    plan: lead.won_plan,
    billing_cycle: lead.won_billing_cycle,
    account_status: 'pending',
    onboarded_by: 'sales_rep',
    sales_rep_id: lead.assigned_to,
    owner_user_id: newUserId,
    email: owner_email,
    temp_password,
    welcome_email_sent: false,
    onboarding_started_at: new Date().toISOString(),
  }).select('id, name').single()

  if (bizError || !business) {
    // ROLLBACK: delete the orphan auth user (mirrors clients/create:193).
    await admin.auth.admin.deleteUser(newUserId).catch(() => {})
    return NextResponse.json(
      { ok: false, error: bizError?.message ?? 'Failed to create business' },
      { status: 500 },
    )
  }

  // 7. Link lead and commissions to the new business.
  await admin.from('leads').update({ business_id: business.id }).eq('id', lead_id)
  await admin.from('commissions').update({ business_id: business.id })
    .eq('lead_id', lead_id).is('business_id', null)

  // 8. Audit log.
  await admin.from('admin_audit_log').insert({
    admin_email: auth.user.email ?? 'unknown',
    action: 'business_created_from_lead',
    business_id: business.id,
    business_name: business.name,
  })

  return NextResponse.json({ ok: true, business_id: business.id, temp_password })
}
