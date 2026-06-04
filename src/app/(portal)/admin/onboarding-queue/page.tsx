import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireAdmin } from '@/lib/admin-auth'
import { createAdminClient } from '@/lib/supabase/server'
import { fetchReadinessByBusiness } from '@/lib/onboarding-admin'
import { ClipboardList } from 'lucide-react'
import OnboardingQueueClient from '@/components/admin/OnboardingQueueClient'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Onboarding Queue — TalkMate Admin' }

export default async function OnboardingQueuePage() {
  const auth = await requireAdmin()
  if (!auth.ok) redirect('/login')

  const admin = createAdminClient()

  const { data: pendingLeads } = await admin
    .from('leads')
    .select(`
      id, business_name, contact_name, phone, email, industry, suburb, state,
      website, notes, won_plan, won_billing_cycle, won_at, assigned_to,
      payment_confirmed_at, stripe_payment_link, stripe_payment_link_created_at,
      sales_reps:assigned_to(full_name, email, phone)
    `)
    .eq('status', 'won')
    .is('business_id', null)
    .order('won_at', { ascending: true })

  const { data: pendingBusinesses } = await admin
    .from('businesses')
    .select(`
      id, name, phone_number, email, industry, plan, account_status,
      payment_confirmed_at, onboarding_started_at, welcome_email_sent, created_at, sales_rep_id,
      sales_reps:sales_rep_id(full_name, email, phone)
    `)
    .in('account_status', ['pending', 'pending_payment'])
    .eq('onboarded_by', 'sales_rep')
    .eq('is_demo', false)
    .order('created_at', { ascending: true })

  if ((pendingLeads?.length ?? 0) === 0 && (pendingBusinesses?.length ?? 0) === 0) {
    return (
      <div style={{ padding: '32px 28px', fontFamily: 'Outfit, sans-serif' }}>
        <Header />
        <div style={{
          padding: 40, textAlign: 'center', borderRadius: 14,
          background: '#0A1E38', border: '1px solid rgba(255,255,255,0.06)',
          color: '#7BAED4', fontSize: 14,
        }}>
          No clients pending onboarding. When a rep closes a deal, it will appear here.
        </div>
      </div>
    )
  }

  // Session 4A — go-live readiness percent for the in-progress businesses,
  // batched in one query (no per-row fetch). Pending leads have no business
  // row yet so they surface as "Not started".
  const readinessByBusiness = await fetchReadinessByBusiness(
    admin,
    (pendingBusinesses ?? []).map(b => String((b as { id: string }).id)),
  )
  const readinessPercent: Record<string, number | null> = {}
  for (const [bid, summary] of Object.entries(readinessByBusiness)) {
    readinessPercent[bid] = summary.completionPercent
  }

  return (
    <div style={{ padding: '32px 28px', fontFamily: 'Outfit, sans-serif' }}>
      <Header />
      <OnboardingQueueClient
        pendingLeads={(pendingLeads ?? []).map(normaliseLead)}
        pendingBusinesses={(pendingBusinesses ?? []).map(normaliseBusiness)}
        readinessPercent={readinessPercent}
        adminEmail={auth.user.email ?? 'admin'}
      />
    </div>
  )
}

function Header() {
  return (
    <div style={{ marginBottom: 22, display: 'flex', alignItems: 'center', gap: 12 }}>
      <div style={{
        width: 40, height: 40, borderRadius: 10,
        background: 'rgba(232,98,42,0.15)', color: '#E8622A',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <ClipboardList size={18} />
      </div>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0, color: 'white', letterSpacing: '-0.5px' }}>
          Onboarding Queue
        </h1>
        <p style={{ fontSize: 13, color: '#7BAED4', margin: 0, marginTop: 2 }}>
          Closed deals waiting for setup. Promote leads, finish go-live, and approve commissions here.
        </p>
        <p style={{ marginTop: 8, fontSize: 12 }}>
          <Link href="/admin/clients" style={{ color: '#4A9FE8', textDecoration: 'none' }}>
            Back to all clients →
          </Link>
        </p>
      </div>
    </div>
  )
}

interface SalesRepInfo {
  full_name: string
  email: string
  phone: string | null
}

function normaliseLead(l: Record<string, unknown>) {
  const rep = Array.isArray(l.sales_reps) ? (l.sales_reps[0] as SalesRepInfo | undefined) : (l.sales_reps as SalesRepInfo | null)
  return {
    id: String(l.id),
    business_name: String(l.business_name ?? ''),
    contact_name: (l.contact_name as string | null) ?? null,
    phone: (l.phone as string | null) ?? null,
    email: (l.email as string | null) ?? null,
    industry: (l.industry as string | null) ?? null,
    suburb: (l.suburb as string | null) ?? null,
    state: (l.state as string | null) ?? null,
    website: (l.website as string | null) ?? null,
    notes: (l.notes as string | null) ?? null,
    won_plan: (l.won_plan as string | null) ?? null,
    won_billing_cycle: (l.won_billing_cycle as string | null) ?? null,
    won_at: (l.won_at as string | null) ?? null,
    payment_confirmed_at: (l.payment_confirmed_at as string | null) ?? null,
    stripe_payment_link: (l.stripe_payment_link as string | null) ?? null,
    stripe_payment_link_created_at: (l.stripe_payment_link_created_at as string | null) ?? null,
    rep_name: rep?.full_name ?? null,
    rep_email: rep?.email ?? null,
    rep_phone: rep?.phone ?? null,
  }
}

function normaliseBusiness(b: Record<string, unknown>) {
  const rep = Array.isArray(b.sales_reps) ? (b.sales_reps[0] as SalesRepInfo | undefined) : (b.sales_reps as SalesRepInfo | null)
  return {
    id: String(b.id),
    business_name: String(b.name ?? ''),
    phone_number: (b.phone_number as string | null) ?? null,
    email: (b.email as string | null) ?? null,
    industry: (b.industry as string | null) ?? null,
    plan: (b.plan as string | null) ?? null,
    account_status: String(b.account_status ?? ''),
    payment_confirmed_at: (b.payment_confirmed_at as string | null) ?? null,
    onboarding_started_at: (b.onboarding_started_at as string | null) ?? null,
    welcome_email_sent: Boolean(b.welcome_email_sent),
    created_at: (b.created_at as string | null) ?? null,
    rep_name: rep?.full_name ?? null,
    rep_email: rep?.email ?? null,
    rep_phone: rep?.phone ?? null,
  }
}
