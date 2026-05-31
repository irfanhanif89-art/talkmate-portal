import { createAdminClient } from '@/lib/supabase/server'
import ChatbotAdminView, { type ChatbotConfig, type ChatSessionRow } from './chatbot-admin-view'

export const dynamic = 'force-dynamic'

// Admin-as-client chatbot page. Renders inside the admin portal shell
// (auth guarded by the portal layout's requireAdmin). Data is fetched
// directly with the service-role client; mutations and transcript loads
// go through the chatbot API routes with ?adminClientId={clientId}.
export default async function AdminChatbotPage({
  params,
}: {
  params: Promise<{ clientId: string }>
}) {
  const { clientId } = await params
  const admin = createAdminClient()

  const [{ data: biz }, { data: sessionRows }] = await Promise.all([
    admin
      .from('businesses')
      .select('chatbot_enabled, chatbot_greeting, chatbot_agent_name, chatbot_primary_color, chatbot_collect_leads_after, slug, plan')
      .eq('id', clientId)
      .maybeSingle(),
    admin
      .from('chat_sessions')
      .select('id, lead_name, lead_phone, lead_email, lead_captured, message_count, status, started_at')
      .eq('business_id', clientId)
      .order('started_at', { ascending: false })
      .limit(50),
  ])

  const config: ChatbotConfig = {
    enabled: biz?.chatbot_enabled ?? false,
    greeting: biz?.chatbot_greeting ?? null,
    agentName: biz?.chatbot_agent_name ?? null,
    primaryColor: biz?.chatbot_primary_color ?? null,
    collectLeadsAfter: biz?.chatbot_collect_leads_after ?? null,
    slug: biz?.slug ?? null,
    plan: biz?.plan ?? null,
  }

  const sessions: ChatSessionRow[] = (sessionRows ?? []).map((s) => ({
    id: s.id as string,
    leadName: (s.lead_name as string | null) ?? null,
    leadPhone: (s.lead_phone as string | null) ?? null,
    leadEmail: (s.lead_email as string | null) ?? null,
    leadCaptured: (s.lead_captured as boolean | null) ?? false,
    messageCount: (s.message_count as number | null) ?? 0,
    status: (s.status as string | null) ?? 'ended',
    startedAt: s.started_at as string,
  }))

  return <ChatbotAdminView clientId={clientId} initialConfig={config} sessions={sessions} />
}
