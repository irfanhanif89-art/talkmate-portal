import { requireAdmin } from '@/lib/admin-auth'
import { redirect } from 'next/navigation'
import AdminPagePlaceholder from '@/components/admin/admin-page-placeholder'

export const dynamic = 'force-dynamic'

export default async function AdminBookingsPage({
  params,
}: {
  params: Promise<{ clientId: string }>
}) {
  const auth = await requireAdmin()
  if (!auth.ok) redirect('/login')
  const { clientId } = await params

  return (
    <AdminPagePlaceholder
      clientId={clientId}
      pageLabel="Bookings"
      clientPath="/bookings"
      description="Bookings the agent has scheduled for this client. For inline editing use the client view."
    />
  )
}
