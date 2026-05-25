import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { DispatchUpgradingPlaceholder } from './_upgrading'

// Sessions 36-37 hotfix — the v1 dispatch board (dispatch_jobs +
// drivers + vehicles tables from migration 024) was replaced by the
// driver-app-ready schema in migration 048. Until Phase 4 ships the
// new MapLibre + Realtime Dispatch Centre, this page renders a clean
// "being upgraded" placeholder so existing owners do not see 500s.

export const metadata: Metadata = { title: 'Dispatch' }
export const dynamic = 'force-dynamic'

export default async function DispatchPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  return <DispatchUpgradingPlaceholder section="Dispatch board" />
}
