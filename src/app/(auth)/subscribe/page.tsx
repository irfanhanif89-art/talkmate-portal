import { createClient } from '@/lib/supabase/server'
import SubscribePageClient from './subscribe-client'

export default async function SubscribePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  let paymentLink: string | null = null
  let businessName: string | null = null
  let plan: string | null = null
  let ownerName: string | null = null

  if (user) {
    const { data: biz } = await supabase
      .from('businesses')
      .select('name, plan, stripe_payment_link, onboarded_by, notifications_config')
      .eq('owner_user_id', user.id)
      .maybeSingle()

    if (biz?.onboarded_by === 'admin' && biz?.stripe_payment_link) {
      paymentLink = biz.stripe_payment_link
      businessName = biz.name
      plan = biz.plan
      ownerName = (biz.notifications_config as Record<string, unknown> | null)?.['owner_name'] as string | null
        ?? (user.user_metadata?.full_name as string | null)
        ?? null
    }
  }

  return (
    <SubscribePageClient
      paymentLink={paymentLink}
      businessName={businessName}
      plan={plan}
      ownerName={ownerName}
    />
  )
}
