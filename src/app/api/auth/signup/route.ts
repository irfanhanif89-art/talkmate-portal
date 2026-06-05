import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { createClient as createSbClient } from '@supabase/supabase-js'
import { sendSms } from '@/lib/twilio'
import { sendEmail } from '@/lib/resend'
import { validatePassword } from '@/lib/password'
import { sendAdminTelegram } from '@/lib/notifications'

// Self-serve signup route — Session 8. Public, no auth header required.
// Replaces nothing; sits alongside the older /api/auth/register flow.
//
// Two paths through this route, gated by `signup_type`:
//   - 'trial'    → account_status='trial', stamps a 7-day trial window,
//                  the caller is auto-logged-in and redirected to the
//                  dashboard (frontend handles the redirect).
//   - 'pay_now'  → account_status='pending_payment'; the response carries
//                  the Stripe payment-link URL with the customer's email
//                  pre-filled so the caller can complete payment on
//                  Stripe's hosted page.
//
// Whichever path, we also try to fire MAKE_NEW_SIGNUP_WEBHOOK so Donna
// gets a Telegram nudge. Webhook failure is non-fatal.

const TRIAL_DAYS = 7
const VALID_PLANS = new Set(['starter', 'growth', 'pro'])
const VALID_INDUSTRIES = new Set([
  'restaurants', 'towing', 'trades', 'mechanic', 'dental',
  'medispa', 'real_estate', 'healthcare', 'physio',
  'accounting', 'cleaning', 'pest', 'landscaping',
])

// Industries → existing business_type values (the older taxonomy our
// dashboard uses). Best-effort; "other" is the safe fallback.
const INDUSTRY_TO_BUSINESS_TYPE: Record<string, string> = {
  restaurants: 'hospitality',
  towing: 'automotive',
  trades: 'trades',
  mechanic: 'automotive',
  dental: 'medical',
  medispa: 'beauty',
  real_estate: 'real_estate',
  healthcare: 'medical',
  physio: 'medical',
  accounting: 'professional',
  cleaning: 'trades',
  pest: 'trades',
  landscaping: 'trades',
}

interface SignupRequest {
  email?: string
  password?: string
  full_name?: string
  business_name?: string
  phone?: string
  industry?: string
  plan?: string
  signup_type?: string
  // Set true on the second-submit after the user has acknowledged a
  // phone duplicate warning. Email duplicates are still hard-blocked.
  force_phone_duplicate?: boolean
  // Session 4B — referral code from /refer/[code] -> /register?ref=CODE.
  ref?: string
}

function planStripeLink(plan: string, email: string): string | null {
  const raw =
    plan === 'starter' ? process.env.STRIPE_STARTER_LINK
    : plan === 'growth' ? process.env.STRIPE_GROWTH_LINK
    : (plan === 'pro' || plan === 'professional') ? process.env.STRIPE_PRO_LINK
    : null
  if (!raw) return null
  try {
    const url = new URL(raw)
    // Stripe payment links accept ?prefilled_email= to pre-fill the
    // customer's email on the checkout page.
    url.searchParams.set('prefilled_email', email)
    return url.toString()
  } catch {
    return raw
  }
}

export async function POST(request: Request) {
  let body: SignupRequest
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 })
  }

  const email = (body.email ?? '').trim().toLowerCase()
  const password = body.password ?? ''
  const fullName = (body.full_name ?? '').trim()
  const businessName = (body.business_name ?? '').trim()
  const phone = (body.phone ?? '').trim()
  const industry = (body.industry ?? '').trim()
  const plan = (body.plan ?? '').trim().toLowerCase()
  const signupType = (body.signup_type ?? '').trim().toLowerCase()
  const refCode = (body.ref ?? '').trim().toUpperCase()

  // ---- validation ----------------------------------------------------
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ success: false, error: 'A valid email address is required.' }, { status: 400 })
  }
  // Session 11 — full strength check (length + upper + number + special).
  // Returns the first failing rule as a user-facing message.
  const pwError = validatePassword(password ?? '')
  if (pwError) {
    return NextResponse.json({ success: false, error: pwError }, { status: 400 })
  }
  if (!fullName) {
    return NextResponse.json({ success: false, error: 'Your full name is required.' }, { status: 400 })
  }
  if (!businessName) {
    return NextResponse.json({ success: false, error: 'Business name is required.' }, { status: 400 })
  }
  if (!phone) {
    return NextResponse.json({ success: false, error: 'Phone number is required.' }, { status: 400 })
  }
  if (!VALID_INDUSTRIES.has(industry)) {
    return NextResponse.json({ success: false, error: 'Please choose an industry from the list.' }, { status: 400 })
  }
  if (!VALID_PLANS.has(plan)) {
    return NextResponse.json({ success: false, error: 'Plan must be starter, growth, or pro.' }, { status: 400 })
  }
  if (signupType !== 'trial' && signupType !== 'pay_now') {
    return NextResponse.json({ success: false, error: 'Choose either Start free trial or Pay now.' }, { status: 400 })
  }

  const forcePhoneDuplicate = body.force_phone_duplicate === true

  // ---- duplicate-email pre-check (best-effort) ----------------------
  // The Supabase signUp call will surface duplicates too, but checking
  // first lets us return a clean 409 with the friendly message. Email
  // duplicates are always a hard block (cannot proceed) because
  // Supabase Auth refuses to create two users with the same email.
  const admin = createAdminClient()
  try {
    const { data: existing } = await admin.auth.admin.listUsers({ perPage: 200, page: 1 })
    const hit = existing?.users?.find(u => u.email?.toLowerCase() === email)
    if (hit) {
      return NextResponse.json(
        {
          success: false,
          error: 'An account with this email already exists. Try logging in instead.',
          duplicate_field: 'email',
        },
        { status: 409 },
      )
    }
  } catch {
    // Fall through — Supabase will still reject a duplicate on signUp().
  }

  // ---- duplicate-phone soft guard -----------------------------------
  // Phone numbers can legitimately repeat (same owner, second business).
  // First submit shows a warning; client re-submits with
  // force_phone_duplicate=true to proceed.
  if (!forcePhoneDuplicate) {
    try {
      const { data: phoneMatch } = await admin.from('businesses')
        .select('id, name, account_status').eq('phone_number', phone).limit(1).maybeSingle()
      if (phoneMatch) {
        return NextResponse.json(
          {
            success: false,
            error: 'An account with this phone already exists. Search for the existing account instead of creating a new one.',
            duplicate_field: 'phone',
            existing_business_name: phoneMatch.name,
            existing_business_status: phoneMatch.account_status ?? null,
            can_force: true,
          },
          { status: 409 },
        )
      }
    } catch {
      // Non-fatal — proceed.
    }
  }

  // ---- create auth user via the anon (public) signUp endpoint -------
  const anon = createSbClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
  const { data: authData, error: authError } = await anon.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: fullName,
        business_name: businessName,
        phone,
        industry,
      },
    },
  })

  if (authError || !authData.user) {
    const msg = authError?.message ?? ''
    if (/already (registered|exists|been)/i.test(msg)) {
      return NextResponse.json(
        { success: false, error: 'That email is already registered. Try logging in instead.' },
        { status: 409 },
      )
    }
    return NextResponse.json(
      { success: false, error: msg || 'Could not create your account. Please try again.' },
      { status: 400 },
    )
  }

  // ---- create the business row --------------------------------------
  const now = new Date()
  const trialEnd = new Date(now.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000)
  const isTrial = signupType === 'trial'

  const businessInsert: Record<string, unknown> = {
    name: businessName,
    business_type: INDUSTRY_TO_BUSINESS_TYPE[industry] ?? 'other',
    industry,
    plan,
    phone_number: phone,
    owner_user_id: authData.user.id,
    onboarded_by: 'self',
    account_status: isTrial ? 'trial' : 'pending_payment',
    onboarding_complete: false,
    // Session 27 — signup_at powers abandoned-cart, onboard-day7, NPS, and
    // every downstream cron that filters on self-serve signup time.
    signup_at: now.toISOString(),
    welcome_email_sent: false,
  }
  if (isTrial) {
    businessInsert.trial_start_date = now.toISOString()
    businessInsert.trial_end_date = trialEnd.toISOString()
  }

  const { data: biz, error: bizError } = await admin
    .from('businesses')
    .insert(businessInsert)
    .select('*')
    .single()

  if (bizError || !biz) {
    console.error('[signup] business insert failed', bizError)
    return NextResponse.json(
      { success: false, error: 'Account created, but business record failed. Contact support.' },
      { status: 500 },
    )
  }

  // ---- Session 4B referral redemption --------------------------------
  // If the signup carried a valid, unused referral code, link the new
  // business to the referrer and flag BOTH for a manual account credit.
  // Credit application is manual (ACCC terms + Stripe billing credit) —
  // we only fire the alert + record the link here.
  if (refCode) {
    try {
      const { data: rc } = await admin
        .from('referral_codes')
        .select('business_id, used_by_business_id')
        .eq('code', refCode)
        .maybeSingle()
      if (rc?.business_id && rc.business_id !== biz.id && !rc.used_by_business_id) {
        await admin.from('businesses').update({ referred_by: rc.business_id }).eq('id', biz.id)
        await admin.from('referral_codes').update({ used_by_business_id: biz.id }).eq('code', refCode)
        const { data: referrer } = await admin.from('businesses').select('name').eq('id', rc.business_id).maybeSingle()
        sendAdminTelegram(
          `🎁 Referral signup\nNew: ${businessName}\nReferred by: ${referrer?.name ?? rc.business_id}\nCode: ${refCode}\nApply the agreed account credit to BOTH in Stripe, then set referral_codes.credit_applied=true.`,
        ).catch(() => {})
      }
    } catch (e) {
      console.error('[signup] referral redemption failed', (e as Error).message)
    }
  }

  // ---- users row + onboarding_responses ------------------------------
  const { error: userInsertError } = await admin.from('users').insert({
    id: authData.user.id,
    business_id: biz.id,
    email,
    role: 'owner',
    full_name: fullName,
  })
  if (userInsertError) {
    console.error('[signup] users row insert failed', userInsertError)
  }

  const { error: onboardingError } = await admin
    .from('onboarding_responses')
    .insert({ business_id: biz.id })
  if (onboardingError) {
    console.error('[signup] onboarding_responses insert failed', onboardingError)
  }

  // ---- fire Make.com webhook (best-effort) --------------------------
  const webhookUrl = process.env.MAKE_NEW_SIGNUP_WEBHOOK
  if (webhookUrl) {
    try {
      await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          trigger: 'new_signup',
          timestamp: now.toISOString(),
          signup_type: signupType,
          business: {
            id: biz.id,
            business_name: businessName,
            owner_name: fullName,
            email,
            phone,
            industry,
            plan,
            account_status: isTrial ? 'trial' : 'pending_payment',
            trial_end_date: isTrial ? trialEnd.toISOString() : null,
          },
        }),
      })
    } catch (e) {
      console.error('[signup] make.com webhook failed', e)
    }
  }

  // ---- welcome email to the new client (Session 27 H25) ------------
  // Trial users get a different CTA than pay-now users; pay-now users are
  // already being redirected to Stripe so their first portal touch is
  // post-payment, while trial users land on /onboarding.
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.talkmate.com.au'
  const ctaUrl = `${appUrl}/onboarding`
  const welcomeHtml = `
    <div style="font-family: 'Outfit', sans-serif; max-width: 560px; margin: 0 auto; background: #061322; color: white; padding: 40px; border-radius: 16px;">
      <div style="margin-bottom: 28px;">
        <span style="font-size: 28px; font-weight: 800; color: white;">Talk</span><span style="font-size: 18px; font-weight: 300; color: #4A9FE8; letter-spacing: 4px;">Mate</span>
      </div>
      <h1 style="font-size: 26px; font-weight: 800; color: white; margin: 0 0 12px 0; line-height: 1.25;">
        Welcome to TalkMate. Your AI receptionist is almost ready.
      </h1>
      <p style="font-size: 15px; color: rgba(255,255,255,0.75); line-height: 1.7; margin: 0 0 24px 0;">
        Hi ${fullName.split(' ')[0] || 'there'}, complete your setup in just a few minutes and your agent will be live answering calls.
      </p>
      <a href="${ctaUrl}" style="display: inline-block; background: #E8622A; color: white; font-size: 15px; font-weight: 700; padding: 14px 28px; border-radius: 10px; text-decoration: none; margin-bottom: 28px;">
        Complete Setup
      </a>
      <div style="background: rgba(255,255,255,0.05); border-radius: 12px; padding: 22px; margin-bottom: 24px;">
        <p style="font-size: 13px; font-weight: 700; color: white; margin: 0 0 10px 0;">What happens next:</p>
        <div style="font-size: 14px; color: rgba(255,255,255,0.7); line-height: 1.9;">
          1. Tell us about your business<br/>
          2. Set your hours and pricing<br/>
          3. Your AI receptionist goes live
        </div>
      </div>
      <p style="font-size: 13px; color: rgba(255,255,255,0.5); margin: 0;">
        If you need help at any stage, reply to this email.
      </p>
      <p style="font-size: 13px; color: rgba(255,255,255,0.75); margin: 18px 0 0 0;">
        Irfan<br/>
        <span style="color: rgba(255,255,255,0.5);">Founder, TalkMate</span>
      </p>
    </div>
  `
  try {
    const sent = await sendEmail({
      to: email,
      subject: `Welcome to TalkMate — let's get your AI receptionist set up`,
      html: welcomeHtml,
      replyTo: 'hello@talkmate.com.au',
    })
    if (sent.ok) {
      await admin.from('businesses')
        .update({ welcome_email_sent: true })
        .eq('id', biz.id)
    }
  } catch (e) {
    console.error('[signup] welcome email failed', e)
  }

  // ---- direct SMS notification (belt-and-braces) -------------------
  try {
    let smsBody: string
    if (isTrial) {
      const dd = String(trialEnd.getUTCDate()).padStart(2, '0')
      const mon = trialEnd.toLocaleString('en-AU', { month: 'short', timeZone: 'UTC' })
      const yyyy = trialEnd.getUTCFullYear()
      smsBody = `New client signed up: ${businessName} (${industry}, ${plan} plan). ${fullName}, ${phone}. Trial ends ${dd} ${mon} ${yyyy}. Set up their Vapi agent.`
    } else {
      smsBody = `New client signed up: ${businessName} (${industry}, ${plan} plan). ${fullName}, ${phone}. Pay now path - confirm payment and set up their agent.`
    }
    await sendSms(smsBody)
  } catch (e) {
    console.error('[signup] sms notification failed', e)
  }

  // ---- compute redirect ---------------------------------------------
  let redirectUrl = '/dashboard'
  if (signupType === 'pay_now') {
    const stripe = planStripeLink(plan, email)
    if (stripe) {
      redirectUrl = stripe
    } else {
      // No Stripe link configured — fall the user back to the dashboard
      // and let the trial banner / billing page prompt for payment.
      redirectUrl = '/billing'
    }
  }

  return NextResponse.json({
    success: true,
    redirect_url: redirectUrl,
    business_id: biz.id,
    // Client uses these to call auth.signInWithPassword and establish
    // the session in the browser, so the dashboard redirect lands them
    // logged in.
    email,
  })
}
