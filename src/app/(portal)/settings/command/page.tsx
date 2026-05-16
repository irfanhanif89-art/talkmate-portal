import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import LockedPreview from '@/components/portal/locked-preview'
import CommandLockedDemo from '@/components/portal/command-locked-demo'
import CommandSettingsClient from './command-client'

export const dynamic = 'force-dynamic'

export default async function CommandSettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: bizList } = await supabase
    .from('businesses')
    .select('id, plan, industry, account_status, created_at')
    .eq('owner_user_id', user.id)

  const business = (bizList ?? [])
    .filter(b => !['cancelled', 'expired'].includes((b.account_status as string) ?? ''))
    .sort((a, b) => new Date(b.created_at as string).getTime() - new Date(a.created_at as string).getTime())[0]
  if (!business) redirect('/register')

  const plan = (business.plan as string | null) ?? 'starter'
  const industry = (business.industry as string | null) ?? ''
  const isTowing = industry === 'towing'
  const isPaidTier = plan === 'growth' || plan === 'pro' || plan === 'professional'

  // Industry mismatch -- info banner only, no upgrade path.
  if (!isTowing) {
    return (
      <LockedPreview
        variant="info"
        bannerTitle="TalkMate Command is for towing businesses"
        bannerSubtitle="Command lets towing operators manage their dispatcher via Telegram. Not available for your industry."
        featurePills={[]}
        upgradeTarget="growth"
        upgradePrice={499}
        lockPlanLabel=""
        lockBoldText=""
        lockMutedText=""
      >
        <CommandLockedDemo />
      </LockedPreview>
    )
  }

  // Towing client on Starter -- upgrade preview.
  if (!isPaidTier) {
    return (
      <LockedPreview
        bannerTitle="TalkMate Command is available on Growth and Pro plans"
        bannerSubtitle="Control your dispatcher from Telegram using plain English. Available for towing businesses."
        featurePills={['Plain English commands', 'Telegram bot', 'Job management', 'Driver updates', 'Live job status']}
        upgradeTarget="growth"
        upgradePrice={499}
        lockPlanLabel="Growth feature preview"
        lockBoldText="This is a preview of TalkMate Command"
        lockMutedText="Upgrade to Growth to control your dispatcher from Telegram."
      >
        <CommandLockedDemo />
      </LockedPreview>
    )
  }

  return <CommandSettingsClient />
}
