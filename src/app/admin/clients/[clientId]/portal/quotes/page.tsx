import QuotesLogView from '@/components/portal/quotes-log-view'

export const dynamic = 'force-dynamic'

export default async function AdminQuotesPage({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params
  return <QuotesLogView adminClientId={clientId} />
}
