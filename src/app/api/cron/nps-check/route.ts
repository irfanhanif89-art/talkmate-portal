import { NextResponse } from 'next/server'
import { verifyCron } from '@/lib/cron-auth'
import { createAdminClient } from '@/lib/supabase/server'

// Daily — surface a list of users due for NPS prompts. The actual modal is
// shown by the dashboard when the user logs in; this cron is a safety net
// that emits a webhook so Make.com can also trigger an in-app email reminder.
export async function GET(req: Request) {
  const guard = verifyCron(req); if (guard) return guard

  const supabase = createAdminClient()
  const day30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  const day90 = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
  const day31 = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000)
  const day91 = new Date(Date.now() - 91 * 24 * 60 * 60 * 1000)

  const due30 = await supabase.from('businesses')
    .select('id, name, owner_user_id, signup_at')
    .gte('signup_at', day31.toISOString()).lte('signup_at', day30.toISOString())

  const due90 = await supabase.from('businesses')
    .select('id, name, owner_user_id, signup_at')
    .gte('signup_at', day91.toISOString()).lte('signup_at', day90.toISOString())

  return NextResponse.json({
    ok: true,
    due_day30: due30.data?.length ?? 0,
    due_day90: due90.data?.length ?? 0,
  })
}
