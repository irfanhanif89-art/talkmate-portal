import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyCron } from '@/lib/cron-auth'

// Daily cron — runs at 9am AEST (23:00 UTC). Finds trials whose
// trial_end_date falls inside the next 24h window and fires the
// Make.com "day 6 reminder" webhook so Donna can send the reminder
// email/SMS.
export async function GET(req: Request) {
  const denied = verifyCron(req)
  if (denied) return denied

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const now = new Date()
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000)

  const { data: trials, error } = await supabase
    .from('businesses')
    .select('id, name, industry, plan, trial_end_date, owner_user_id')
    .eq('account_status', 'trial')
    .gte('trial_end_date', now.toISOString())
    .lte('trial_end_date', tomorrow.toISOString())

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const list = trials ?? []
  let webhookStatus: 'sent' | 'skipped_no_url' | 'skipped_empty' | 'failed' = 'skipped_no_url'
  let webhookError: string | null = null

  if (list.length === 0) {
    webhookStatus = 'skipped_empty'
  } else if (process.env.MAKE_TRIAL_REMINDER_WEBHOOK) {
    try {
      const res = await fetch(process.env.MAKE_TRIAL_REMINDER_WEBHOOK, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          trigger: 'trial_day_6_reminder',
          timestamp: now.toISOString(),
          trials: list.map(b => ({
            id: b.id,
            business_name: b.name,
            industry: b.industry,
            plan: b.plan,
            trial_end_date: b.trial_end_date,
            owner_user_id: b.owner_user_id,
          })),
        }),
      })
      webhookStatus = res.ok ? 'sent' : 'failed'
      if (!res.ok) webhookError = `webhook responded ${res.status}`
    } catch (e) {
      webhookStatus = 'failed'
      webhookError = e instanceof Error ? e.message : String(e)
    }
  }

  return NextResponse.json({
    success: true,
    reminders_count: list.length,
    webhook: { status: webhookStatus, error: webhookError },
    timestamp: now.toISOString(),
  })
}
