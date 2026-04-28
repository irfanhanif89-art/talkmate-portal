import { createClient, createAdminClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function AdminPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Restrict access. Treat hello@talkmate.com.au as the super-admin per the brief.
  const { data: userProfile } = await supabase.from('users').select('role').eq('id', user.id).single()
  const isSuperAdmin = user.email === process.env.INTERNAL_ALERT_EMAIL || user.email === 'hello@talkmate.com.au'
  if (userProfile?.role !== 'admin' && !isSuperAdmin) redirect('/dashboard')

  const adminClient = createAdminClient()

  const { data: businesses } = await adminClient.from('businesses').select(`
    id, name, business_type, plan, onboarding_completed, agent_status, preview_number, created_at, signup_at, owner_user_id
  `).order('created_at', { ascending: false }).limit(100)

  const { data: subscriptions } = await adminClient.from('subscriptions').select('*')

  const { data: alerts } = await adminClient
    .from('system_alerts')
    .select('id, type, severity, message, business_id, sent_at, resolved')
    .eq('resolved', false)
    .order('sent_at', { ascending: false })
    .limit(20)

  const { data: vapiHealth } = await adminClient.from('vapi_health').select('*').eq('id', 1).single()

  const totalMRR = subscriptions?.reduce((sum, s) => {
    if (s.status !== 'active') return sum
    return sum + (s.plan === 'pro' || s.plan === 'professional' ? 799 : s.plan === 'growth' ? 499 : 299)
  }, 0) || 0

  const startOfMonth = new Date(); startOfMonth.setDate(1); startOfMonth.setHours(0, 0, 0, 0)
  const newThisMonth = businesses?.filter(b => new Date(b.created_at) >= startOfMonth).length || 0

  return (
    <div style={{ padding: 28, maxWidth: 1200, margin: '0 auto' }}>
      <h1 style={{ fontSize: '1.6rem', fontWeight: 800, color: 'white', marginBottom: 22 }}>Admin</h1>

      {/* MRR / Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, marginBottom: 22 }}>
        {[
          { label: 'Total Clients', value: businesses?.length || 0, color: '#4A9FE8' },
          { label: 'MRR', value: `$${totalMRR.toLocaleString()}`, color: '#E8622A' },
          { label: 'New This Month', value: newThisMonth, color: '#22C55E' },
          { label: 'Active Subs', value: subscriptions?.filter(s => s.status === 'active').length || 0, color: '#8B5CF6' },
        ].map(stat => (
          <div key={stat.label} style={{ padding: 18, borderRadius: 14, background: '#0A1E38', border: '1px solid rgba(255,255,255,0.07)', overflow: 'hidden' }}>
            <div style={{ height: 2, background: stat.color, marginBottom: 14, marginLeft: -18, marginRight: -18, marginTop: -18 }} />
            <p style={{ fontSize: 11, fontWeight: 700, color: '#4A7FBB', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>{stat.label}</p>
            <p style={{ fontSize: 28, fontWeight: 800, color: 'white', letterSpacing: '-1px' }}>{stat.value}</p>
          </div>
        ))}
      </div>

      {/* System health */}
      <div style={{ background: '#0A1E38', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: 20, marginBottom: 22 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'white', marginBottom: 14 }}>System health</div>
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
          {[
            { name: 'Supabase', ok: true, hint: 'connected' },
            { name: 'Vapi', ok: !!process.env.VAPI_API_KEY, hint: vapiHealth?.last_status ?? 'unknown' },
            { name: 'Stripe', ok: !!process.env.STRIPE_SECRET_KEY, hint: 'live mode' },
            { name: 'Resend', ok: !!process.env.RESEND_API_KEY, hint: 'email' },
            { name: 'Grok', ok: !!process.env.GROK_API_KEY, hint: 'command/menu' },
            { name: 'Make webhook', ok: !!process.env.MAKE_WEBHOOK_EMAIL_TRIGGER, hint: 'email triggers' },
          ].map(s => (
            <div key={s.name} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: 'rgba(255,255,255,0.04)', borderRadius: 8 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: s.ok ? '#22C55E' : '#EF4444' }} />
              <span style={{ fontSize: 13, color: 'white' }}>{s.name}</span>
              <span style={{ fontSize: 11, color: '#7BAED4' }}>{s.hint}</span>
            </div>
          ))}
        </div>
        <div style={{ fontSize: 11, color: '#7BAED4', marginTop: 12 }}>
          Vapi health: {vapiHealth?.fail_count ?? 0} consecutive fails · success streak {vapiHealth?.success_streak ?? 0} · last check {vapiHealth?.last_check ? new Date(vapiHealth.last_check).toLocaleString('en-AU') : 'never'}
        </div>
      </div>

      {/* Open SystemAlerts */}
      <div style={{ background: '#0A1E38', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, overflow: 'hidden', marginBottom: 22 }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'white' }}>Open system alerts</div>
          <span style={{ fontSize: 11, color: '#7BAED4' }}>{alerts?.length ?? 0} unresolved</span>
        </div>
        {(alerts?.length ?? 0) === 0 ? (
          <div style={{ padding: 18, fontSize: 13, color: '#22C55E' }}>✓ No open alerts</div>
        ) : (
          <div>
            {alerts!.map((a, i) => (
              <div key={a.id} style={{ padding: '12px 18px', borderBottom: i < alerts!.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none', display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'white' }}>{a.type.replace(/_/g, ' ')}</div>
                  <div style={{ fontSize: 12, color: '#7BAED4', marginTop: 3 }}>{a.message}</div>
                </div>
                <div style={{ flexShrink: 0, fontSize: 11, color: '#7BAED4', textAlign: 'right' }}>
                  <div>{a.severity}</div>
                  <div>{new Date(a.sent_at).toLocaleString('en-AU')}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Businesses table */}
      <div style={{ background: '#0A1E38', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, overflow: 'hidden' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid rgba(255,255,255,0.06)', fontSize: 13, fontWeight: 700, color: 'white' }}>All clients</div>
        <table style={{ width: '100%', borderCollapse: 'collapse' as const }}>
          <thead>
            <tr style={{ background: '#071829' }}>
              {['Business', 'Type', 'Plan', 'Setup', 'Since', 'MRR'].map(h => (
                <th key={h} style={{ textAlign: 'left' as const, padding: '10px 18px', fontSize: 11, fontWeight: 700, color: '#4A7FBB', textTransform: 'uppercase' as const, letterSpacing: '0.06em' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(businesses ?? []).map((b, i) => {
              const sub = subscriptions?.find(s => s.business_id === b.id)
              const mrr = sub?.plan === 'pro' || sub?.plan === 'professional' ? 799 : sub?.plan === 'growth' ? 499 : sub?.plan === 'starter' ? 299 : 0
              const agentStatus = (b as { agent_status?: string }).agent_status
              return (
                <tr key={b.id} style={{ borderTop: '1px solid rgba(255,255,255,0.04)', background: i % 2 === 0 ? '#0A1E38' : '#071829' }}>
                  <td style={{ padding: '12px 18px', fontSize: 13, fontWeight: 600, color: 'white' }}>{b.name}</td>
                  <td style={{ padding: '12px 18px', fontSize: 12 }}>
                    <span style={{ fontSize: 11, padding: '3px 9px', borderRadius: 99, background: 'rgba(74,159,232,0.12)', color: '#4A9FE8' }}>{b.business_type}</span>
                  </td>
                  <td style={{ padding: '12px 18px', fontSize: 12 }}>
                    <span style={{ fontSize: 11, padding: '3px 9px', borderRadius: 99, background: 'rgba(232,98,42,0.12)', color: '#E8622A', textTransform: 'capitalize' as const }}>{b.plan}</span>
                  </td>
                  <td style={{ padding: '12px 18px', fontSize: 12 }}>
                    {agentStatus === 'pending_review' ? (
                      <a href={`/admin/approve?businessId=${b.id}`} style={{ background: '#E8622A', color: 'white', fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 6, textDecoration: 'none' }}>🎙️ Review →</a>
                    ) : (
                      <span style={{ color: agentStatus === 'live' ? '#22C55E' : b.onboarding_completed ? '#22C55E' : '#F59E0B' }}>
                        {agentStatus === 'live' ? '✅ Live' : b.onboarding_completed ? '✅ Done' : '⏳ Setup'}
                      </span>
                    )}
                  </td>
                  <td style={{ padding: '12px 18px', fontSize: 12, color: '#7BAED4' }}>{new Date(b.created_at).toLocaleDateString('en-AU')}</td>
                  <td style={{ padding: '12px 18px', fontSize: 13, fontWeight: 600, color: mrr > 0 ? '#E8622A' : '#4A7FBB' }}>{mrr > 0 ? `$${mrr}` : '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
