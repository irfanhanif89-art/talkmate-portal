import QuoteServiceAreaPanel from '@/components/portal/quote-service-area-panel'

export const dynamic = 'force-dynamic'

export default async function AdminServiceAreaSettingsPage({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params
  return <QuoteServiceAreaPanel adminClientId={clientId} />
}
