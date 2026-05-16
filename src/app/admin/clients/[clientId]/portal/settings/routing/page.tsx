import { createAdminClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/admin-auth'
import { redirect } from 'next/navigation'
import RoutingView from '@/app/(portal)/settings/routing/routing-view'

export const dynamic = 'force-dynamic'

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

export default async function AdminRoutingSettingsPage({
  params,
}: {
  params: Promise<{ clientId: string }>
}) {
  const auth = await requireAdmin()
  if (!auth.ok) redirect('/login')

  const { clientId } = await params
  const admin = createAdminClient()
  const { data: business } = await admin
    .from('businesses')
    .select('id, industry, plan, call_transfer_enabled, escalation_config, knowledge_base, vapi_agent_id, agent_last_synced_at')
    .eq('id', clientId)
    .maybeSingle()
  if (!business) redirect('/admin/clients')

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
        adminClientId={clientId}
      />
    </div>
  )
}
