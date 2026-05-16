import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import TeamView from './team-view'

export const metadata: Metadata = { title: 'Team' }
export const dynamic = 'force-dynamic'

export default async function TeamPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: business } = await supabase
    .from('businesses')
    .select('id, plan, call_transfer_enabled, vapi_agent_id, agent_last_synced_at')
    .eq('owner_user_id', user.id)
    .single()
  if (!business) redirect('/register')

  return (
    <div style={{ padding: 28, maxWidth: 1200, margin: '0 auto', color: '#F2F6FB' }}>
      <TeamView
        plan={business.plan ?? 'starter'}
        transferEnabled={!!business.call_transfer_enabled}
        hasAgent={!!business.vapi_agent_id}
        initialLastSyncedAt={business.agent_last_synced_at ?? null}
      />
    </div>
  )
}
