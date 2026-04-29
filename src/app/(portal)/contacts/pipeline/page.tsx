import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { fetchPipelineStages, hasPipeline, seedPipelineStages, type PipelineIndustry } from '@/lib/pipeline'
import PipelineKanbanClient from './pipeline-kanban-client'
import DemoDataBanner from '@/components/portal/demo-data-banner'
import { DEMO_PHONE_PREFIX } from '@/lib/demo-data'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Pipeline' }

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
        <p style={{ fontSize: 14, color: '#7BAED4', marginBottom: 12, lineHeight: 1.6 }}>
          Pipelines are available for real estate, trades, and professional services.
          {industry ? <> Your current industry is <strong style={{ color: 'white' }}>{industry.replace(/_/g, ' ')}</strong>.</> : null}
        </p>
        <Link
          href="/settings"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            background: 'rgba(232,98,42,0.12)', border: '1px solid rgba(232,98,42,0.3)',
            color: '#E8622A', padding: '8px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600,
            textDecoration: 'none', fontFamily: 'Outfit, sans-serif',
          }}
        >
          Update your industry in Account Settings →
        </Link>
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
  const [{ data: pipelineRows }, { count: demoCount }, { data: userProfile }] = await Promise.all([
    supabase
      .from('contact_pipeline')
      .select('id, stage_id, entered_at, contact_id, contacts(id, name, phone, tags, industry_data)')
      .eq('client_id', business.id)
      .order('entered_at', { ascending: true }),
    supabase.from('contacts').select('id', { count: 'exact', head: true })
      .eq('client_id', business.id).like('phone', `${DEMO_PHONE_PREFIX}%`),
    supabase.from('users').select('role').eq('id', user.id).single(),
  ])

  const isAdmin = userProfile?.role === 'admin'
    || user.email === process.env.INTERNAL_ALERT_EMAIL
    || user.email === 'hello@talkmate.com.au'

  return (
    <div>
      {(demoCount ?? 0) > 0 && (
        <div style={{ padding: '20px 28px 0' }}>
          <DemoDataBanner businessId={business.id} isAdmin={isAdmin} />
        </div>
      )}
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
    </div>
  )
}
