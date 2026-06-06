import { createAdminClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { validatePassword } from '@/lib/password'
import { sendAdminTelegram } from '@/lib/notifications'

export async function POST(request: NextRequest) {
  const { email, password, fullName, businessName, businessType, ref } = await request.json()
  const refCode = (typeof ref === 'string' ? ref : '').trim().toUpperCase()

  // Session 11 — enforce length + complexity. The client renders the
  // same rules in <PasswordStrength /> so a passing UI bar always
  // implies a passing server check.
  const pwError = validatePassword(password ?? '')
  if (pwError) return NextResponse.json({ error: pwError }, { status: 400 })

  // Use anon client to create the auth user
  const anonClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const { data: authData, error: authError } = await anonClient.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: fullName,
        business_name: businessName,
        business_type: businessType,
      },
    },
  })

  if (authError || !authData.user) {
    return NextResponse.json({ error: authError?.message ?? 'Signup failed' }, { status: 400 })
  }

  // Use admin client (service role) to bypass RLS for business creation
  const admin = createAdminClient()

  const { data: biz, error: bizError } = await admin
    .from('businesses')
    .insert({ name: businessName, business_type: businessType, owner_user_id: authData.user.id })
    .select()
    .maybeSingle()

  if (bizError || !biz) {
    console.error('[register] Business creation failed:', bizError)
    return NextResponse.json({ error: bizError?.message ?? 'Failed to create business' }, { status: 400 })
  }

  // Session 4B — referral redemption (manual credit; link only here).
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
      console.error('[register] referral redemption failed', (e as Error).message)
    }
  }

  const { error: userInsertError } = await admin.from('users').insert({
    id: authData.user.id,
    business_id: biz.id,
    email,
    role: 'owner',
  })
  if (userInsertError) {
    console.error('[register] users row insert failed:', userInsertError)
  }

  const { error: onboardingError } = await admin.from('onboarding_responses').insert({ business_id: biz.id })
  if (onboardingError) {
    console.error('[register] onboarding_responses insert failed:', onboardingError)
  }

  return NextResponse.json({ success: true, businessId: biz.id })
}
