import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import BookingsView from './bookings-view'

export const metadata: Metadata = { title: 'Bookings' }
export const dynamic = 'force-dynamic'

export default async function BookingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: business } = await supabase
    .from('businesses').select('id, name').eq('owner_user_id', user.id).single()
  if (!business) redirect('/register')
  return (
    <div style={{ padding: 28, maxWidth: 1200, margin: '0 auto', color: '#F2F6FB' }}>
      <BookingsView businessName={business.name as string} />
    </div>
  )
}
