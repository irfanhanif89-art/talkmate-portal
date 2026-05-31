// Admin-as-client Train TalkMate view. Reuses TrainView with
// adminClientId so all API calls hit the admin-override branch in
// /api/knowledge-base/*.

import { createAdminClient } from '@/lib/supabase/server'
import TrainView, { type KbEntryDTO, type SyncStatus } from '@/app/(portal)/train/train-view'

export const dynamic = 'force-dynamic'

export default async function AdminTrainPage({
  params,
}: {
  params: Promise<{ clientId: string }>
}) {
  const { clientId } = await params
  const admin = createAdminClient()

  const { data: business } = await admin
    .from('businesses')
    .select('id, name, vapi_agent_id, kb_sync_status, kb_last_synced_at')
    .eq('id', clientId)
    .limit(1)
    .maybeSingle()

  if (!business) {
    return <div style={{ padding: 32, color: 'white' }}>Client not found.</div>
  }

  const { data: entries } = await admin
    .from('knowledge_base_entries')
    .select('id, category, question, answer, is_active, sort_order, updated_at')
    .eq('business_id', clientId)
    .eq('is_active', true)
    .order('category', { ascending: true })
    .order('sort_order', { ascending: true })

  const dtos: KbEntryDTO[] = ((entries ?? []) as Array<{
    id: string; category: string; question: string; answer: string;
    is_active: boolean; sort_order: number; updated_at: string;
  }>).map(e => ({
    id: e.id,
    category: e.category as KbEntryDTO['category'],
    question: e.question,
    answer: e.answer,
    sortOrder: e.sort_order,
    updatedAt: e.updated_at,
  }))

  return (
    <TrainView
      businessName={(business.name as string | null) ?? 'Client'}
      hasVapiAgent={Boolean(business.vapi_agent_id)}
      initialEntries={dtos}
      initialSyncStatus={((business.kb_sync_status as string | null) ?? 'synced') as SyncStatus}
      initialLastSyncedAt={(business.kb_last_synced_at as string | null) ?? null}
      adminClientId={clientId}
    />
  )
}
