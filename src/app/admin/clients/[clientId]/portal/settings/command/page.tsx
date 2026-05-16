import { requireAdmin } from '@/lib/admin-auth'
import { redirect } from 'next/navigation'
import AdminPagePlaceholder from '@/components/admin/admin-page-placeholder'

export const dynamic = 'force-dynamic'

export default async function AdminCommandSettingsPage({
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
      pageLabel="Command Centre"
      clientPath="/settings/command"
      description="The client's Telegram-driven Command Centre status and history. For setup or token rotation, use the client view."
    />
  )
}
