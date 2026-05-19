import { createClient } from '@/lib/supabase/server'
import { requireSalesRep } from '@/lib/sales-auth'
import { redirect } from 'next/navigation'
import OnboardForm, { type ApprovedDeal } from '@/components/sales/onboard-form'

export const dynamic = 'force-dynamic'

export default async function SalesOnboardPage() {
  const auth = await requireSalesRep()
  if (!auth.ok) redirect('/')

  const supabase = await createClient()
  const { data: deals } = await supabase
    .from('leads')
    .select('id, business_name, contact_name, phone, email, industry, suburb, state, website, won_plan')
    .eq('assigned_to', auth.rep.id)
    .eq('status', 'won')
    .eq('approval_status', 'approved')
    .is('business_id', null)
    .order('won_at', { ascending: false })

  return (
    <div style={{ padding: '24px 24px 40px', fontFamily: 'Outfit, sans-serif' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0, letterSpacing: '-0.5px' }}>Onboard a client</h1>
        <p style={{ fontSize: 13, color: '#7BAED4', margin: 0, marginTop: 4 }}>
          Once admin has approved a won deal, this is where you set up the client's TalkMate account.
        </p>
      </div>

      <OnboardForm deals={(deals ?? []) as ApprovedDeal[]} />
    </div>
  )
}
