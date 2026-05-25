import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { DispatchUpgradingPlaceholder } from '../_upgrading'

export const metadata: Metadata = { title: 'Drivers' }
export const dynamic = 'force-dynamic'

export default async function DriversPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  return <DispatchUpgradingPlaceholder section="Drivers" />
}
