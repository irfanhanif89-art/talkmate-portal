// Session 43 — Admin Sales Pipeline view.
//
// Server component. Single Promise.all on page load — no polling, no
// 60-second auto-refresh. Admin clicks the Refresh button in the
// header when they want fresh data (router.refresh() pattern).
//
// MRR is calculated as monthly equivalent: annual deals count their
// $299/$499/$799 monthly recurring revenue, not the upfront cash. This
// keeps "MRR" comparable across months. Sprint window is admin-editable
// via admin_settings table (migration 052 seeded current month defaults).
// All date math is AEST-aware via aestDateToIsoStart/aestDateToIsoEnd.

import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { PLAN_PRICE_AUD } from '@/lib/admin-auth'
import {
  LEAD_STATUS_COLUMNS,
  aestDateToIsoStart,
  aestDateToIsoEnd,
  type LeadStatus,
} from '@/lib/sales-format'
import SalesPipelineHeader from '@/components/admin/SalesPipelineHeader'
import SalesPipelineCard, { type RepPipelineData } from '@/components/admin/SalesPipelineCard'

export const metadata: Metadata = {
  title: 'Sales Pipeline — TalkMate Admin',
}

// Match the bulk-reassign default — only open statuses count as
// "open pipeline" for the per-rep pipeline value calculation.
const OPEN_STATUSES: LeadStatus[] = ['new', 'contacted', 'demo_booked', 'demo_done', 'proposal_sent']

interface SalesRepRow {
  id: string
  full_name: string
  status: string
}

interface LeadRow {
  id: string
  assigned_to: string | null
  business_name: string
  status: LeadStatus
  won_plan: 'starter' | 'growth' | 'pro' | null
  won_billing_cycle: 'monthly' | 'annual' | null
  won_at: string | null
  updated_at: string | null
}

interface CommissionRow {
  rep_id: string
  commission_amount: number
  bonus_amount: number | null
  status: string
}

interface SettingRow {
  key: string
  value: string
}

export default async function SalesPipelinePage() {
  // Admin gate — match the existing /admin/sales-team server-side check.
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login?next=/admin/sales-pipeline')

  const { data: userProfile } = await supabase.from('users').select('role').eq('id', user.id).single()
  const allowList = [
    ...(process.env.ADMIN_EMAIL ?? '').split(','),
    ...(process.env.INTERNAL_ALERT_EMAIL ?? '').split(','),
    'hello@talkmate.com.au',
  ].map(s => s.trim().toLowerCase()).filter(Boolean)
  const isSuperAdmin = !!user.email && allowList.includes(user.email.toLowerCase())
  if (userProfile?.role !== 'admin' && !isSuperAdmin) redirect('/dashboard')

  const admin = createAdminClient()
  const [repsRes, leadsRes, commissionsRes, settingsRes] = await Promise.all([
    admin
      .from('sales_reps')
      .select('id, full_name, status')
      .order('full_name', { ascending: true }),
    admin
      .from('leads')
      .select('id, assigned_to, business_name, status, won_plan, won_billing_cycle, won_at, updated_at'),
    admin
      .from('commissions')
      .select('rep_id, commission_amount, bonus_amount, status'),
    admin
      .from('admin_settings')
      .select('key, value')
      .in('key', ['sales_sprint_start', 'sales_sprint_end', 'sales_mrr_target']),
  ])

  const reps = (repsRes.data ?? []) as SalesRepRow[]
  const leads = (leadsRes.data ?? []) as LeadRow[]
  const commissions = (commissionsRes.data ?? []) as CommissionRow[]
  const settings = (settingsRes.data ?? []) as SettingRow[]

  const settingMap = new Map(settings.map(s => [s.key, s.value]))
  const sprintStart = settingMap.get('sales_sprint_start') ?? null
  const sprintEnd = settingMap.get('sales_sprint_end') ?? null
  const mrrTargetRaw = settingMap.get('sales_mrr_target')
  const mrrTarget = mrrTargetRaw ? Number.parseInt(mrrTargetRaw, 10) : null

  const sprintStartIso = aestDateToIsoStart(sprintStart)
  const sprintEndIso = aestDateToIsoEnd(sprintEnd)

  // Build per-rep aggregates.
  const repData: RepPipelineData[] = reps.map(rep => {
    const repLeads = leads.filter(l => l.assigned_to === rep.id)

    // MRR closed THIS SPRINT — won leads with won_at inside the window.
    let mrrClosed = 0
    for (const l of repLeads) {
      if (l.status !== 'won' || !l.won_at || !l.won_plan) continue
      if (sprintStartIso && l.won_at < sprintStartIso) continue
      if (sprintEndIso && l.won_at > sprintEndIso) continue
      mrrClosed += PLAN_PRICE_AUD[l.won_plan]
    }

    // Commission earned (approved + paid).
    const commissionEarned = commissions
      .filter(c => c.rep_id === rep.id && (c.status === 'approved' || c.status === 'paid'))
      .reduce((sum, c) => sum + Number(c.commission_amount) + Number(c.bonus_amount ?? 0), 0)

    // Pipeline value = base commission for every open lead at its won_plan
    // (defaults to growth if not yet picked).
    const pipelineValue = repLeads
      .filter(l => OPEN_STATUSES.includes(l.status))
      .reduce((sum, l) => sum + (l.won_plan ? PLAN_PRICE_AUD[l.won_plan] : PLAN_PRICE_AUD.growth), 0)

    // Per-stage counts.
    const stageCounts: Record<LeadStatus, number> = {
      new: 0, contacted: 0, demo_booked: 0, demo_done: 0,
      proposal_sent: 0, won: 0, lost: 0, nurture: 0, bad_lead: 0,
    }
    for (const l of repLeads) {
      if (l.status in stageCounts) stageCounts[l.status]++
    }

    // 5 most-recently-updated leads.
    const recent = repLeads
      .slice()
      .sort((a, b) => {
        const ta = a.updated_at ? new Date(a.updated_at).getTime() : 0
        const tb = b.updated_at ? new Date(b.updated_at).getTime() : 0
        return tb - ta
      })
      .slice(0, 5)
      .map(l => ({
        id: l.id,
        business_name: l.business_name,
        status: l.status,
        updated_at: l.updated_at,
      }))

    const openLeadCount = OPEN_STATUSES.reduce((sum, s) => sum + (stageCounts[s] ?? 0), 0)

    return {
      rep_id: rep.id,
      rep_name: rep.full_name,
      rep_status: rep.status,
      mrr_closed: mrrClosed,
      commission_earned: commissionEarned,
      pipeline_value: pipelineValue,
      stage_counts: stageCounts,
      recent_deals: recent,
      open_lead_count: openLeadCount,
    }
  })

  const totalMrrClosed = repData.reduce((sum, r) => sum + r.mrr_closed, 0)

  const activeReps = repData.filter(r => r.rep_status === 'active')
  const inactiveRepsWithOpen = repData.filter(r => r.rep_status !== 'active' && r.open_lead_count > 0)

  const destinationReps = reps
    .filter(r => r.status === 'active')
    .map(r => ({ id: r.id, full_name: r.full_name, status: r.status }))

  return (
    <div style={{ padding: 24, maxWidth: 1400, margin: '0 auto', fontFamily: 'Outfit, sans-serif' }}>
      <SalesPipelineHeader
        sprintStart={sprintStart}
        sprintEnd={sprintEnd}
        mrrTarget={mrrTarget}
        closedMrr={totalMrrClosed}
        lastRefreshedIso={new Date().toISOString()}
      />

      {/* Active reps grid */}
      {activeReps.length === 0 ? (
        <div style={{
          padding: 40, background: '#0A1E38',
          border: '1px solid rgba(255,255,255,0.06)', borderRadius: 14,
          color: '#7BAED4', textAlign: 'center', fontSize: 14,
        }}>
          No active sales reps. Invite a rep from the Sales Team page to start tracking pipeline.
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))',
          gap: 18,
        }}>
          {activeReps.map(rep => (
            <SalesPipelineCard
              key={rep.rep_id}
              rep={rep}
              destinationReps={destinationReps}
            />
          ))}
        </div>
      )}

      {/* Inactive reps with orphan leads */}
      {inactiveRepsWithOpen.length > 0 && (
        <div style={{ marginTop: 28 }}>
          <div style={{
            fontSize: 11, fontWeight: 800, color: '#f59e0b',
            letterSpacing: '0.1em', textTransform: 'uppercase',
            marginBottom: 12, padding: '0 4px',
          }}>
            Inactive reps with open leads ({inactiveRepsWithOpen.length})
          </div>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))',
            gap: 18,
          }}>
            {inactiveRepsWithOpen.map(rep => (
              <SalesPipelineCard
                key={rep.rep_id}
                rep={rep}
                destinationReps={destinationReps}
              />
            ))}
          </div>
          <div style={{
            marginTop: 12, fontSize: 12, color: '#94a3b8', padding: '0 4px',
          }}>
            These reps are inactive but still own open leads. Use the &ldquo;Reassign open leads&rdquo; button on each card to move their pipeline to an active rep.
          </div>
        </div>
      )}
    </div>
  )
}
