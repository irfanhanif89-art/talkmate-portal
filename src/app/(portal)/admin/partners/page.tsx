import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import AdminPartnersClient from './admin-partners-client'

export const metadata: Metadata = { title: 'Partners' }
export const dynamic = 'force-dynamic'

interface PartnerRow {
  id: string
  name: string
  partner_tier: string | null
  partner_commission_rate: number | null
  referred_count: number
  referred_mrr: number
  has_white_label: boolean
}

export default async function AdminPartnersPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: userProfile } = await supabase.from('users').select('role').eq('id', user.id).single()
  const isSuperAdmin = user.email === process.env.INTERNAL_ALERT_EMAIL || user.email === 'hello@talkmate.com.au'
  if (userProfile?.role !== 'admin' && !isSuperAdmin) redirect('/dashboard')

  const admin = createAdminClient()

  const { data: partners } = await admin
    .from('businesses')
    .select('id, name, partner_tier, partner_commission_rate')
    .eq('is_partner', true)
    .order('name', { ascending: true })

  const partnerIds = (partners ?? []).map(p => p.id)

  // Pull every business that was referred by one of the partners + their plans
  // so we can compute MRR attribution.
  let referrals: Array<{ id: string; referred_by: string | null; plan: string | null }> = []
  if (partnerIds.length > 0) {
    const { data } = await admin
      .from('businesses')
      .select('id, referred_by, plan')
      .in('referred_by', partnerIds)
    referrals = data ?? []
  }

  // Active subs for those referrals — that's the MRR.
  const referredIds = referrals.map(r => r.id)
  let activeSubs: Array<{ business_id: string; plan: string; status: string }> = []
  if (referredIds.length > 0) {
    const { data } = await admin
      .from('subscriptions')
      .select('business_id, plan, status')
      .in('business_id', referredIds)
    activeSubs = data ?? []
  }

  const subByBusiness = new Map<string, { plan: string; status: string }>()
  for (const s of activeSubs) subByBusiness.set(s.business_id, { plan: s.plan, status: s.status })

  function planMrr(plan: string | null) {
    if (plan === 'pro' || plan === 'professional') return 799
    if (plan === 'growth') return 499
    if (plan === 'starter') return 299
    return 0
  }

  // Group referrals by partner.
  const counts = new Map<string, { count: number; mrr: number }>()
  for (const r of referrals) {
    if (!r.referred_by) continue
    const sub = subByBusiness.get(r.id)
    const isActive = sub && sub.status === 'active'
    const acc = counts.get(r.referred_by) ?? { count: 0, mrr: 0 }
    if (isActive) {
      acc.count++
      acc.mrr += planMrr(sub.plan ?? r.plan)
    }
    counts.set(r.referred_by, acc)
  }

  // White-label flag.
  const { data: configs } = await admin
    .from('white_label_configs')
    .select('partner_id')
    .in('partner_id', partnerIds.length > 0 ? partnerIds : ['__none__'])
  const configPartners = new Set((configs ?? []).map(c => c.partner_id as string))

  const rows: PartnerRow[] = (partners ?? []).map(p => {
    const stats = counts.get(p.id) ?? { count: 0, mrr: 0 }
    return {
      id: p.id,
      name: p.name,
      partner_tier: p.partner_tier ?? null,
      partner_commission_rate: p.partner_commission_rate ?? null,
      referred_count: stats.count,
      referred_mrr: stats.mrr,
      has_white_label: configPartners.has(p.id),
    }
  })

  return (
    <div style={{ padding: 28, maxWidth: 1200, margin: '0 auto', color: '#F2F6FB' }}>
      <Link href="/admin" style={{ fontSize: 13, color: '#7BAED4', textDecoration: 'none' }}>← Admin</Link>
      <h1 style={{ fontSize: '1.6rem', fontWeight: 800, color: 'white', marginTop: 8, marginBottom: 16 }}>
        Partner management
      </h1>
      <p style={{ fontSize: 14, color: '#7BAED4', marginBottom: 22, lineHeight: 1.6 }}>
        All TalkMate businesses with <code style={{ color: '#E8622A' }}>is_partner = true</code>. Edit tier or
        commission rate inline; jump to white-label config from the action column.
      </p>

      <AdminPartnersClient initialRows={rows} />
    </div>
  )
}
