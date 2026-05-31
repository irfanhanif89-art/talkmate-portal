// Train TalkMate — Sprint Session 1
//
// Self-service knowledge-base editor. The page is a thin server shell
// that resolves the requesting business + initial entries; the actual
// editor lives in train-view.tsx (client) so add/edit/delete can happen
// without round-tripping through Next.

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import TrainView, { type KbEntryDTO, type SyncStatus } from './train-view'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Train TalkMate · TalkMate' }

export default async function TrainPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: business } = await supabase
    .from('businesses')
    .select('id, name, vapi_agent_id, kb_sync_status, kb_last_synced_at')
    .eq('owner_user_id', user.id)
    .limit(1)
    .maybeSingle()
  if (!business) redirect('/dashboard')

  const { data: entries } = await supabase
    .from('knowledge_base_entries')
    .select('id, category, question, answer, is_active, sort_order, updated_at')
    .eq('business_id', business.id)
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
      businessName={(business.name as string | null) ?? 'Your business'}
      hasVapiAgent={Boolean(business.vapi_agent_id)}
      initialEntries={dtos}
      initialSyncStatus={((business.kb_sync_status as string | null) ?? 'synced') as SyncStatus}
      initialLastSyncedAt={(business.kb_last_synced_at as string | null) ?? null}
    />
  )
}
