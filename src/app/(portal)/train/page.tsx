// Train TalkMate — Sprint Session 1
//
// Self-service knowledge-base editor. The page is a thin server shell
// that resolves the requesting business + initial entries; the actual
// editor lives in train-view.tsx (client) so add/edit/delete can happen
// without round-tripping through Next.

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import TrainView, { type KbEntryDTO, type SyncStatus, type ResponseStyle, type OpeningHours } from './train-view'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'AI Receptionist · TalkMate' }

export default async function TrainPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: business } = await supabase
    .from('businesses')
    .select('id, name, vapi_agent_id, kb_sync_status, kb_last_synced_at, voice, greeting, agent_name, opening_hours, notifications_config')
    .eq('owner_user_id', user.id)
    .limit(1)
    .maybeSingle()
  if (!business) redirect('/dashboard')

  // Agent config lives across the top-level columns and notifications_config
  // (the latter is what the admin onboarding flow writes). Read from both,
  // preferring the config blob for the AI-specific fields — mirrors Settings.
  const cfg = ((business.notifications_config ?? {}) as Record<string, unknown>)
  const topHours = (business.opening_hours ?? null) as OpeningHours | null
  const cfgHours = (cfg.opening_hours ?? null) as OpeningHours | null
  const openingHours = (topHours && Object.keys(topHours).length > 0 ? topHours : cfgHours) ?? undefined
  const toneVal = typeof cfg.tone === 'number' ? cfg.tone : 65
  const responseStyle = (typeof cfg.response_style === 'string' ? cfg.response_style : 'balanced') as ResponseStyle
  const forwardTo = (cfg.forward_to_number as string) || (cfg.live_transfer_number as string) || ''

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
      initialAgentName={(cfg.agent_name as string) || (business.agent_name as string | null) || ''}
      initialGreeting={(cfg.agent_answer_phrase as string) || (business.greeting as string | null) || 'Thank you for calling. How can I help you today?'}
      initialVoice={(business.voice as string | null) || 'sarah'}
      initialTone={toneVal}
      initialResponseStyle={responseStyle}
      initialEscalation={(cfg.escalation_rules as string) || ''}
      forwardTo={forwardTo}
      initialOpeningHours={openingHours}
    />
  )
}
