import { createClient } from '@/lib/supabase/server'
import { requireSalesRep } from '@/lib/sales-auth'
import { redirect } from 'next/navigation'
import ProfileForm from '@/components/sales/profile-form'
import { formatDateTime } from '@/lib/sales-format'
import Link from 'next/link'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Profile — TalkMate Sales HQ' }

export default async function SalesProfilePage() {
  const auth = await requireSalesRep()
  if (!auth.ok) redirect('/')

  const supabase = await createClient()
  const { data: team } = auth.rep.team_id
    ? await supabase.from('sales_teams').select('name').eq('id', auth.rep.team_id).maybeSingle()
    : { data: null as null }

  return (
    <div style={{ padding: '24px 24px 40px', fontFamily: 'Outfit, sans-serif', maxWidth: 720 }}>
      <div style={{ marginBottom: 22 }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0, letterSpacing: '-0.5px' }}>Profile</h1>
        <p style={{ fontSize: 13, color: '#7BAED4', margin: 0, marginTop: 4 }}>
          Your sales rep account. Name and email are managed by admin.
        </p>
      </div>

      <ProfileForm initialPhone={auth.rep.phone ?? ''} />

      <div style={{
        marginTop: 22, background: '#0A1E38',
        border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: 22,
      }}>
        <h2 style={{ fontSize: 14, fontWeight: 700, color: 'white', margin: 0, marginBottom: 14 }}>Account details</h2>
        <Row label="Full name" value={auth.rep.full_name} />
        <Row label="Email" value={auth.rep.email} />
        <Row label="Team" value={team?.name ?? '—'} />
        <Row label="Status" value={<StatusBadge status={auth.rep.status} />} />
        <Row label="Commission policy" value={`Version ${auth.rep.commission_policy_version}`} />
        <Row label="Policy acknowledged" value={formatDateTime(auth.rep.policy_acknowledged_at)} />
        <Row label="Contract signed" value={formatDateTime(auth.rep.contract_signed_at)} last />
      </div>

      <div style={{
        marginTop: 16, padding: '14px 18px', borderRadius: 10,
        background: '#0A1E38', border: '1px solid rgba(255,255,255,0.06)',
        fontSize: 13, color: '#7BAED4',
      }}>
        Need to change your password?{' '}
        <Link href="/forgot-password" style={{ color: '#E8622A', fontWeight: 700, textDecoration: 'none' }}>
          Reset it here →
        </Link>
      </div>
    </div>
  )
}

function Row({ label, value, last }: { label: string; value: React.ReactNode; last?: boolean }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12,
      padding: '10px 0',
      borderBottom: last ? 'none' : '1px solid rgba(255,255,255,0.05)',
    }}>
      <span style={{ fontSize: 12, color: '#7BAED4', fontWeight: 600 }}>{label}</span>
      <span style={{ fontSize: 13, color: 'white', fontWeight: 600, textAlign: 'right' }}>{value}</span>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const isActive = status === 'active'
  return (
    <span style={{
      display: 'inline-block', padding: '3px 10px', borderRadius: 99,
      background: isActive ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.12)',
      color: isActive ? '#22c55e' : '#ef4444',
      border: `1px solid ${isActive ? 'rgba(34,197,94,0.35)' : 'rgba(239,68,68,0.3)'}`,
      fontSize: 11, fontWeight: 700, textTransform: 'capitalize',
    }}>{status}</span>
  )
}
