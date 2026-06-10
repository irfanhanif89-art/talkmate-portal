import { redirect } from 'next/navigation'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { DEMO_BUSINESS_ID, DEMO_PHONE_NUMBER } from '@/lib/demo-config'
import DemoCallsClient, { type DemoCallRow } from './DemoCallsClient'

export const dynamic = 'force-dynamic'

// Session 77 — admin transcript viewer for REAL calls to the demo phone number
// and the website Talk button. Both are associated with the demo business by
// the Vapi webhook handler (see src/app/api/webhooks/vapi/route.ts). Seeded demo
// calls coexist here; the demo reset cron does not touch the `calls` table.
export default async function DemoCallsPage() {
  // Defensive auth gate, matching the sibling /admin/demo-accounts page.
  const gate = await createClient()
  const { data: { user } } = await gate.auth.getUser()
  if (!user) redirect('/login')
  const { data: userProfile } = await gate.from('users').select('role').eq('id', user.id).single()
  const isSuperAdmin = user.email === process.env.INTERNAL_ALERT_EMAIL
    || user.email === process.env.ADMIN_EMAIL
    || user.email === 'hello@talkmate.com.au'
  if (userProfile?.role !== 'admin' && !isSuperAdmin) redirect('/dashboard')

  const supabase = createAdminClient()
  const { data: calls } = await supabase
    .from('calls')
    .select('id, created_at, started_at, duration_seconds, caller_number, transcript, summary, outcome, intelligence_score')
    .eq('business_id', DEMO_BUSINESS_ID)
    .order('created_at', { ascending: false })
    .limit(200)

  return <DemoCallsClient calls={(calls ?? []) as DemoCallRow[]} demoNumber={DEMO_PHONE_NUMBER} />
}
