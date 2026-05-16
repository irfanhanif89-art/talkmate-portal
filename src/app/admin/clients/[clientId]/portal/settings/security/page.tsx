import { requireAdmin } from '@/lib/admin-auth'
import { redirect } from 'next/navigation'
import AdminPagePlaceholder from '@/components/admin/admin-page-placeholder'

export const dynamic = 'force-dynamic'

export default async function AdminSecuritySettingsPage({
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
      pageLabel="Security & Access"
      clientPath="/settings/security"
      description="Staff invitations, MFA, and data retention controls. These actions are owner-only — use the client view to make changes."
    />
  )
}
