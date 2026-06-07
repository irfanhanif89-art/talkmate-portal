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
    .from('businesses').select('id, name').eq('owner_user_id', user.id).maybeSingle()
  if (!business) redirect('/register')
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <BookingsView businessName={business.name as string} />
    </div>
  )
}
