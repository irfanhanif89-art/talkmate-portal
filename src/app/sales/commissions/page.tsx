import { createClient } from '@/lib/supabase/server'
import { requireSalesRep } from '@/lib/sales-auth'
import { redirect } from 'next/navigation'
import CommissionsTable, { type CommissionRow } from '@/components/sales/commissions-table'
import { formatCurrency } from '@/lib/sales-format'

export const dynamic = 'force-dynamic'

export default async function SalesCommissionsPage() {
  const auth = await requireSalesRep()
  if (!auth.ok) redirect('/')

  const supabase = await createClient()
  const { data: commissions } = await supabase
    .from('commissions')
    .select(`
      id, plan, commission_amount, status, created_at, paid_at,
      payment_reference, revoke_reason,
      leads(business_name)
    `)
    .eq('rep_id', auth.rep.id)
    .order('created_at', { ascending: false })

  const rows: CommissionRow[] = (commissions ?? []).map(c => {
    const leadsField = c.leads as { business_name?: string } | Array<{ business_name?: string }> | null
    const business_name = Array.isArray(leadsField)
      ? leadsField[0]?.business_name ?? '—'
      : leadsField?.business_name ?? '—'
    return {
      id: c.id,
      business_name,
      plan: c.plan,
      amount: Number(c.commission_amount ?? 0),
      status: c.status as CommissionRow['status'],
      created_at: c.created_at,
      paid_at: c.paid_at,
      payment_reference: c.payment_reference,
      revoke_reason: c.revoke_reason,
    }
  })

  const totalEarned = rows.filter(r => r.status === 'approved' || r.status === 'paid').reduce((s, r) => s + r.amount, 0)
  const totalPending = rows.filter(r => r.status === 'pending').reduce((s, r) => s + r.amount, 0)
  const totalPaid = rows.filter(r => r.status === 'paid').reduce((s, r) => s + r.amount, 0)

  return (
    <div style={{ padding: '24px 24px 40px', fontFamily: 'Outfit, sans-serif' }}>
      <div style={{ marginBottom: 22 }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0, letterSpacing: '-0.5px' }}>Commissions</h1>
        <p style={{ fontSize: 13, color: '#7BAED4', margin: 0, marginTop: 4 }}>
          Every closed deal you've submitted, plus its approval and payment status.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14, marginBottom: 24 }}>
        <SummaryCard label="Total earned"   value={formatCurrency(totalEarned)}   accent="#E8622A" subtle="approved + paid" />
        <SummaryCard label="Pending approval" value={formatCurrency(totalPending)} accent="#f59e0b" subtle="awaiting admin" />
        <SummaryCard label="Total paid out" value={formatCurrency(totalPaid)}     accent="#22c55e" subtle="hit your account" />
      </div>

      <CommissionsTable rows={rows} repName={auth.rep.full_name} />
    </div>
  )
}

function SummaryCard({ label, value, accent, subtle }: { label: string; value: string; accent: string; subtle: string }) {
  return (
    <div style={{ padding: '18px 20px', borderRadius: 12, background: '#0A1E38', border: '1px solid rgba(255,255,255,0.06)' }}>
      <div style={{ fontSize: 11, color: '#7BAED4', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
      <div style={{ fontSize: 26, color: accent, fontWeight: 800, marginTop: 4, letterSpacing: '-0.5px' }}>{value}</div>
      <div style={{ fontSize: 11, color: '#4A7FBB', marginTop: 2 }}>{subtle}</div>
    </div>
  )
}
