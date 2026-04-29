import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import ContactDetailClient from './contact-detail-client'

export const dynamic = 'force-dynamic'

export default async function ContactDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: business } = await supabase
    .from('businesses').select('id, industry').eq('owner_user_id', user.id).single()
  if (!business) redirect('/register')

  const { data: contact } = await supabase
    .from('contacts').select('*').eq('id', id).eq('client_id', business.id).single()
  if (!contact) return notFound()

  const { data: calls } = await supabase
    .from('contact_calls')
    .select('id, call_id, call_at, duration_seconds, outcome, summary, transcript, tags_applied')
    .eq('contact_id', id)
    .order('call_at', { ascending: false })

  return (
    <ContactDetailClient
      contact={contact}
      calls={calls ?? []}
      industry={business.industry as string | null}
    />
  )
}
