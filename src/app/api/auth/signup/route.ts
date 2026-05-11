import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { createClient as createSbClient } from '@supabase/supabase-js'

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

  // ---- validation ----------------------------------------------------
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ success: false, error: 'A valid email address is required.' }, { status: 400 })
  }
  if (!password || password.length < 8) {
    return NextResponse.json({ success: false, error: 'Password must be at least 8 characters.' }, { status: 400 })
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

  // ---- duplicate-email pre-check (best-effort) ----------------------
  // The Supabase signUp call will surface duplicates too, but checking
  // first lets us return a clean 409 with the friendly message.
  const admin = createAdminClient()
  // listUsers doesn't expose a filter, so we scan up to 1000 rows. For
  // any realistic signup volume this is fine — the duplicate check is a
  // soft pre-flight, not a hard guarantee.
  try {
    const { data: existing } = await admin.auth.admin.listUsers({ perPage: 200, page: 1 })
    const hit = existing?.users?.find(u => u.email?.toLowerCase() === email)
    if (hit) {
      return NextResponse.json(
        { success: false, error: 'That email is already registered. Try logging in instead.' },
        { status: 409 },
      )
    }
  } catch {
    // Fall through — Supabase will still reject a duplicate on signUp().
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
