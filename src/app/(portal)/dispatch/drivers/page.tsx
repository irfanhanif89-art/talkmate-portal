import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import DriversView from './drivers-view'

export const metadata: Metadata = { title: 'Drivers' }
export const dynamic = 'force-dynamic'

export default async function DriversPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: business } = await supabase
    .from('businesses')
    .select('id, industry, plan, dispatch_enabled')
    .eq('owner_user_id', user.id)
    .single()
  if (!business) redirect('/register')

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto', color: '#F2F6FB' }}>
      <DriversView
        industry={(business.industry as string) ?? ''}
        plan={(business.plan as string) ?? 'starter'}
        dispatchEnabled={!!business.dispatch_enabled}
      />
    </div>
  )
}
