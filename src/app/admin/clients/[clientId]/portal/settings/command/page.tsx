import { requireAdmin } from '@/lib/admin-auth'
import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/server'
import AdminPagePlaceholder from '@/components/admin/admin-page-placeholder'
import LockedPreview from '@/components/portal/locked-preview'
import CommandLockedDemo from '@/components/portal/command-locked-demo'

export const dynamic = 'force-dynamic'

export default async function AdminCommandSettingsPage({
  params,
}: {
  params: Promise<{ clientId: string }>
}) {
  const auth = await requireAdmin()
  if (!auth.ok) redirect('/login')
  const { clientId } = await params

  const admin = createAdminClient()
  const { data: business } = await admin
    .from('businesses')
    .select('plan, industry')
    .eq('id', clientId)
    .maybeSingle()

  const plan = (business?.plan as string | null) ?? 'starter'
  const industry = (business?.industry as string | null) ?? ''
  const isTowing = industry === 'towing'
  const isPaidTier = plan === 'growth' || plan === 'pro' || plan === 'professional'

  if (!isTowing) {
    return (
      <LockedPreview
        adminClientId={clientId}
        variant="info"
        bannerTitle="TalkMate Command is for towing businesses"
        bannerSubtitle="Command lets towing operators manage their dispatcher via Telegram. Not available for this client's industry."
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

  if (!isPaidTier) {
    return (
      <LockedPreview
        adminClientId={clientId}
        bannerTitle="TalkMate Command is available on Growth and Pro plans"
        bannerSubtitle="Control the dispatcher from Telegram using plain English."
        featurePills={['Plain English commands', 'Telegram bot', 'Job management', 'Driver updates', 'Live job status']}
        upgradeTarget="growth"
        upgradePrice={499}
        lockPlanLabel="Growth feature preview"
        lockBoldText="This is a preview of TalkMate Command"
        lockMutedText="Upgrade this client to Growth to enable Telegram control."
      >
        <CommandLockedDemo />
      </LockedPreview>
    )
  }

  return (
    <AdminPagePlaceholder
      clientId={clientId}
      pageLabel="Command Centre"
      clientPath="/settings/command"
      description="The client's Telegram-driven Command Centre status and history. For setup or token rotation, use the client view."
    />
  )
}
