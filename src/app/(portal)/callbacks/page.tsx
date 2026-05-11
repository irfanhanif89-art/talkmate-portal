import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import CallbacksView from './callbacks-view'

export const metadata: Metadata = { title: 'Callbacks' }
export const dynamic = 'force-dynamic'

export default async function CallbacksPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  return (
    <div style={{ padding: 28, maxWidth: 1200, margin: '0 auto', color: '#F2F6FB' }}>
      <CallbacksView />
    </div>
  )
}
