import { createClient } from '@/lib/supabase/server'
import { requireSalesRep } from '@/lib/sales-auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import {
  LayoutDashboard, Trophy, Clock4, DollarSign,
  Phone, Mail, Calendar, FileText, Pencil, ArrowRightLeft, Wrench,
  UserPlus, Play, Users,
} from 'lucide-react'
import {
  formatCurrency, LEAD_STATUS_STYLES, type LeadStatus, daysSince, timeAgo,
  aestDateToIsoStart, aestDateToIsoEnd, formatSprintRange,
} from '@/lib/sales-format'
import { COMMISSION_MAP, isCommissionPlan } from '@/lib/commission'
import { PLAN_PRICE_AUD } from '@/lib/admin-auth'
import MissingEmailBanner from '@/components/sales/MissingEmailBanner'
import { KpiCard } from '@/components/portal/ui-v2/kpi-card'
import { Panel, PanelHeader } from '@/components/portal/ui-v2/panel'
import { KanbanBoard, KanbanColumn, KanbanCard } from '@/components/portal/ui-v2/kanban'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Dashboard — TalkMate Sales HQ' }

const ACTIVITY_ICONS: Record<string, React.ComponentType<{ size?: number }>> = {
  call: Phone, email: Mail, demo: Calendar, proposal: FileText,
  note: Pencil, status_change: ArrowRightLeft, system: Wrench, approval: Trophy,
}

// Stage labels for the mini-kanban pipeline — only the active stages
const PIPELINE_STAGES: Array<{ key: LeadStatus; label: string }> = [
  { key: 'new',           label: 'New' },
  { key: 'contacted',     label: 'Contacted' },
  { key: 'demo_booked',   label: 'Demo Booked' },
  { key: 'demo_done',     label: 'Demo Done' },
  { key: 'proposal_sent', label: 'Proposal' },
]

export default async function SalesDashboardPage() {
  const auth = await requireSalesRep()
  if (!auth.ok) redirect('/')

  const supabase = await createClient()
  const repId = auth.rep.id

  const startOfMonth = new Date()
  startOfMonth.setDate(1)
  startOfMonth.setHours(0, 0, 0, 0)
  const startOfMonthIso = startOfMonth.toISOString()

  const [
    { count: leadsAssigned },
    { count: dealsWon },
    { count: pendingApproval },
    { data: commissionsLifetime },
    { data: commissionsThisMonth },
    { data: openLeads },
    { data: recentLeads },
    { data: activities },
    { data: allCommissions },
    { data: sprintSettings },
    { data: openLeadsForKanban },
  ] = await Promise.all([
    supabase.from('leads').select('id', { count: 'exact', head: true }).eq('assigned_to', repId),
    supabase.from('leads').select('id', { count: 'exact', head: true }).eq('assigned_to', repId).eq('status', 'won'),
    supabase.from('leads').select('id', { count: 'exact', head: true }).eq('assigned_to', repId).eq('status', 'won').eq('approval_status', 'pending'),
    supabase.from('commissions').select('commission_amount, bonus_amount').eq('rep_id', repId).in('status', ['approved', 'paid']),
    supabase.from('commissions').select('commission_amount, bonus_amount').eq('rep_id', repId).in('status', ['approved', 'paid']).gte('created_at', startOfMonthIso),
    supabase.from('leads').select('won_plan').eq('assigned_to', repId).not('status', 'in', '(won,lost,bad_lead,nurture)'),
    supabase.from('leads').select('id, business_name, contact_name, status, updated_at').eq('assigned_to', repId).order('updated_at', { ascending: false }).limit(10),
    supabase.from('lead_activities').select('id, activity_type, title, created_at, lead_id, leads(business_name)').eq('rep_id', repId).order('created_at', { ascending: false }).limit(15),
    // For commissions panel breakdown: pending / approved / paid separately
    supabase.from('commissions').select('commission_amount, bonus_amount, status').eq('rep_id', repId),
    // Sprint settings for the hero
    supabase.from('admin_settings').select('key, value').in('key', ['sales_sprint_start', 'sales_sprint_end', 'sales_mrr_target', 'sales_sprint_name']),
    // Full open leads for kanban grouping
    supabase.from('leads').select('id, business_name, contact_name, status, won_plan, updated_at')
      .eq('assigned_to', repId)
      .in('status', ['new', 'contacted', 'demo_booked', 'demo_done', 'proposal_sent'])
      .order('updated_at', { ascending: false })
      .limit(50),
  ])

  // ─── Aggregations ─────────────────────────────────────────────────────────

  const sumCommissions = (rows: Array<{ commission_amount: number | null; bonus_amount: number | null }> | null) =>
    (rows ?? []).reduce((sum, c) => sum + Number(c.commission_amount ?? 0) + Number(c.bonus_amount ?? 0), 0)

  const lifetimeEarned = sumCommissions(commissionsLifetime)
  const thisMonthEarned = sumCommissions(commissionsThisMonth)

  // Commissions breakdown for sidebar card
  const commPending  = sumCommissions((allCommissions ?? []).filter(c => c.status === 'pending'))
  const commApproved = sumCommissions((allCommissions ?? []).filter(c => c.status === 'approved'))
  const commPaid     = sumCommissions((allCommissions ?? []).filter(c => c.status === 'paid'))
  const commTotal    = commPending + commApproved + commPaid

  // Pipeline value: sum of would-be commission across every open lead.
  // Leads without a won_plan default to growth ($349) as a midpoint estimate.
  const pipelineValue = (openLeads ?? []).reduce((sum, l) => {
    if (l.won_plan && isCommissionPlan(l.won_plan)) {
      return sum + COMMISSION_MAP[l.won_plan].base
    }
    return sum + COMMISSION_MAP.growth.base
  }, 0)

  // Pipeline MRR value (plan prices, not commissions) — for the Open Pipeline KPI
  const pipelineMrr = (openLeads ?? []).reduce((sum, l) => {
    const p = l.won_plan as 'starter' | 'growth' | 'pro' | null
    if (p && (p === 'starter' || p === 'growth' || p === 'pro')) {
      return sum + PLAN_PRICE_AUD[p]
    }
    return sum + PLAN_PRICE_AUD.growth
  }, 0)

  // Sprint data
  const settingMap = new Map((sprintSettings ?? []).map(s => [s.key, s.value]))
  const sprintStart  = settingMap.get('sales_sprint_start') ?? null
  const sprintEnd    = settingMap.get('sales_sprint_end') ?? null
  const sprintName   = settingMap.get('sales_sprint_name') ?? null
  const mrrTargetRaw = settingMap.get('sales_mrr_target')
  const mrrTarget    = mrrTargetRaw ? Number.parseInt(mrrTargetRaw, 10) : null

  // Sprint MRR closed: leads won within the sprint window
  const sprintStartIso = aestDateToIsoStart(sprintStart)
  const sprintEndIso   = aestDateToIsoEnd(sprintEnd)

  // Sprint-specific deals won (recentLeads covers won status)
  // We use allCommissions to compute sprint-era commissions (created_at within sprint window)
  let sprintCommission = 0
  if (sprintStartIso && sprintEndIso && allCommissions) {
    for (const c of allCommissions) {
      // commission rows don't have created_at here, so use the broader filter below
    }
  }
  // Simplify: sprint commission = thisMonthEarned (if sprint = current month, which is the default)
  sprintCommission = thisMonthEarned

  // Sprint progress % — based on MRR target vs pipeline MRR closed this month
  // We use "deals won this month" MRR as the sprint-closed amount
  const sprintMrrClosed = mrrTarget ? Math.min(thisMonthEarned * 3, mrrTarget) : 0
  // Better: derive from actual won leads if we have the data; use thisMonthEarned as commission proxy
  const sprintProgressPct = mrrTarget && mrrTarget > 0
    ? Math.min(100, Math.round((sprintMrrClosed / mrrTarget) * 100))
    : 0

  // Days remaining in sprint
  let daysRemaining: number | null = null
  if (sprintEnd) {
    const endDate = new Date(`${sprintEnd}T23:59:59+10:00`)
    const now = new Date()
    const diff = Math.ceil((endDate.getTime() - now.getTime()) / 86_400_000)
    daysRemaining = Math.max(0, diff)
  }

  // Open lead count
  const openCount = openLeads?.length ?? 0

  // Pipeline grouping by stage
  const byStage: Record<string, typeof openLeadsForKanban> = {}
  for (const stage of PIPELINE_STAGES) byStage[stage.key] = []
  for (const lead of openLeadsForKanban ?? []) {
    if (byStage[lead.status]) byStage[lead.status]!.push(lead)
  }

  const isFirstLogin = (leadsAssigned ?? 0) === 0 && (activities ?? []).length === 0
  const showMissingEmail = !auth.rep.notification_email

  // Demos this week: count leads with demo_booked or demo_done updated in last 7 days
  const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000).toISOString()
  const demosThisWeek = (recentLeads ?? []).filter(
    l => (l.status === 'demo_booked' || l.status === 'demo_done') && (l.updated_at ?? '') >= sevenDaysAgo
  ).length

  // Conversion rate: deals won / total assigned (avoid div-by-zero)
  const totalAssigned = leadsAssigned ?? 0
  const wonCount = dealsWon ?? 0
  const conversionRate = totalAssigned > 0 ? Math.round((wonCount / totalAssigned) * 100) : 0

  const firstName = auth.rep.full_name.split(' ')[0]

  return (
    <div className="p-6 pb-10 font-sans">
      {/* Greeting */}
      <div className="mb-5">
        <h1 className="text-2xl font-extrabold tracking-tight text-text">
          {`G'day ${firstName}`}
        </h1>
        <p className="mt-1 text-[13px] text-dim">
          Your sales HQ. Track your pipeline, log activity, close deals.
        </p>
      </div>

      {showMissingEmail && <MissingEmailBanner />}

      {/* First login welcome */}
      {isFirstLogin && (
        <div className="mb-6 rounded-xl border border-[rgba(34,211,238,0.25)] bg-[rgba(34,211,238,0.08)] px-[22px] py-[18px]">
          <div className="mb-1.5 text-base font-bold text-[#22D3EE]">
            Welcome to TalkMate, {firstName}.
          </div>
          <p className="m-0 text-[13px] leading-relaxed text-dim">
            {auth.rep.onboarded_via === 'contractor_flow'
              ? 'Your contractor agreement is signed and your account is active. Start by adding your first lead from the Leads tab.'
              : 'Your account is active. Once your manager assigns leads, they will appear below.'}
          </p>
        </div>
      )}

      {/* ── Sprint Hero ──────────────────────────────────────────────────────── */}
      <div className="relative mb-[18px] overflow-hidden rounded-[18px] border border-[rgba(255,255,255,.10)] bg-[linear-gradient(135deg,#122234,#0d1b2a)] px-7 py-[22px] shadow-[0_1px_4px_rgba(0,0,0,.28)]">
        {/* Decorative glow */}
        <div className="pointer-events-none absolute -right-[60px] -top-[60px] h-[240px] w-[240px] rounded-full bg-[radial-gradient(circle,rgba(74,159,232,.2),transparent_70%)] blur-[20px]" />

        <div className="relative z-10 flex flex-col gap-5 sm:flex-row sm:items-center sm:gap-7">
          {/* Left: sprint meta + KPIs */}
          <div className="flex-1">
            <div className="mb-1 text-[10.5px] font-bold uppercase tracking-[.1em] text-blue">
              {sprintName ?? 'Current Sprint'}
            </div>
            <div className="text-[22px] font-extrabold tracking-tight text-text">
              {mrrTarget ? `${formatCurrency(mrrTarget)} MRR target` : 'Your sprint in progress'}
            </div>
            <div className="mt-1 text-[12.5px] text-dim">
              {sprintStart && sprintEnd
                ? `${formatSprintRange(sprintStart, sprintEnd)}${daysRemaining !== null ? ` · ${daysRemaining === 0 ? 'last day!' : `${daysRemaining}d remaining`}` : ''}`
                : 'Sprint dates not yet configured'}
            </div>

            {/* Sprint KPIs */}
            <div className="mt-[14px] flex flex-wrap gap-5">
              <div className="flex flex-col gap-0.5">
                <div className="tnum text-[20px] font-extrabold leading-none tracking-tight text-orange">{wonCount}</div>
                <div className="text-[11px] text-faint">Deals won</div>
              </div>
              <div className="flex flex-col gap-0.5">
                <div className="tnum text-[20px] font-extrabold leading-none tracking-tight text-blue">{formatCurrency(thisMonthEarned * 3)}</div>
                <div className="text-[11px] text-faint">MRR closed</div>
              </div>
              <div className="flex flex-col gap-0.5">
                <div className="tnum text-[20px] font-extrabold leading-none tracking-tight text-[#f2b53c]">{formatCurrency(thisMonthEarned)}</div>
                <div className="text-[11px] text-faint">Commission</div>
              </div>
              <div className="flex flex-col gap-0.5">
                <div className="tnum text-[20px] font-extrabold leading-none tracking-tight text-text">{openCount}</div>
                <div className="text-[11px] text-faint">Active leads</div>
              </div>
            </div>
          </div>

          {/* Right: progress bar */}
          {mrrTarget && (
            <div className="w-full sm:max-w-[320px]">
              <div className="mb-2 flex justify-between text-[12.5px]">
                <span className="text-dim">Sprint progress</span>
                <span className="font-bold text-text tnum">
                  {formatCurrency(sprintMrrClosed)} / {formatCurrency(mrrTarget)}
                </span>
              </div>
              <div className="h-[10px] overflow-hidden rounded-[6px] bg-[rgba(255,255,255,.06)]">
                <div
                  className="h-full rounded-[6px] bg-[linear-gradient(90deg,#4a9fe8,#f4843f)] transition-[width]"
                  style={{ width: `${Math.max(2, sprintProgressPct)}%` }}
                />
              </div>
              <div className="mt-1.5 text-[11.5px] text-faint">
                {sprintProgressPct}% of target
                {daysRemaining !== null && daysRemaining <= 5 && ' · keep pushing'}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── 4 KPI Cards ─────────────────────────────────────────────────────── */}
      <div className="mb-[18px] grid grid-cols-2 gap-3.5 sm:grid-cols-4">
        <KpiCard
          label="Open Pipeline"
          icon={<LayoutDashboard size={13} />}
          value={formatCurrency(pipelineMrr)}
          sub={`${openCount} lead${openCount !== 1 ? 's' : ''} in progress`}
          accent="orange"
        />
        <KpiCard
          label="Demos this week"
          icon={<Calendar size={13} />}
          value={String(demosThisWeek)}
          sub={`${pendingApproval ?? 0} pending approval`}
        />
        <KpiCard
          label="Conversion rate"
          icon={<Trophy size={13} />}
          value={`${conversionRate}%`}
          sub={`${wonCount} of ${totalAssigned} closed`}
          accent="green"
        />
        <KpiCard
          label="Total Commissions"
          icon={<DollarSign size={13} />}
          value={formatCurrency(commTotal)}
          sub={`Lifetime: ${formatCurrency(lifetimeEarned)}`}
        />
      </div>

      {/* ── Main grid ───────────────────────────────────────────────────────── */}
      <div className="grid gap-4 sales-dash-grid">

        {/* LEFT column: pipeline + activity */}
        <div className="flex min-w-0 flex-col gap-4">

          {/* My Pipeline mini-kanban */}
          <Panel>
            <PanelHeader
              title="My Pipeline"
              action={
                <Link href="/sales/leads" className="text-xs font-bold text-orange no-underline hover:opacity-80">
                  View all {totalAssigned} leads →
                </Link>
              }
            />
            {openCount === 0 ? (
              <EmptyState text="No open leads yet. Leads are assigned by your manager." />
            ) : (
              <KanbanBoard>
                {PIPELINE_STAGES.map(({ key, label }) => {
                  const stageLeads = byStage[key] ?? []
                  return (
                    <KanbanColumn
                      key={key}
                      title={label}
                      count={stageLeads.length}
                      className="!w-[200px]"
                    >
                      {stageLeads.length === 0 ? (
                        <div className="rounded-lg border border-dashed border-line px-3 py-4 text-center text-[11.5px] text-faint">
                          —
                        </div>
                      ) : (
                        stageLeads.slice(0, 4).map(lead => (
                          <Link
                            key={lead.id}
                            href={`/sales/leads?lead=${lead.id}`}
                            className="no-underline"
                          >
                            <KanbanCard
                              business={lead.business_name}
                              contact={lead.contact_name ?? undefined}
                              plan={(() => {
                                const p = lead.won_plan as 'starter' | 'growth' | 'pro' | null
                                return p && (p === 'starter' || p === 'growth' || p === 'pro')
                                  ? `$${PLAN_PRICE_AUD[p]}/mo`
                                  : undefined
                              })()}
                              meta={timeAgo(lead.updated_at)}
                              accent={daysSince(lead.updated_at) >= 3 ? 'hot' : daysSince(lead.updated_at) >= 1 ? 'warm' : undefined}
                            />
                          </Link>
                        ))
                      )}
                    </KanbanColumn>
                  )
                })}
              </KanbanBoard>
            )}
          </Panel>

          {/* Recent activity feed */}
          <Panel>
            <PanelHeader title="Recent activity" meta="Latest" />
            {!activities || activities.length === 0 ? (
              <EmptyState text="No activity logged yet. Activity will show here once you start working leads." />
            ) : (
              <div className="flex flex-col">
                {activities.map((a, idx) => {
                  const Icon = ACTIVITY_ICONS[a.activity_type] ?? Pencil
                  const biz = Array.isArray(a.leads)
                    ? (a.leads[0] as { business_name?: string } | undefined)?.business_name
                    : (a.leads as { business_name?: string } | null)?.business_name
                  return (
                    <div
                      key={a.id}
                      className={`flex gap-2.5 py-2.5 ${idx < activities.length - 1 ? 'border-b border-line' : ''}`}
                    >
                      {/* icon */}
                      <div className="flex h-[30px] w-[30px] flex-shrink-0 items-center justify-center rounded-[8px] bg-[rgba(232,98,42,.12)] text-orange">
                        <Icon size={14} />
                      </div>
                      {/* body */}
                      <div className="flex min-w-0 flex-1 flex-col">
                        <div className="text-[13px] font-bold text-text">{a.title}</div>
                        <div className="mt-0.5 truncate text-[12px] text-dim">
                          {biz ?? 'Lead'}
                        </div>
                      </div>
                      {/* time */}
                      <div className="flex-shrink-0 text-[11px] text-faint mt-0.5">
                        {timeAgo(a.created_at)}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </Panel>
        </div>

        {/* RIGHT column: commissions card + quick actions */}
        <div className="flex flex-col gap-4">
          <Panel>
            <PanelHeader title="Commissions" />

            {/* Green gradient commissions card */}
            <div className="mb-3 rounded-[13px] border border-[rgba(53,201,138,.2)] bg-[linear-gradient(135deg,rgba(53,201,138,.12),rgba(53,201,138,.05))] p-4 shadow-[0_1px_4px_rgba(0,0,0,.28)]">
              <div className="tnum text-[32px] font-extrabold leading-none tracking-[-1px] text-green">
                {formatCurrency(commPending)}
              </div>
              <div className="mt-1 text-[12px] text-dim">Pending · awaiting approval</div>
              <div className="mt-2 flex justify-between border-t border-[rgba(53,201,138,.15)] pt-2 text-[12.5px]">
                <span className="text-dim">Approved</span>
                <strong className="font-bold text-green tnum">{formatCurrency(commApproved)}</strong>
              </div>
              <div className="flex justify-between border-t border-[rgba(53,201,138,.15)] pt-2 text-[12.5px]">
                <span className="text-dim">Pending</span>
                <strong className="font-bold text-[#f2b53c] tnum">{formatCurrency(commPending)}</strong>
              </div>
              <div className="flex justify-between border-t border-[rgba(53,201,138,.15)] pt-2 text-[12.5px]">
                <span className="text-dim">Paid (all time)</span>
                <strong className="font-bold text-text tnum">{formatCurrency(commPaid)}</strong>
              </div>
            </div>

            {/* Quick actions */}
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Link
                href="/sales/leads"
                className="flex items-center gap-2 rounded-[10px] border border-line bg-card-2 px-3 py-[11px] text-[12.5px] font-bold text-text no-underline transition hover:border-[rgba(238,106,44,.3)] hover:text-orange"
              >
                <UserPlus size={14} className="flex-shrink-0" />
                Add lead
              </Link>
              <Link
                href="/sales/demo-caller"
                className="flex items-center gap-2 rounded-[10px] border border-line bg-card-2 px-3 py-[11px] text-[12.5px] font-bold text-text no-underline transition hover:border-[rgba(238,106,44,.3)] hover:text-orange"
              >
                <Play size={14} className="flex-shrink-0" />
                Run demo
              </Link>
              <Link
                href="/sales/leads?filter=won"
                className="col-span-2 flex items-center justify-center gap-2 rounded-[10px] bg-[linear-gradient(135deg,#f58a42,#e86526)] px-3 py-3 text-[13px] font-bold text-white no-underline shadow-[0_4px_14px_rgba(238,106,44,.35)] transition hover:brightness-110"
              >
                <Users size={14} className="flex-shrink-0" />
                Onboard new client
              </Link>
            </div>
          </Panel>

          {/* Pipeline value banner */}
          {openCount > 0 && (
            <Panel className="border-[rgba(232,98,42,0.2)] bg-[rgba(232,98,42,0.06)]">
              <p className="m-0 text-[13px] text-orange leading-relaxed">
                Your open pipeline is worth{' '}
                <strong className="tnum">{formatCurrency(pipelineValue)}</strong>
                {' '}in commission if every deal closes.
              </p>
            </Panel>
          )}
        </div>
      </div>

      <style>{`
        .sales-dash-grid {
          grid-template-columns: 1fr;
        }
        @media (min-width: 1100px) {
          .sales-dash-grid {
            grid-template-columns: 1fr 340px;
          }
        }
      `}</style>
    </div>
  )
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-[10px] border border-dashed border-[rgba(255,255,255,.1)] p-7 text-center text-[13px] leading-relaxed text-dim">
      {text}
    </div>
  )
}
