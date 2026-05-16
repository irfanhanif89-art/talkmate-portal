import { requireAdmin } from '@/lib/admin-auth'
import { redirect } from 'next/navigation'
import AdminPagePlaceholder from '@/components/admin/admin-page-placeholder'

export const dynamic = 'force-dynamic'

export default async function AdminContactsPage({
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
      pageLabel="Contacts"
      clientPath="/contacts"
      description="The client's CRM contact list. Inline admin editing is not yet available — use the client view to add, edit, or merge contacts."
    />
  )
}
