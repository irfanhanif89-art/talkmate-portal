// Pipeline default stages per industry. Real estate, trades, professional
// services get a kanban; everyone else has no pipeline view.

import type { SupabaseClient } from '@supabase/supabase-js'

export type PipelineIndustry = 'real_estate' | 'trades' | 'professional_services'

export const PIPELINE_INDUSTRIES: PipelineIndustry[] = ['real_estate', 'trades', 'professional_services']

export function hasPipeline(industry: string | null | undefined): industry is PipelineIndustry {
  return !!industry && (PIPELINE_INDUSTRIES as string[]).includes(industry)
}

interface StageSeed { name: string; color: string; isTerminal?: boolean }

export const PIPELINE_STAGES: Record<PipelineIndustry, StageSeed[]> = {
  real_estate: [
    { name: 'New Enquiry',         color: '#1565C0' },
    { name: 'Qualified',           color: '#1565C0' },
    { name: 'Inspection Booked',   color: '#E8622A' },
    { name: 'Inspection Attended', color: '#E8622A' },
    { name: 'Offer Made',          color: '#22C55E' },
    { name: 'Under Contract',      color: '#22C55E' },
    { name: 'Settled',             color: '#22C55E', isTerminal: true },
    { name: 'Lost',                color: '#94A3B8', isTerminal: true },
  ],
  trades: [
    { name: 'New Enquiry',    color: '#1565C0' },
    { name: 'Quote Sent',     color: '#F59E0B' },
    { name: 'Quote Accepted', color: '#22C55E' },
    { name: 'Job Scheduled',  color: '#22C55E' },
    { name: 'Job Complete',   color: '#22C55E' },
    { name: 'Invoiced',       color: '#8B5CF6' },
    { name: 'Paid',           color: '#22C55E', isTerminal: true },
    { name: 'Lost',           color: '#94A3B8', isTerminal: true },
  ],
  professional_services: [
    { name: 'New Enquiry',         color: '#1565C0' },
    { name: 'Consultation Booked', color: '#E8622A' },
    { name: 'Consultation Done',   color: '#E8622A' },
    { name: 'Proposal Sent',       color: '#F59E0B' },
    { name: 'Client Engaged',      color: '#22C55E', isTerminal: true },
    { name: 'Closed Lost',         color: '#94A3B8', isTerminal: true },
  ],
}

export async function seedPipelineStages(
  admin: SupabaseClient,
  clientId: string,
  industry: PipelineIndustry,
) {
  const seeds = PIPELINE_STAGES[industry]
  const { data: existing } = await admin.from('pipeline_stages').select('stage_name').eq('client_id', clientId)
  const existingNames = new Set((existing ?? []).map(r => r.stage_name as string))

  const toInsert = seeds
    .filter(s => !existingNames.has(s.name))
    .map((s, i) => ({
      client_id: clientId,
      industry,
      stage_name: s.name,
      stage_order: seeds.indexOf(s),
      color: s.color,
      is_terminal: s.isTerminal ?? false,
    }))

  if (toInsert.length === 0) return { inserted: 0 }
  const { error } = await admin.from('pipeline_stages').insert(toInsert)
  if (error) {
    console.error('[seedPipelineStages]', error)
    return { inserted: 0, error }
  }
  return { inserted: toInsert.length }
}

export interface PipelineStageRow {
  id: string
  stage_name: string
  stage_order: number
  color: string
  is_terminal: boolean
}

export async function fetchPipelineStages(supabase: SupabaseClient, clientId: string): Promise<PipelineStageRow[]> {
  const { data } = await supabase
    .from('pipeline_stages')
    .select('id, stage_name, stage_order, color, is_terminal')
    .eq('client_id', clientId)
    .order('stage_order', { ascending: true })
  return (data ?? []) as PipelineStageRow[]
}
