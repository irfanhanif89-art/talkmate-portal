import { createClient, createAdminClient } from '@/lib/supabase/server'
import { requireSalesRep } from '@/lib/sales-auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import {
  LayoutDashboard, Trophy, Clock4, DollarSign, Users2,
  Phone, Mail, Calendar, FileText, Pencil, ArrowRightLeft, Wrench,
} from 'lucide-react'
import { formatCurrency, LEAD_STATUS_STYLES, type LeadStatus, daysSince, timeAgo } from '@/lib/sales-format'
import { COMMISSION_MAP, isCommissionPlan } from '@/lib/commission'
import { PLAN_PRICE_AUD, isAdminPlan } from '@/lib/admin-auth'
import MissingEmailBanner from '@/components/sales/MissingEmailBanner'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Dashboard — TalkMate Sales HQ' }

const ACTIVITY_ICONS: Record<string, React.ComponentType<{ size?: number }>> = {
  call: Phone, email: Mail, demo: Calendar, proposal: FileText,
  note: Pencil, status_change: ArrowRightLeft, system: Wrench, approval: Trophy,
}

export default async function SalesDashboardPage() {
  const auth = await requireSalesRep()
  if (!auth.ok) redirect('/')

  const supabase = await createClient()
  const admin = createAdminClient()
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
    activeClientsAgg,
  ] = await Promise.all([
    supabase.from('leads').select('id', { count: 'exact', head: true }).eq('assigned_to', repId),
    supabase.from('leads').select('id', { count: 'exact', head: true }).eq('assigned_to', repId).eq('status', 'won'),
    supabase.from('leads').select('id', { count: 'exact', head: true }).eq('assigned_to', repId).eq('status', 'won').eq('approval_status', 'pending'),
    supabase.from('commissions').select('commission_amount, bonus_amount').eq('rep_id', repId).in('status', ['approved', 'paid']),
    supabase.from('commissions').select('commission_amount, bonus_amount').eq('rep_id', repId).in('status', ['approved', 'paid']).gte('created_at', startOfMonthIso),
    supabase.from('leads').select('won_plan').eq('assigned_to', repId).not('status', 'in', '(won,lost,bad_lead,nurture)'),
    supabase.from('leads').select('id, business_name, contact_name, status, updated_at').eq('assigned_to', repId).order('updated_at', { ascending: false }).limit(10),
    supabase.from('lead_activities').select('id, activity_type, title, created_at, lead_id, leads(business_name)').eq('rep_id', repId).order('created_at', { ascending: false }).limit(15),
    admin.from('businesses').select('plan').eq('account_status', 'active'),
  ])

  const sumCommissions = (rows: Array<{ commission_amount: number | null; bonus_amount: number | null }> | null) =>
    (rows ?? []).reduce((sum, c) => sum + Number(c.commission_amount ?? 0) + Number(c.bonus_amount ?? 0), 0)

  const lifetimeEarned = sumCommissions(commissionsLifetime)
  const thisMonthEarned = sumCommissions(commissionsThisMonth)

  // Pipeline value: sum of would-be commission across every open lead.
  // Leads without a won_plan default to growth ($349) as a midpoint estimate
  // so the banner still shows a meaningful number even pre-quote.
  const pipelineValue = (openLeads ?? []).reduce((sum, l) => {
    if (l.won_plan && isCommissionPlan(l.won_plan)) {
      return sum + COMMISSION_MAP[l.won_plan].base
    }
    return sum + COMMISSION_MAP.growth.base
  }, 0)

  let liveClients = 0
  let platformMrr = 0
  for (const r of (activeClientsAgg?.data ?? [])) {
    liveClients += 1
    if (isAdminPlan(r.plan)) platformMrr += PLAN_PRICE_AUD[r.plan]
  }

  const isFirstLogin = (leadsAssigned ?? 0) === 0 && (activities ?? []).length === 0
  const showMissingEmail = !auth.rep.notification_email

  return (
    <div style={{ padding: '24px 24px 40px', fontFamily: 'Outfit, sans-serif' }}>
      <PageHeading
        title={`G'day ${auth.rep.full_name.split(' ')[0]}`}
        sub="Your sales HQ. Track your pipeline, log activity, close deals."
      />

      {showMissingEmail && <MissingEmailBanner />}

      {isFirstLogin && (
        <div style={{
          padding: '18px 22px', marginBottom: 24, borderRadius: 12,
          background: 'rgba(34,211,238,0.08)', border: '1px solid rgba(34,211,238,0.25)',
        }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#22D3EE', marginBottom: 6 }}>
            Welcome to TalkMate, {auth.rep.full_name.split(' ')[0]}.
          </div>
          <p style={{ fontSize: 13, color: '#7BAED4', margin: 0, lineHeight: 1.6 }}>
            {auth.rep.onboarded_via === 'contractor_flow'
              ? 'Your contractor agreement is signed and your account is active. Start by adding your first lead from the Leads tab.'
              : 'Your account is active. Once your manager assigns leads, they will appear below.'}
          </p>
        </div>
      )}

      {/* Pipeline value banner */}
      <div style={{
        padding: '14px 18px', marginBottom: 18, borderRadius: 10,
        background: 'rgba(232,98,42,0.06)',
        border: '1px solid rgba(232,98,42,0.2)',
        fontSize: 14, color: '#E8622A',
        fontFamily: 'Outfit, sans-serif',
      }}>
        {(openLeads?.length ?? 0) === 0
          ? 'No open deals yet. Add your first lead to get started.'
          : `Your open pipeline is worth ${formatCurrency(pipelineValue)} if every deal closes.`}
      </div>

      {/* Stat cards */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: 14, marginBottom: 28,
      }}>
        <StatCard icon={LayoutDashboard} label="Leads Assigned"      value={String(leadsAssigned ?? 0)} accent="#4A9FE8" />
        <StatCard icon={Trophy}          label="Deals Won"           value={String(dealsWon ?? 0)}     accent="#22c55e" />
        <StatCard icon={Clock4}          label="Pending Approval"    value={String(pendingApproval ?? 0)} accent="#f59e0b" />
        <StatCard
          icon={DollarSign}
          label="Commissions This Month"
          value={formatCurrency(thisMonthEarned)}
          sub={`Lifetime: ${formatCurrency(lifetimeEarned)}`}
          accent="#E8622A"
        />
        <StatCard
          icon={Users2}
          label="Live Clients"
          value={String(liveClients)}
          sub={`Platform MRR: ${formatCurrency(platformMrr)}`}
          accent="#22C55E"
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 24 }} className="sales-dashboard-grid">
        {/* Recent pipeline */}
        <Panel title="Recent pipeline" cta={{ label: 'View pipeline →', href: '/sales/leads' }}>
          {!recentLeads || recentLeads.length === 0 ? (
            <EmptyState text="No leads assigned yet. Leads are assigned by your manager. Check back soon." />
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ textAlign: 'left', color: '#4A7FBB', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    <th style={tdHead}>Business</th>
                    <th style={tdHead}>Contact</th>
                    <th style={tdHead}>Status</th>
                    <th style={tdHead}>Days since update</th>
                    <th style={tdHead}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {recentLeads.map(lead => {
                    const style = LEAD_STATUS_STYLES[(lead.status as LeadStatus) ?? 'new'] ?? LEAD_STATUS_STYLES.new
                    const days = daysSince(lead.updated_at)
                    const daysColor = days >= 3 ? '#ef4444' : days >= 2 ? '#f59e0b' : '#7BAED4'
                    return (
                      <tr key={lead.id} style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                        <td style={tdCell}><Link href={`/sales/leads?lead=${lead.id}`} style={{ color: 'white', textDecoration: 'none', fontWeight: 700 }}>{lead.business_name}</Link></td>
                        <td style={tdCell}><span style={{ color: '#7BAED4' }}>{lead.contact_name ?? '—'}</span></td>
                        <td style={tdCell}>
                          <span style={{
                            display: 'inline-block', padding: '3px 9px', borderRadius: 99,
                            background: style.bg, color: style.color, border: `1px solid ${style.border}`,
                            fontSize: 11, fontWeight: 700,
                          }}>{style.label}</span>
                        </td>
                        <td style={{ ...tdCell, color: daysColor, fontWeight: 600 }}>
                          {days === 0 ? 'today' : `${days}d`}
                        </td>
                        <td style={tdCell}>
                          <Link href={`/sales/leads?lead=${lead.id}`} style={{ color: '#E8622A', fontSize: 12, fontWeight: 700, textDecoration: 'none' }}>
                            Log Activity →
                          </Link>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        {/* Activity feed */}
        <Panel title="Recent activity">
          {!activities || activities.length === 0 ? (
            <EmptyState text="No activity logged yet. Activity will show here once you start working leads." />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {activities.map(a => {
                const Icon = ACTIVITY_ICONS[a.activity_type] ?? Pencil
                const biz = Array.isArray(a.leads) ? (a.leads[0] as { business_name?: string } | undefined)?.business_name : (a.leads as { business_name?: string } | null)?.business_name
                return (
                  <div key={a.id} style={{
                    display: 'flex', gap: 11, padding: 12, borderRadius: 9,
                    background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
                  }}>
                    <div style={{
                      width: 28, height: 28, borderRadius: 7, flexShrink: 0,
                      background: 'rgba(232,98,42,0.12)', color: '#E8622A',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <Icon size={14} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'white' }}>{a.title}</div>
                      <div style={{ fontSize: 12, color: '#4A7FBB', marginTop: 2 }}>
                        {biz ?? 'Lead'} · {timeAgo(a.created_at)}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </Panel>
      </div>

      <style>{`
        @media (min-width: 1100px) {
          .sales-dashboard-grid { grid-template-columns: 2fr 1fr !important; }
        }
      `}</style>
    </div>
  )
}

function PageHeading({ title, sub }: { title: string; sub: string }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <h1 style={{ fontSize: 26, fontWeight: 800, margin: 0, letterSpacing: '-0.5px' }}>{title}</h1>
      <p style={{ fontSize: 14, color: '#7BAED4', margin: 0, marginTop: 4 }}>{sub}</p>
    </div>
  )
}

function StatCard({ icon: Icon, label, value, sub, accent }: { icon: React.ComponentType<{ size?: number }>; label: string; value: string; sub?: string; accent: string }) {
  return (
    <div style={{
      padding: '18px 20px', borderRadius: 12,
      background: '#0A1E38', border: '1px solid rgba(255,255,255,0.06)',
    }}>
      <div style={{
        width: 32, height: 32, borderRadius: 8,
        background: `${accent}20`, color: accent,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        marginBottom: 12,
      }}>
        <Icon size={16} />
      </div>
      <div style={{ fontSize: 12, color: '#7BAED4', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
      <div style={{ fontSize: 26, color: 'white', fontWeight: 800, marginTop: 4, letterSpacing: '-0.5px' }}>{value}</div>
      {sub && (
        <div style={{ fontSize: 11, color: '#4A7FBB', fontWeight: 600, marginTop: 4 }}>{sub}</div>
      )}
    </div>
  )
}

function Panel({ title, children, cta }: { title: string; children: React.ReactNode; cta?: { label: string; href: string } }) {
  return (
    <div style={{
      background: '#0A1E38', border: '1px solid rgba(255,255,255,0.06)',
      borderRadius: 14, padding: 20,
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 14 }}>
        <h2 style={{ fontSize: 15, fontWeight: 700, color: 'white', margin: 0 }}>{title}</h2>
        {cta && <Link href={cta.href} style={{ fontSize: 13, color: '#E8622A', fontWeight: 600, textDecoration: 'none' }}>{cta.label}</Link>}
      </div>
      {children}
    </div>
  )
}

function EmptyState({ text }: { text: string }) {
  return (
    <div style={{
      padding: 28, borderRadius: 10, textAlign: 'center',
      border: '1px dashed rgba(255,255,255,0.1)',
      color: '#7BAED4', fontSize: 13, lineHeight: 1.6,
    }}>{text}</div>
  )
}

const tdHead: React.CSSProperties = { padding: '10px 8px', fontWeight: 700 }
const tdCell: React.CSSProperties = { padding: '12px 8px', verticalAlign: 'middle' }
