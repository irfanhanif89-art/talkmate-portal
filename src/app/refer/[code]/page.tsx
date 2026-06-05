// Session 4B Phase C — public referral landing. No auth. Looks up the referrer
// by code and routes into signup with the code preserved. Neutral copy: no
// specific "free month" / dollar claim until the credit mechanism + terms exist.
import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export default async function ReferLanding({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const admin = createAdminClient()

  const { data: ref } = await admin
    .from('referral_codes')
    .select('business_id')
    .eq('code', code.toUpperCase())
    .maybeSingle()

  let referrerName: string | null = null
  if (ref?.business_id) {
    const { data: biz } = await admin.from('businesses').select('name').eq('id', ref.business_id).maybeSingle()
    referrerName = (biz?.name as string | null) ?? null
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#061322', color: 'white', fontFamily: 'Outfit, sans-serif', padding: 24 }}>
      <div style={{ maxWidth: 480, padding: 36, borderRadius: 16, background: '#0A1E38', border: '1px solid rgba(255,255,255,0.08)', textAlign: 'center' }}>
        <div style={{ fontSize: 22, fontWeight: 800 }}>Talk<span style={{ color: '#E8622A' }}>Mate</span></div>
        <h1 style={{ fontSize: 24, fontWeight: 800, margin: '18px 0 10px', lineHeight: 1.25 }}>
          {referrerName ? `${referrerName} thinks TalkMate could help your business` : 'You have been invited to TalkMate'}
        </h1>
        <p style={{ color: '#7BAED4', fontSize: 14, lineHeight: 1.7, margin: '0 0 22px' }}>
          TalkMate is an AI receptionist that answers every call for your business, 24/7. It takes bookings, answers questions, and never misses a lead.
        </p>
        <Link
          href={`/register?ref=${encodeURIComponent(code)}`}
          style={{ display: 'inline-block', padding: '12px 26px', borderRadius: 10, background: '#E8622A', color: 'white', textDecoration: 'none', fontSize: 14, fontWeight: 700 }}
        >
          Start your free 14-day trial
        </Link>
        <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: 12, marginTop: 16 }}>
          When you sign up through this link we will be in touch about a thank-you for you both.
        </p>
      </div>
    </div>
  )
}
