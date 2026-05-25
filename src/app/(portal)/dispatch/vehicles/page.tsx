import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { DispatchUpgradingPlaceholder } from '../_upgrading'

export const metadata: Metadata = { title: 'Vehicles' }
export const dynamic = 'force-dynamic'

export default async function VehiclesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  return <DispatchUpgradingPlaceholder section="Vehicles" />
}
