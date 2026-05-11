import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import DispatchBoard from './dispatch-board'

export const metadata: Metadata = { title: 'Dispatch' }
export const dynamic = 'force-dynamic'

export default async function DispatchPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: business } = await supabase
    .from('businesses')
    .select('id, name, industry, plan, dispatch_enabled, dispatch_config')
    .eq('owner_user_id', user.id)
    .single()
  if (!business) redirect('/register')

  const plan = (business.plan as string) ?? 'starter'
  const industry = (business.industry as string) ?? ''
  const isPaidTier = plan === 'growth' || plan === 'pro' || plan === 'professional'
  const isDispatchIndustry = industry === 'towing'

  return (
    <div style={{ padding: 24, color: '#F2F6FB' }}>
      <DispatchBoard
        plan={plan}
        industry={industry}
        dispatchEnabled={!!business.dispatch_enabled}
        isPaidTier={isPaidTier}
        isDispatchIndustry={isDispatchIndustry}
      />
    </div>
  )
}
