// Chatbot conversations log — Client Portal UI (Sprint features 2).
//
// Thin server shell: resolves the business (for plan gating + redirect) and
// hands off to the client view, which paginates/filters via
// GET /api/chatbot/sessions and opens transcripts via the detail endpoint.

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import SessionsView from './sessions-view'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Chatbot conversations · TalkMate' }

export default async function ChatbotSessionsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: business } = await supabase
    .from('businesses')
    .select('id, plan')
    .eq('owner_user_id', user.id)
    .limit(1)
    .maybeSingle()
  if (!business) redirect('/dashboard')
  if ((business.plan as string | null) === 'starter') redirect('/chatbot?notice=chatbot_requires_growth')

  return <SessionsView />
}
