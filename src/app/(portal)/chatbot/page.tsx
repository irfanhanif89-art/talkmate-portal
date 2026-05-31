// AI Website Chatbot — Client Portal UI (Sprint features 2).
//
// Thin server shell. Resolves the requesting business + chatbot config and
// hands a DTO to ChatbotView (client) which owns enable/customise/preview.
// Plan gating: starter accounts see a locked upgrade prompt and nothing else.

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import ChatbotView, { type ChatbotDTO } from './chatbot-view'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Chatbot · TalkMate' }

export default async function ChatbotPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: business } = await supabase
    .from('businesses')
    .select('id, name, plan, chatbot_enabled, chatbot_greeting, chatbot_agent_name, chatbot_primary_color, chatbot_collect_leads_after, slug, chatbot_allowed_domains')
    .eq('owner_user_id', user.id)
    .limit(1)
    .maybeSingle()
  if (!business) redirect('/dashboard')

  const dto: ChatbotDTO = {
    id: business.id as string,
    name: (business.name as string | null) ?? 'Your business',
    plan: ((business.plan as string | null) ?? 'starter') as ChatbotDTO['plan'],
    enabled: Boolean(business.chatbot_enabled),
    greeting: (business.chatbot_greeting as string | null) ?? '',
    agentName: (business.chatbot_agent_name as string | null) ?? 'TalkMate',
    primaryColor: (business.chatbot_primary_color as string | null) ?? '#E8622A',
    collectLeadsAfter: (business.chatbot_collect_leads_after as number | null) ?? 2,
    slug: (business.slug as string | null) ?? null,
    allowedDomains: (business.chatbot_allowed_domains as string[] | null) ?? [],
  }

  return <ChatbotView business={dto} />
}
