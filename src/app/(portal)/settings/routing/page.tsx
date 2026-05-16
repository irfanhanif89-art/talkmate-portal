import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import RoutingView from './routing-view'

export const metadata: Metadata = { title: 'Call Routing' }
export const dynamic = 'force-dynamic'

// Per-industry emergency-keyword defaults used as the initial fill for
// new clients. We hand them off to the view so the UI can show them
// even before the user saves.
const DEFAULTS_BY_INDUSTRY: Record<string, string[]> = {
  trades: ['emergency', 'urgent', 'flooding', 'no power', 'gas leak', 'leak'],
  healthcare: ['emergency', 'chest pain', 'bleeding', 'can\'t breathe', 'accident'],
  medical: ['emergency', 'chest pain', 'bleeding', 'can\'t breathe', 'accident'],
  dental: ['emergency', 'severe pain', 'knocked out', 'bleeding'],
  physio: ['emergency', 'severe pain', 'fall', 'injury'],
  towing: ['emergency', 'accident', 'broken down', 'stuck', 'highway'],
  mechanic: ['emergency', 'broken down', 'overheating', 'won\'t start'],
  cleaning: ['emergency', 'flood', 'spill', 'urgent'],
  pest: ['emergency', 'infestation', 'snake', 'bees', 'wasps'],
  landscaping: ['emergency', 'fallen tree', 'storm damage', 'urgent'],
  restaurants: ['emergency', 'urgent'],
  real_estate: ['emergency', 'lockout', 'urgent'],
  accounting: ['emergency', 'urgent', 'audit'],
  medispa: ['emergency', 'reaction', 'urgent'],
  other: ['emergency', 'urgent'],
}

export default async function RoutingSettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: business } = await supabase
    .from('businesses')
    .select('id, industry, plan, call_transfer_enabled, escalation_config, knowledge_base, vapi_agent_id, agent_last_synced_at')
    .eq('owner_user_id', user.id)
    .single()
  if (!business) redirect('/register')

  const industry = (business.industry as string) || 'other'
  const defaultKeywords = DEFAULTS_BY_INDUSTRY[industry] ?? DEFAULTS_BY_INDUSTRY.other

  return (
    <div style={{ padding: 28, maxWidth: 900, margin: '0 auto', color: '#F2F6FB' }}>
      <RoutingView
        plan={business.plan ?? 'starter'}
        industry={industry}
        defaultEmergencyKeywords={defaultKeywords}
        initialConfig={(business.escalation_config ?? {}) as Record<string, unknown>}
        initialKnowledgeBase={(business.knowledge_base as string) ?? ''}
        hasAgent={!!business.vapi_agent_id}
        initialLastSyncedAt={business.agent_last_synced_at ?? null}
      />
    </div>
  )
}
