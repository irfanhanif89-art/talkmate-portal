// Admin-as-client Agent Insights view. Reuses InsightsView with adminClientId
// so the gaps + flagged-calls API calls hit the admin-override branch.
import InsightsView from '@/components/portal/insights-view'

export const dynamic = 'force-dynamic'

export default async function AdminInsightsPage({
  params,
}: {
  params: Promise<{ clientId: string }>
}) {
  const { clientId } = await params
  return <InsightsView adminClientId={clientId} />
}
