import { redirect } from 'next/navigation'

export default async function AdminPortalIndex({
  params,
}: {
  params: Promise<{ clientId: string }>
}) {
  const { clientId } = await params
  redirect(`/admin/clients/${clientId}/portal/dashboard`)
}
