import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getPlan } from '@/lib/plan'
import CommandCentreClient from './command-centre-client'

export default async function CommandCentrePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: business } = await supabase
    .from('businesses')
    .select('id, name, plan, command_centre_platform, command_centre_token, command_authorised_numbers, command_daily_count')
    .eq('owner_user_id', user.id)
    .single()
  if (!business) redirect('/dashboard')

  const plan = getPlan(business.plan)

  // Recent commands
  const { data: history } = await supabase
    .from('command_logs')
    .select('id, platform, raw_command, parsed_intent, action_taken, outcome, created_at')
    .eq('business_id', business.id)
    .order('created_at', { ascending: false })
    .limit(25)

  // Pending confirmation
  const { data: pending } = await supabase
    .from('command_logs')
    .select('id, raw_command, parsed_intent, platform, expires_at')
    .eq('business_id', business.id)
    .eq('outcome', 'pending_confirmation')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  return (
    <CommandCentreClient
      planLabel={plan.label}
      hasCommandCentre={plan.hasCommandCentre}
      monthlyPrice={plan.monthlyPrice}
      connectedPlatform={business.command_centre_platform ?? null}
      hasToken={!!business.command_centre_token}
      authorisedNumbers={business.command_authorised_numbers ?? []}
      dailyCount={business.command_daily_count ?? 0}
      dailyLimit={plan.key === 'pro' || plan.key === 'professional' ? null : 50}
      history={history ?? []}
      pending={pending ?? null}
    />
  )
}
