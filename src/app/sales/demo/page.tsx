import { redirect } from 'next/navigation'
import { requireSalesRep } from '@/lib/sales-auth'
import DemoLauncherClient from '@/components/sales/DemoLauncherClient'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Demo Hub - TalkMate Sales HQ' }

export default async function DemoLauncherPage() {
  const auth = await requireSalesRep()
  if (!auth.ok) redirect('/')

  return (
    <DemoLauncherClient
      demoIndustry={auth.rep.demo_industry}
      demoDisplay={process.env.NEXT_PUBLIC_DEMO_PHONE_DISPLAY ?? ''}
      demoPortalToken={process.env.NEXT_PUBLIC_DEMO_PORTAL_TOKEN ?? ''}
      demoVideoUrl={process.env.NEXT_PUBLIC_DEMO_VIDEO_URL ?? ''}
    />
  )
}
