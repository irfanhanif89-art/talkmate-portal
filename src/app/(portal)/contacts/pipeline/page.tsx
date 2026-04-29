import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { fetchPipelineStages, hasPipeline, seedPipelineStages, type PipelineIndustry } from '@/lib/pipeline'
import PipelineKanbanClient from './pipeline-kanban-client'

export const dynamic = 'force-dynamic'

export default async function PipelinePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: business } = await supabase
    .from('businesses').select('id, industry').eq('owner_user_id', user.id).single()
  if (!business) redirect('/register')

  const industry = business.industry as string | null
  if (!hasPipeline(industry)) {
    return (
      <div style={{ padding: 28, color: '#F2F6FB' }}>
        <Link href="/contacts" style={{ fontSize: 13, color: '#7BAED4', textDecoration: 'none' }}>← All contacts</Link>
        <h1 style={{ fontSize: '1.6rem', fontWeight: 800, color: 'white', marginTop: 8, marginBottom: 8 }}>Pipeline</h1>
        <p style={{ fontSize: 14, color: '#7BAED4', marginBottom: 18 }}>
          Pipelines are available for real estate, trades, and professional services. Set your industry on the onboarding screen.
        </p>
      </div>
    )
  }

  // Auto-seed if there aren't any stages yet (Session 2 brief Part 4).
  let stages = await fetchPipelineStages(supabase, business.id)
  if (stages.length === 0) {
    const admin = createAdminClient()
    await seedPipelineStages(admin, business.id, industry as PipelineIndustry)
    stages = await fetchPipelineStages(supabase, business.id)
  }

  // Pull every contact currently in the pipeline along with industry_data
  // (we display the property they enquired about for real estate).
  const { data: pipelineRows } = await supabase
    .from('contact_pipeline')
    .select('id, stage_id, entered_at, contact_id, contacts(id, name, phone, tags, industry_data)')
    .eq('client_id', business.id)
    .order('entered_at', { ascending: true })

  return (
    <PipelineKanbanClient
      industry={industry as PipelineIndustry}
      stages={stages}
      contacts={(pipelineRows ?? []).map(r => {
        const c = (r.contacts as unknown) as { id: string; name: string | null; phone: string; tags: string[] | null; industry_data: Record<string, unknown> }
        return {
          pipeline_row_id: r.id as string,
          contact_id: r.contact_id as string,
          stage_id: r.stage_id as string,
          entered_at: r.entered_at as string,
          name: c?.name ?? null,
          phone: c?.phone ?? '',
          tags: c?.tags ?? null,
          industry_data: c?.industry_data ?? {},
        }
      })}
    />
  )
}
