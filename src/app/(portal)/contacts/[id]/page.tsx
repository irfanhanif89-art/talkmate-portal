import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { fetchPipelineStages, hasPipeline } from '@/lib/pipeline'
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

  const industry = business.industry as string | null
  const stages = hasPipeline(industry) ? await fetchPipelineStages(supabase, business.id) : []
  const { data: pipelineRow } = hasPipeline(industry)
    ? await supabase
        .from('contact_pipeline')
        .select('id, stage_id, entered_at')
        .eq('contact_id', id)
        .maybeSingle()
    : { data: null }

  return (
    <ContactDetailClient
      contact={contact}
      calls={calls ?? []}
      industry={industry}
      pipelineStages={stages}
      pipelineRow={pipelineRow ? { stage_id: pipelineRow.stage_id as string, entered_at: pipelineRow.entered_at as string } : null}
    />
  )
}
