import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireSalesRep } from '@/lib/sales-auth'
import { sendEmail } from '@/lib/resend'
import { generateTempPassword } from '@/lib/admin-auth'
import { clientWelcomeEmailHtml } from '@/lib/sales-notify'

export async function POST(req: Request) {
  const auth = await requireSalesRep()
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status })

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const lead_id = String(body.lead_id ?? '').trim()
  const business_name = String(body.business_name ?? '').trim()
  const industry = body.industry ? String(body.industry).trim() : null
  const abn = body.abn ? String(body.abn).trim() : null
  const address = body.address ? String(body.address).trim() : null
  const website = body.website ? String(body.website).trim() : null
  const first_name = String(body.first_name ?? '').trim()
  const last_name = String(body.last_name ?? '').trim()
  const email = String(body.email ?? '').trim().toLowerCase()
  const phone = String(body.phone ?? '').trim()
  const preferred_contact = String(body.preferred_contact ?? 'phone')

  if (!lead_id) return NextResponse.json({ ok: false, error: 'lead_id is required' }, { status: 400 })
  if (!business_name) return NextResponse.json({ ok: false, error: 'business_name is required' }, { status: 400 })
  if (!first_name || !last_name) return NextResponse.json({ ok: false, error: 'first_name and last_name are required' }, { status: 400 })
  if (!email || !email.includes('@')) return NextResponse.json({ ok: false, error: 'A valid email is required' }, { status: 400 })
  if (!phone) return NextResponse.json({ ok: false, error: 'phone is required' }, { status: 400 })

  const admin = createAdminClient()

  // 1. Verify the lead is owned by this rep, approved, and not yet onboarded.
  const { data: lead } = await admin
    .from('leads')
    .select('id, assigned_to, status, approval_status, business_id, won_plan')
    .eq('id', lead_id)
    .maybeSingle()

  if (!lead || lead.assigned_to !== auth.rep.id) {
    return NextResponse.json({ ok: false, error: 'Lead not found' }, { status: 403 })
  }
  if (lead.approval_status !== 'approved') {
    return NextResponse.json({ ok: false, error: 'This deal has not been approved by admin yet' }, { status: 403 })
  }
  if (lead.business_id) {
    return NextResponse.json({ ok: false, error: 'This client has already been onboarded' }, { status: 409 })
  }
  if (!lead.won_plan) {
    return NextResponse.json({ ok: false, error: 'Lead is missing the won plan' }, { status: 400 })
  }

  // 2. Email duplicate guard.
  const { data: existing } = await admin.auth.admin.listUsers()
  const dup = existing?.users?.find(u => u.email?.toLowerCase() === email)
  if (dup) {
    return NextResponse.json({
      ok: false,
      error: 'A TalkMate account already exists for this email address.',
    }, { status: 409 })
  }

  // 3. Create Supabase Auth user with a temp password.
  const temp_password = generateTempPassword(10)
  const ownerName = `${first_name} ${last_name}`.trim()
  const { data: createdAuth, error: authError } = await admin.auth.admin.createUser({
    email,
    password: temp_password,
    email_confirm: true,
    user_metadata: { full_name: ownerName, created_by_sales_rep: true },
  })
  if (authError || !createdAuth?.user) {
    return NextResponse.json({ ok: false, error: authError?.message ?? 'Failed to create auth user' }, { status: 500 })
  }
  const newUserId = createdAuth.user.id

  // Mirror into public.users
  await admin.from('users').upsert({
    id: newUserId, email, full_name: ownerName, role: 'owner',
  }, { onConflict: 'id' })

  // 4. Create the businesses row.
  const plan = lead.won_plan as 'starter' | 'growth' | 'pro'
  const planCallLimit = plan === 'pro' ? 100000 : plan === 'growth' ? 800 : 300

  const { data: business, error: bizError } = await admin
    .from('businesses')
    .insert({
      name: business_name,
      phone_number: phone,
      address,
      website,
      abn,
      industry,
      plan,
      plan_call_limit: planCallLimit,
      business_type: 'other',
      owner_user_id: newUserId,
      account_status: 'pending',
      onboarded_by: 'sales_rep',
      temp_password,
      welcome_email_sent: false,
      onboarding_completed: false,
      notifications_config: {
        client_first_name: first_name,
        client_last_name: last_name,
        preferred_contact,
        created_by_rep_id: auth.rep.id,
      },
    })
    .select('id')
    .single()

  if (bizError || !business) {
    await admin.auth.admin.deleteUser(newUserId).catch(() => {})
    return NextResponse.json({ ok: false, error: bizError?.message ?? 'Failed to create business' }, { status: 500 })
  }

  // 5. Link lead -> business and update existing commission row.
  await Promise.all([
    admin.from('leads').update({ business_id: business.id }).eq('id', lead_id),
    admin.from('commissions').update({ business_id: business.id }).eq('lead_id', lead_id).eq('rep_id', auth.rep.id),
  ])

  // 6. Activity log entry.
  await admin.from('lead_activities').insert({
    lead_id,
    rep_id: auth.rep.id,
    activity_type: 'system',
    title: 'Client account created by rep',
    body: `Business: ${business_name} • Plan: ${plan} • Login: ${email}`,
  })

  // 7. Welcome email (best-effort).
  await sendEmail({
    to: email,
    subject: `Welcome to TalkMate, ${first_name} — your AI receptionist is almost live`,
    html: clientWelcomeEmailHtml({ firstName: first_name, plan, loginEmail: email }),
  }).then(res => {
    if (res.ok) {
      admin.from('businesses').update({ welcome_email_sent: true }).eq('id', business.id).then(() => {})
    }
  }).catch(() => {})

  return NextResponse.json({
    ok: true,
    business_id: business.id,
    user_id: newUserId,
  })
}
