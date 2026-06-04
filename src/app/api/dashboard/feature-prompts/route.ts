// Session 4B — contextual feature-discovery prompts, driven by real usage gaps.
// GET, cookie/admin/Bearer auth. Returns at most 2 prompts, lowest priority first.
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { resolveBusinessId } from '@/lib/resolve-business'

export const dynamic = 'force-dynamic'

interface Prompt {
  key: string
  title: string
  body: string
  actionLabel: string
  actionPath: string
  priority: number
}

export async function GET(req: Request) {
  const url = new URL(req.url)
  const adminClientId = url.searchParams.get('adminClientId')
  const resolved = await resolveBusinessId(adminClientId, req)
  if (!resolved.ok) {
    return NextResponse.json({ ok: false, error: resolved.error }, { status: resolved.status })
  }
  const businessId = resolved.businessId
  const supabase = createAdminClient()

  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString()

  const [bizRes, dismissRes, missedRes, kbRes, gapsRes] = await Promise.all([
    supabase.from('businesses')
      .select('plan, winback_enabled, review_requests_enabled, google_review_url, chatbot_enabled')
      .eq('id', businessId).maybeSingle(),
    supabase.from('banner_dismissals').select('banner_key').eq('business_id', businessId),
    supabase.from('calls').select('id', { count: 'exact', head: true })
      .eq('business_id', businessId).eq('was_abandoned', true).gte('created_at', weekAgo),
    supabase.from('knowledge_base_entries').select('id', { count: 'exact', head: true })
      .eq('business_id', businessId),
    supabase.from('transcript_gaps').select('id', { count: 'exact', head: true })
      .eq('business_id', businessId).eq('status', 'pending').lt('detected_at', threeDaysAgo),
  ])

  const business = bizRes.data as {
    plan?: string | null; winback_enabled?: boolean | null; review_requests_enabled?: boolean | null
    google_review_url?: string | null; chatbot_enabled?: boolean | null
  } | null
  if (!business) return NextResponse.json({ ok: true, prompts: [] })

  const dismissed = new Set((dismissRes.data ?? []).map(r => String(r.banner_key)))
  const missedCalls = missedRes.count ?? 0
  const kbCount = kbRes.count ?? 0
  const pendingGaps = gapsRes.count ?? 0
  const plan = business.plan ?? 'starter'
  const isGrowthOrPro = plan === 'growth' || plan === 'pro'

  const prompts: Prompt[] = []

  if (!dismissed.has('winback') && !business.winback_enabled && missedCalls >= 2) {
    prompts.push({
      key: 'winback',
      title: `You missed ${missedCalls} calls this week`,
      body: 'Win-back automatically texts them back within 90 seconds. Enable it in 30 seconds.',
      actionLabel: 'Enable Win-back', actionPath: '/settings#winback', priority: 1,
    })
  }

  if (!dismissed.has('kb_empty') && kbCount < 5) {
    prompts.push({
      key: 'kb_empty',
      title: 'Your agent is answering with limited information',
      body: 'Add your services, hours, and common questions so your agent can answer more accurately.',
      actionLabel: 'Train TalkMate', actionPath: '/train', priority: 1,
    })
  }

  if (!dismissed.has('train_gaps') && pendingGaps >= 3) {
    prompts.push({
      key: 'train_gaps',
      title: `${pendingGaps} questions your agent couldn't answer`,
      body: 'Review and add them to your knowledge base so your agent handles them next time.',
      actionLabel: 'View Insights', actionPath: '/insights', priority: 1,
    })
  }

  if (!dismissed.has('review_requests') && !business.review_requests_enabled && plan !== 'starter') {
    prompts.push({
      key: 'review_requests',
      title: 'Getting Google reviews on autopilot',
      body: 'TalkMate can automatically ask callers for a Google review after their job. Add your Google review link to get started.',
      actionLabel: 'Set up Reviews', actionPath: '/settings#reviews', priority: 2,
    })
  }

  // Parenthesised plan check — the v1 precedence bug was
  // `!chatbot_enabled && plan==='growth' || plan==='pro'`.
  if (!dismissed.has('chatbot') && !business.chatbot_enabled && isGrowthOrPro) {
    prompts.push({
      key: 'chatbot',
      title: 'Your plan includes a website chatbot',
      body: "You haven't activated your website chatbot yet. It captures leads while you sleep.",
      actionLabel: 'Set up Chatbot', actionPath: '/chatbot', priority: 3,
    })
  }

  prompts.sort((a, b) => a.priority - b.priority)
  return NextResponse.json({ ok: true, prompts: prompts.slice(0, 2) })
}
