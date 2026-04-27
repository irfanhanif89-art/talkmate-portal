import { createAdminClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  const { email, password, firstName, businessName, businessType } = await request.json()

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
        first_name: firstName,
        business_name: businessName,
        business_type: businessType,
      },
    },
  })

  if (authError || !authData.user) {
    return NextResponse.json({ error: authError?.message ?? 'Signup failed' }, { status: 400 })
  }

  // Use admin client (service role) to bypass RLS for business creation
  const admin = await createAdminClient()

  const { data: biz, error: bizError } = await admin
    .from('businesses')
    .insert({ name: businessName, business_type: businessType, owner_user_id: authData.user.id })
    .select()
    .single()

  if (bizError || !biz) {
    console.error('[register] Business creation failed:', bizError)
    return NextResponse.json({ error: bizError?.message ?? 'Failed to create business' }, { status: 400 })
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
