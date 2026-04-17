import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function AdminPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: userProfile } = await supabase.from('users').select('role').eq('id', user.id).single()
  if (userProfile?.role !== 'admin') redirect('/dashboard')

  const adminClient = supabase // Use service role in production

  const { data: businesses } = await adminClient.from('businesses').select('id, name, business_type, plan, onboarding_completed, created_at').order('created_at', { ascending: false })
  const { data: subscriptions } = await adminClient.from('subscriptions').select('*')

  const totalMRR = subscriptions?.reduce((sum, s) => {
    if (s.status !== 'active') return sum
    return sum + (s.plan === 'growth' ? 499 : s.plan === 'starter' ? 299 : 0)
  }, 0) || 0

  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const newThisMonth = businesses?.filter(b => new Date(b.created_at) >= startOfMonth).length || 0

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <h1 className="text-2xl font-bold text-white mb-8">Admin</h1>

      {/* MRR Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {[
          { label: 'Total Clients', value: businesses?.length || 0 },
          { label: 'MRR (AUD)', value: `$${totalMRR.toLocaleString()}` },
          { label: 'New This Month', value: newThisMonth },
          { label: 'Active Subs', value: subscriptions?.filter(s => s.status === 'active').length || 0 },
        ].map(stat => (
          <div key={stat.label} className="p-5 rounded-xl border" style={{ background: '#0A1E38', borderColor: 'rgba(255,255,255,0.06)' }}>
            <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: '#4A7FBB' }}>{stat.label}</p>
            <p className="text-3xl font-bold text-white">{stat.value}</p>
          </div>
        ))}
      </div>

      {/* System Health */}
      <div className="p-5 rounded-xl border mb-8" style={{ background: '#0A1E38', borderColor: 'rgba(255,255,255,0.06)' }}>
        <h2 className="text-sm font-semibold text-white mb-4">System Health</h2>
        <div className="flex gap-4 flex-wrap">
          {[
            { name: 'Supabase', status: true },
            { name: 'Vapi', status: !!process.env.VAPI_API_KEY },
            { name: 'Stripe', status: !!process.env.STRIPE_SECRET_KEY },
            { name: 'Resend', status: !!process.env.RESEND_API_KEY },
          ].map(s => (
            <div key={s.name} className="flex items-center gap-2 px-3 py-2 rounded-lg" style={{ background: 'rgba(255,255,255,0.04)' }}>
              <div className="w-2 h-2 rounded-full" style={{ background: s.status ? '#22c55e' : '#ef4444' }} />
              <span className="text-sm text-white">{s.name}</span>
              <span className="text-xs" style={{ color: s.status ? '#22c55e' : '#ef4444' }}>{s.status ? 'OK' : 'Not configured'}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Businesses table */}
      <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
        <table className="w-full text-sm">
          <thead style={{ background: '#071829' }}>
            <tr>{['Business', 'Type', 'Plan', 'Setup', 'Since', 'MRR'].map(h => (
              <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: '#4A7FBB' }}>{h}</th>
            ))}</tr>
          </thead>
          <tbody>
            {(businesses || []).map((b, i) => {
              const sub = subscriptions?.find(s => s.business_id === b.id)
              const mrr = sub?.plan === 'growth' ? 499 : sub?.plan === 'starter' ? 299 : 0
              return (
                <tr key={b.id} className="border-t" style={{ background: i % 2 === 0 ? '#0A1E38' : '#071829', borderColor: 'rgba(255,255,255,0.04)' }}>
                  <td className="px-4 py-3 font-medium text-white">{b.name}</td>
                  <td className="px-4 py-3">
                    <span className="text-xs px-2 py-1 rounded-full" style={{ background: 'rgba(74,159,232,0.1)', color: '#4A9FE8' }}>{b.business_type}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs px-2 py-1 rounded-full capitalize" style={{ background: 'rgba(232,98,42,0.1)', color: '#E8622A' }}>{b.plan}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span style={{ color: b.onboarding_completed ? '#22c55e' : '#f59e0b' }}>{b.onboarding_completed ? '✅ Live' : '⏳ Setup'}</span>
                  </td>
                  <td className="px-4 py-3" style={{ color: '#4A7FBB' }}>{new Date(b.created_at).toLocaleDateString('en-AU')}</td>
                  <td className="px-4 py-3 font-semibold" style={{ color: mrr > 0 ? '#E8622A' : '#4A7FBB' }}>{mrr > 0 ? `$${mrr}` : '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
