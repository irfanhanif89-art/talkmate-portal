// Session 4B Phase C — referral codes.
// Code generation + get-or-create. The actual credit application (Stripe) and
// any referral SMS are intentionally NOT here — they are compliance-gated
// (owner consent + ACCC terms) and applied manually for now.
import type { createAdminClient } from '@/lib/supabase/server'

type Admin = ReturnType<typeof createAdminClient>

// Short, readable code: 4 chars from the business id + a 4-char random suffix.
export function generateReferralCode(businessId: string): string {
  const prefix = businessId.replace(/-/g, '').slice(0, 4).toUpperCase()
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase()
  return `${prefix}-${suffix}`
}

export async function getOrCreateReferralCode(businessId: string, admin: Admin): Promise<string> {
  const { data } = await admin
    .from('referral_codes')
    .select('code')
    .eq('business_id', businessId)
    .maybeSingle()
  if (data?.code) return data.code as string

  // Retry a couple of times on the UNIQUE(code) collision (rare).
  for (let i = 0; i < 3; i++) {
    const code = generateReferralCode(businessId)
    const { error } = await admin.from('referral_codes').insert({ business_id: businessId, code })
    if (!error) return code
    // If the row already exists for this business (race), re-read it.
    const { data: existing } = await admin
      .from('referral_codes').select('code').eq('business_id', businessId).maybeSingle()
    if (existing?.code) return existing.code as string
  }
  // Last resort — return a generated code even if persistence flaked.
  return generateReferralCode(businessId)
}
