import { redirect } from 'next/navigation'
import { requireDriver } from '@/lib/driver-auth'
import { createAdminClient } from '@/lib/supabase/server'
import { DriverProfileClient } from './profile-client'

export const dynamic = 'force-dynamic'

export default async function DriverProfilePage() {
  const auth = await requireDriver()
  if (!auth.ok) redirect('/driver/login')

  const admin = createAdminClient()
  const { data: business } = await admin
    .from('businesses')
    .select('name')
    .eq('id', auth.driver.client_id)
    .maybeSingle()

  return (
    <DriverProfileClient
      driver={auth.driver}
      businessName={business?.name ?? ''}
    />
  )
}
