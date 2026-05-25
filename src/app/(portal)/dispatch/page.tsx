import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { DispatchView } from './dispatch-view'

// Sessions 36-37 — rebuilt dispatcher dashboard. Replaces the Phase 2
// "being upgraded" placeholder. Live Board / Jobs / Drivers /
// Settings tabs. Drivers tab also hosts the Invite Driver flow that
// the brief calls "Manage Drivers".

export const metadata: Metadata = { title: 'Dispatch' }
export const dynamic = 'force-dynamic'

export default async function DispatchPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Resolve business (don't .single() on businesses per CLAUDE.md).
  const { data: bizList } = await supabase
    .from('businesses')
    .select('id, name, account_status, dispatch_enabled, created_at')
    .eq('owner_user_id', user.id)
  const business = (bizList ?? [])
    .filter(b => !['cancelled', 'expired'].includes((b.account_status as string) ?? ''))
    .sort((a, b) => new Date(b.created_at as string).getTime() - new Date(a.created_at as string).getTime())[0]
  if (!business) redirect('/register')

  return (
    <DispatchView
      clientId={business.id as string}
      businessName={(business.name as string) ?? ''}
      dispatchEnabled={!!business.dispatch_enabled}
    />
  )
}
