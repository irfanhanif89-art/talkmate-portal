import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { generateTempPassword, isAdminPlan, requireAdmin } from '@/lib/admin-auth'
import { postEmailTrigger } from '@/lib/make-webhook'

const ALLOWED_INDUSTRIES = new Set([
  'restaurants', 'towing', 'real_estate', 'trades', 'healthcare',
  'ndis', 'retail', 'professional_services', 'other',
])

export async function POST(req: Request) {
  const auth = await requireAdmin()
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status })

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>

  const business_name = String(body.business_name ?? '').trim()
  const owner_name = String(body.owner_name ?? '').trim()
  const email = String(body.email ?? '').trim().toLowerCase()
  const phone = String(body.phone ?? '').trim()
  const industry = String(body.industry ?? '').trim()
  const plan = String(body.plan ?? '').trim()
  const agent_answer_phrase = String(body.agent_answer_phrase ?? '').trim()
  const services_summary = String(body.services_summary ?? '').trim()
  const after_hours_instruction = String(body.after_hours_instruction ?? '').trim()

  if (!business_name) return NextResponse.json({ ok: false, error: 'business_name required' }, { status: 400 })
  if (!owner_name) return NextResponse.json({ ok: false, error: 'owner_name required' }, { status: 400 })
  if (!email || !email.includes('@')) return NextResponse.json({ ok: false, error: 'valid email required' }, { status: 400 })
  if (!phone) return NextResponse.json({ ok: false, error: 'phone required' }, { status: 400 })
  if (!industry || !ALLOWED_INDUSTRIES.has(industry)) {
    return NextResponse.json({ ok: false, error: 'industry required' }, { status: 400 })
  }
  if (!isAdminPlan(plan)) return NextResponse.json({ ok: false, error: 'plan must be starter|growth|pro' }, { status: 400 })
  if (!agent_answer_phrase) return NextResponse.json({ ok: false, error: 'agent_answer_phrase required' }, { status: 400 })
  if (!services_summary) return NextResponse.json({ ok: false, error: 'services_summary required' }, { status: 400 })
  if (!after_hours_instruction) return NextResponse.json({ ok: false, error: 'after_hours_instruction required' }, { status: 400 })

  const address = body.address ? String(body.address).trim() : null
  const website = body.website ? String(body.website).trim() : null
  const abn = body.abn ? String(body.abn).trim() : null
  const referred_by = body.referred_by ? String(body.referred_by).trim() : null
  const initial_note = body.initial_note ? String(body.initial_note).trim() : null
  const send_welcome_email = body.send_welcome_email !== false

  const admin = createAdminClient()

  // Duplicate-email guard. Look up the existing auth user, then surface
  // their business id so the admin UI can deep-link rather than create a
  // confusing second business.
  const { data: existing } = await admin.auth.admin.listUsers()
  const existingUser = existing?.users?.find(u => u.email?.toLowerCase() === email)
  if (existingUser) {
    const { data: existingBiz } = await admin.from('businesses')
      .select('id, name').eq('owner_user_id', existingUser.id).maybeSingle()
    return NextResponse.json({
      ok: false,
      error: 'An account with this email already exists',
      existing_user_id: existingUser.id,
      existing_business_id: existingBiz?.id ?? null,
      existing_business_name: existingBiz?.name ?? null,
    }, { status: 409 })
  }

  const temp_password = generateTempPassword(10)

  const { data: createdAuth, error: authError } = await admin.auth.admin.createUser({
    email,
    password: temp_password,
    email_confirm: true,
    user_metadata: { full_name: owner_name, created_by_admin: true },
  })
  if (authError || !createdAuth?.user) {
    return NextResponse.json({ ok: false, error: authError?.message ?? 'Failed to create auth user' }, { status: 500 })
  }
  const newUserId = createdAuth.user.id

  // Mirror into public.users so the rest of the app (sidebar, role checks)
  // can read full_name without going through auth.users.
  await admin.from('users').upsert({
    id: newUserId,
    email,
    full_name: owner_name,
    role: 'owner',
  }, { onConflict: 'id' })

  // Plan → call limit alignment with migration 007.
  const planCallLimit = plan === 'pro' ? 100000 : plan === 'growth' ? 800 : 300

  const { data: business, error: bizError } = await admin.from('businesses').insert({
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
    onboarded_by: 'admin',
    temp_password,
    welcome_email_sent: false,
    onboarding_completed: false,
    referred_by: referred_by || null,
    // Persist the agent setup answers so the View/Edit modal Agent Setup tab
    // can render the same values without a second insert.
    notifications_config: {
      agent_answer_phrase,
      services_summary,
      after_hours_instruction,
    },
  }).select('*').single()

  if (bizError || !business) {
    // Roll back the auth user so we don't leave an orphaned login.
    await admin.auth.admin.deleteUser(newUserId).catch(() => {})
    return NextResponse.json({ ok: false, error: bizError?.message ?? 'Failed to create business' }, { status: 500 })
  }

  if (initial_note) {
    await admin.from('client_admin_notes').insert({
      business_id: business.id,
      note: initial_note,
    })
  }

  await admin.from('client_admin_notes').insert({
    business_id: business.id,
    note: `Account created by admin. Plan: ${plan}. Pending payment.`,
  })

  if (send_welcome_email) {
    await postEmailTrigger({
      // Reuse the existing typed channel — Make.com routes by `data.type`.
      event: 'welcome_post_payment',
      businessId: business.id,
      email,
      data: {
        type: 'welcome_admin_created',
        to: email,
        owner_name,
        business_name,
        temp_password,
        plan,
        login_url: 'https://app.talkmate.com.au/login',
        accept_terms_url: 'https://app.talkmate.com.au/accept-terms',
        from_name: 'Irfan from TalkMate',
        from_email: 'hello@talkmate.com.au',
      },
    }).catch(() => {})

    await admin.from('businesses').update({ welcome_email_sent: true }).eq('id', business.id)
    business.welcome_email_sent = true
  }

  return NextResponse.json({ ok: true, business })
}
