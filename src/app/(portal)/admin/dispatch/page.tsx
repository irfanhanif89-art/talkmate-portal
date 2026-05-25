import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { AdminDispatchView } from './admin-dispatch-view'

// Sessions 36-37 — TalkMate-admin parity view. Cross-business dispatcher
// state for Irfan. Read-only; per-client management still happens in
// each business's own /dispatch.

export const metadata: Metadata = { title: 'Dispatch (admin)' }
export const dynamic = 'force-dynamic'

export default async function AdminDispatchPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  // is_super_admin gating is enforced by the API; the page renders for
  // anyone who can fetch /api/admin/dispatch/overview successfully.
  return <AdminDispatchView />
}
