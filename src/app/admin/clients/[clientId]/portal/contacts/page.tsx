import { requireAdmin } from '@/lib/admin-auth'
import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default async function Page({ params }: { params: Promise<{ clientId: string }> }) {
  const auth = await requireAdmin()
  if (!auth.ok) redirect('/login')
  const { clientId } = await params
  redirect(`/api/admin/clients/${clientId}/impersonate?redirect=1&next=/contacts`)
}
