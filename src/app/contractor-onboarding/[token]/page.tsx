import type { Metadata } from 'next'
import ContractorOnboardingClient from './onboarding-client'

export const metadata: Metadata = {
  title: 'Contractor Agreement - TalkMate',
}

export const dynamic = 'force-dynamic'

export default async function ContractorOnboardingPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  return <ContractorOnboardingClient token={token} />
}
