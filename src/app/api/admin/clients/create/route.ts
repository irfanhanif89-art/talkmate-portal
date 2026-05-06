import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createAdminClient } from '@/lib/supabase/server'
import { generateTempPassword, isAdminPlan, PLAN_PRICE_AUD, requireAdmin } from '@/lib/admin-auth'
import { postEmailTrigger } from '@/lib/make-webhook'
import { sendEmail } from '@/lib/resend'

const ALLOWED_INDUSTRIES = new Set([
  // Legacy keys (businesses created before library-aligned update)
  'restaurants', 'real_estate', 'professional_services',
  // Library-aligned keys (used by admin create form)
  'restaurant', 'towing', 'realestate', 'trades', 'healthcare',
  'ndis', 'retail', 'dental', 'medispa', 'mechanic', 'physio',
  'accounting', 'cleaning', 'pest', 'landscaping', 'other',
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

  // Extended onboarding fields
  const receptionist_name = body.receptionist_name ? String(body.receptionist_name).trim() : null
  const voice_id = body.voice_id ? String(body.voice_id).trim() : null
  const opening_hours = body.opening_hours && typeof body.opening_hours === 'object' ? body.opening_hours : null
  const services = Array.isArray(body.services) ? body.services : null
  const faqs = Array.isArray(body.faqs) ? body.faqs : null
  const escalation_number = body.escalation_number ? String(body.escalation_number).trim() : null
  const notif_email_on_transfer = body.notif_email_on_transfer !== false
  const notification_email = body.notification_email ? String(body.notification_email).trim() : null
  const notif_daily_summary = body.notif_daily_summary !== false
  const notif_weekly_report = body.notif_weekly_report !== false
  const notif_whatsapp = !!body.notif_whatsapp
  const notif_whatsapp_number = body.notif_whatsapp_number ? String(body.notif_whatsapp_number).trim() : null
  const notif_urgent_call = !!body.notif_urgent_call
  const notif_urgent_number = body.notif_urgent_number ? String(body.notif_urgent_number).trim() : null

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
    // Persist all onboarding answers so the View/Edit modal Agent Setup tab
    // can render values without a second insert, and the provisioner can
    // use them when building the Vapi assistant.
    notifications_config: {
      agent_answer_phrase,
      services_summary,
      after_hours_instruction,
      receptionist_name,
      voice_id,
      opening_hours,
      services,
      faqs,
      escalation_number,
      email_on_transfer: notif_email_on_transfer,
      notification_email,
      daily_summary: notif_daily_summary,
      weekly_report: notif_weekly_report,
      whatsapp: notif_whatsapp,
      whatsapp_number: notif_whatsapp_number,
      urgent_call: notif_urgent_call,
      urgent_call_number: notif_urgent_number,
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

  // Generate Stripe payment link now so it can be included in the welcome email.
  let stripe_payment_link: string | null = null
  if (process.env.STRIPE_SECRET_KEY) {
    try {
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2026-03-25.dahlia' })
      const price = await stripe.prices.create({
        currency: 'aud',
        unit_amount: PLAN_PRICE_AUD[plan] * 100,
        recurring: { interval: 'month' },
        product_data: { name: `TalkMate ${plan.charAt(0).toUpperCase() + plan.slice(1)} — ${business_name}` },
        nickname: plan,
        metadata: { business_id: business.id, plan },
      })
      const link = await stripe.paymentLinks.create({
        line_items: [{ price: price.id, quantity: 1 }],
        metadata: { business_id: business.id, plan },
        after_completion: {
          type: 'redirect',
          redirect: { url: 'https://app.talkmate.com.au/login?payment=success' },
        },
      })
      stripe_payment_link = link.url
      await admin.from('businesses').update({
        stripe_payment_link: link.url,
        stripe_payment_link_id: link.id,
      }).eq('id', business.id)
      business.stripe_payment_link = link.url
      business.stripe_payment_link_id = link.id
      await admin.from('client_admin_notes').insert({
        business_id: business.id,
        note: `Payment link generated for ${plan} plan ($${PLAN_PRICE_AUD[plan]} AUD/mo).`,
      })
    } catch (e) {
      console.error('[create] Failed to generate Stripe payment link:', e)
    }
  }

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

    // Make.com has no email module yet — send the welcome email directly via Resend.
    await sendEmail({
      to: email,
      subject: `Welcome to TalkMate, ${owner_name} — your account is ready`,
      html: `
        <div style="font-family:'Outfit',Arial,sans-serif;max-width:560px;margin:0 auto;background:#061322;color:white;padding:40px;border-radius:16px;">
          <div style="margin-bottom:28px;">
            <span style="font-size:28px;font-weight:800;">Talk</span><span style="font-size:18px;font-weight:300;color:#4A9FE8;letter-spacing:4px;">Mate</span>
          </div>

          <h1 style="font-size:26px;font-weight:800;margin:0 0 12px;">Welcome, ${owner_name}!</h1>
          <p style="font-size:16px;color:rgba(255,255,255,0.7);line-height:1.7;margin:0 0 28px;">
            Your TalkMate account for <strong style="color:white;">${business_name}</strong> has been set up and is ready to go.
          </p>

          <div style="background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:12px;padding:24px;margin-bottom:28px;">
            <p style="font-size:11px;font-weight:700;color:rgba(255,255,255,0.4);text-transform:uppercase;letter-spacing:0.12em;margin:0 0 16px;">Your login details</p>
            <table style="width:100%;border-collapse:collapse;">
              <tr>
                <td style="font-size:14px;color:rgba(255,255,255,0.55);padding:6px 0;width:160px;">Email</td>
                <td style="font-size:14px;color:white;font-weight:600;padding:6px 0;">${email}</td>
              </tr>
              <tr>
                <td style="font-size:14px;color:rgba(255,255,255,0.55);padding:6px 0;">Temporary password</td>
                <td style="font-size:14px;color:white;font-weight:600;padding:6px 0;font-family:monospace;">${temp_password}</td>
              </tr>
            </table>
            <p style="font-size:12px;color:rgba(255,255,255,0.35);margin:16px 0 0;">Change your password after your first login.</p>
          </div>

          <p style="font-size:15px;color:rgba(255,255,255,0.7);line-height:1.7;margin:0 0 20px;">
            Before you get started, please accept the TalkMate terms of service — it only takes a moment.
          </p>

          <div style="margin-bottom:28px;">
            <p style="font-size:11px;font-weight:700;color:rgba(255,255,255,0.4);text-transform:uppercase;letter-spacing:0.12em;margin:0 0 10px;">Step 1</p>
            <a href="https://app.talkmate.com.au/accept-terms"
               style="display:inline-block;background:#E8622A;color:white;font-size:16px;font-weight:700;padding:16px 32px;border-radius:10px;text-decoration:none;">
              Accept Terms &amp; Get Started →
            </a>
          </div>

          ${stripe_payment_link ? `
          <div style="padding:24px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.1);border-radius:12px;margin-bottom:28px;">
            <p style="font-size:11px;font-weight:700;color:rgba(255,255,255,0.4);text-transform:uppercase;letter-spacing:0.12em;margin:0 0 8px;">Step 2 — Activate your account</p>
            <p style="font-size:14px;color:rgba(255,255,255,0.6);line-height:1.6;margin:0 0 16px;">Once you've accepted the terms, complete payment to go live. Your AI agent will be provisioned immediately after payment.</p>
            <a href="${stripe_payment_link}"
               style="display:inline-block;background:#16a34a;color:white;font-size:16px;font-weight:700;padding:16px 32px;border-radius:10px;text-decoration:none;">
              Pay Now and Go Live →
            </a>
          </div>
          ` : ''}

          <p style="font-size:14px;color:rgba(255,255,255,0.45);margin:20px 0 0;">
            Already accepted? <a href="https://app.talkmate.com.au/login" style="color:#4A9FE8;text-decoration:none;">Log in to your dashboard →</a>
          </p>

          <hr style="border:none;border-top:1px solid rgba(255,255,255,0.08);margin:32px 0;" />
          <p style="font-size:13px;color:rgba(255,255,255,0.3);margin:0;">
            Questions? Reply to this email — we're a real team on the Gold Coast.
          </p>
        </div>
      `,
    }).catch(console.error)

    await admin.from('businesses').update({ welcome_email_sent: true }).eq('id', business.id)
    business.welcome_email_sent = true
  }

  return NextResponse.json({ ok: true, business })
}
