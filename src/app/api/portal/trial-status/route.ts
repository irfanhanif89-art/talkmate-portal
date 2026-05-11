import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Returns the current user's trial status. Used by the portal trial
// banner and the expired-trial overlay. Scoped via Supabase Auth — no
// admin access required.
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('businesses')
    .select('account_status, trial_start_date, trial_end_date, plan')
    .eq('owner_user_id', user.id)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'no business' }, { status: 404 })

  const daysRemaining = data.trial_end_date
    ? Math.max(0, Math.ceil((new Date(data.trial_end_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : null

  return NextResponse.json({
    account_status: data.account_status,
    trial_start_date: data.trial_start_date,
    trial_end_date: data.trial_end_date,
    days_remaining: daysRemaining,
    plan: data.plan,
  })
}
