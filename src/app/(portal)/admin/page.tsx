import type { Metadata } from 'next'
import Link from 'next/link'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export const metadata: Metadata = { title: 'Admin' }

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
    id, name, business_type, plan, onboarding_completed, agent_status, preview_number, created_at, signup_at, owner_user_id, industry
  `).order('created_at', { ascending: false }).limit(100)

  // CRM Overview (Session 1 brief Part 9)
  const { count: contactsTotal } = await adminClient.from('contacts')
    .select('id', { count: 'exact', head: true }).eq('is_merged', false)
  const { count: contactsThisMonth } = await adminClient.from('contacts')
    .select('id', { count: 'exact', head: true }).eq('is_merged', false)
    .gte('first_seen', new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString())

  // "Contacts awaiting name identification" — Session 3 brief Part 8.
  // Group by business so Irfan can spot clients whose call data quality is low.
  const { data: nameGapRows } = await adminClient
    .from('contacts')
    .select('client_id')
    .eq('is_merged', false)
    .is('name', null)
  const nameGapByBusiness = new Map<string, number>()
  for (const row of nameGapRows ?? []) {
    nameGapByBusiness.set(row.client_id as string, (nameGapByBusiness.get(row.client_id as string) ?? 0) + 1)
  }
  const nameGapEntries = [...nameGapByBusiness.entries()]
    .map(([clientId, count]) => ({
      business_id: clientId,
      name: businesses?.find(b => b.id === clientId)?.name ?? 'Unknown',
      count,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8)
  const totalAwaitingName = nameGapRows?.length ?? 0

  // Pipeline health (Session 2 brief Part 8)
  const PIPELINE_INDUSTRIES = ['real_estate', 'trades', 'professional_services']
  const realEstateClients = (businesses ?? []).filter(b => b.industry === 'real_estate').length
  const pipelineClients = (businesses ?? []).filter(b => PIPELINE_INDUSTRIES.includes(b.industry as string)).length
  const { count: contactsInPipeline } = await adminClient.from('contact_pipeline')
    .select('id', { count: 'exact', head: true })
  const { data: pipelineStageRows } = await adminClient.from('contact_pipeline')
    .select('stage_id, pipeline_stages(stage_name)')
  const stageDistribution = new Map<string, number>()
  for (const row of pipelineStageRows ?? []) {
    const name = ((row as { pipeline_stages?: { stage_name?: string } | null }).pipeline_stages?.stage_name) ?? 'Unknown'
    stageDistribution.set(name, (stageDistribution.get(name) ?? 0) + 1)
  }
  const stageEntries = [...stageDistribution.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)

  // Smart list activity (Session 2 brief Part 8)
  const { data: smartListRows } = await adminClient.from('smart_lists')
    .select('name, contact_count, client_id, businesses(name)')
    .order('contact_count', { ascending: false })
    .limit(50)
  const topLists = (smartListRows ?? [])
    .filter(r => (r.contact_count ?? 0) > 0)
    .slice(0, 8)
    .map(r => ({
      name: r.name as string,
      contact_count: r.contact_count as number,
      business_name: (((r as { businesses?: { name?: string } | null }).businesses)?.name) ?? 'Unknown',
    }))
  const lapsedRegularSignal = (smartListRows ?? [])
    .filter(r => (r.name as string) === 'Lapsed Regulars' && (r.contact_count ?? 0) > 0)
    .map(r => ({ business_name: (((r as { businesses?: { name?: string } | null }).businesses)?.name) ?? 'Unknown', count: r.contact_count as number }))

  const industryBreakdown = (businesses ?? []).reduce<Record<string, number>>((acc, b) => {
    const key = b.industry || 'unconfigured'
    acc[key] = (acc[key] || 0) + 1
    return acc
  }, {})
  const industryEntries = Object.entries(industryBreakdown).sort((a, b) => b[1] - a[1])
  const crmConfigured = (businesses ?? []).filter(b => !!b.industry).length
  const crmNotConfigured = (businesses ?? []).length - crmConfigured

  // Top 5 clients by contact count.
  const { data: topByContacts } = await adminClient.rpc('admin_top_clients_by_contacts').select('*').limit(5).single().then(
    () => ({ data: null }),
    () => ({ data: null }),
  ) as { data: null }
  // Fallback: aggregate manually if no RPC defined.
  let topClients: Array<{ business_id: string; name: string; contact_count: number }> = []
  if (!topByContacts) {
    const { data: agg } = await adminClient.from('contacts')
      .select('client_id').eq('is_merged', false)
    const counts = new Map<string, number>()
    for (const row of agg ?? []) counts.set(row.client_id as string, (counts.get(row.client_id as string) ?? 0) + 1)
    topClients = [...counts.entries()]
      .map(([clientId, count]) => {
        const biz = businesses?.find(b => b.id === clientId)
        return { business_id: clientId, name: biz?.name ?? 'Unknown', contact_count: count }
      })
      .sort((a, b) => b.contact_count - a.contact_count)
      .slice(0, 5)
  }

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
      <h1 style={{ fontSize: '1.6rem', fontWeight: 800, color: 'white', marginBottom: 14 }}>Admin</h1>

      {/* Admin section nav */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 24 }}>
        {[
          { href: '/admin/partners', label: 'Partners' },
          { href: '/admin/white-label', label: 'White Label' },
          { href: '/admin/make-setup', label: 'Make.com Setup' },
        ].map(l => (
          <Link
            key={l.href}
            href={l.href}
            style={{
              padding: '8px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600,
              background: 'rgba(74,159,232,0.08)', border: '1px solid rgba(74,159,232,0.25)',
              color: '#4A9FE8', textDecoration: 'none', fontFamily: 'Outfit, sans-serif',
            }}
          >{l.label} →</Link>
        ))}
      </div>

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

      {/* Contacts awaiting name (Session 3 brief Part 8) */}
      <div style={{ background: '#0A1E38', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: 20, marginBottom: 22 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'white' }}>Contacts awaiting name identification</div>
          <span style={{ fontSize: 11, color: '#7BAED4' }}>{totalAwaitingName} total</span>
        </div>
        <p style={{ fontSize: 12, color: '#7BAED4', marginBottom: 12, lineHeight: 1.5 }}>
          Contacts where <code style={{ color: '#E8622A' }}>name IS NULL</code>. High counts here mean the
          extraction prompt isn&apos;t pulling caller names — worth flagging to the client.
        </p>
        {nameGapEntries.length === 0 ? (
          <div style={{ fontSize: 12, color: '#22C55E' }}>✓ All contacts have a name.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {nameGapEntries.map(e => {
              const max = nameGapEntries[0]?.count ?? 1
              return (
                <div key={e.business_id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 12, color: 'white', minWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{e.name}</span>
                  <div style={{ flex: 1, height: 6, background: 'rgba(255,255,255,0.05)', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ width: `${(e.count / max) * 100}%`, height: '100%', background: '#F59E0B', borderRadius: 3 }} />
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#F59E0B', minWidth: 30, textAlign: 'right' as const }}>{e.count}</span>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* CRM Overview (Session 1 brief Part 9) */}
      <div style={{ background: '#0A1E38', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: 20, marginBottom: 22 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'white', marginBottom: 14 }}>CRM Overview</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 18 }}>
          {[
            { label: 'Total contacts', value: contactsTotal ?? 0, color: '#1565C0' },
            { label: 'New this month', value: contactsThisMonth ?? 0, color: '#22C55E' },
            { label: 'CRM configured', value: `${crmConfigured} / ${(businesses?.length ?? 0)}`, color: '#E8622A' },
            { label: 'Not configured', value: crmNotConfigured, color: '#F59E0B' },
          ].map(s => (
            <div key={s.label} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 11, padding: 14 }}>
              <div style={{ height: 2, background: s.color, marginBottom: 10, marginLeft: -14, marginRight: -14, marginTop: -14 }} />
              <p style={{ fontSize: 11, fontWeight: 700, color: '#7BAED4', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>{s.label}</p>
              <p style={{ fontSize: 22, fontWeight: 800, color: 'white', letterSpacing: '-0.5px' }}>{s.value}</p>
            </div>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#7BAED4', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Industry breakdown</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {industryEntries.length === 0 && <div style={{ fontSize: 12, color: '#7BAED4' }}>No data yet.</div>}
              {industryEntries.map(([industry, count]) => {
                const max = industryEntries[0]?.[1] ?? 1
                return (
                  <div key={industry} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 12, color: 'white', minWidth: 130, textTransform: 'capitalize' as const }}>{industry.replace(/_/g, ' ')}</span>
                    <div style={{ flex: 1, height: 6, background: 'rgba(255,255,255,0.05)', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{ width: `${(count / max) * 100}%`, height: '100%', background: '#1565C0', borderRadius: 3 }} />
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 700, color: 'white', minWidth: 24, textAlign: 'right' as const }}>{count}</span>
                  </div>
                )
              })}
            </div>
          </div>

          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#7BAED4', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Top 5 by contact count</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {topClients.length === 0 && <div style={{ fontSize: 12, color: '#7BAED4' }}>No contacts yet.</div>}
              {topClients.map((c, i) => (
                <div key={c.business_id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: 'rgba(255,255,255,0.03)', borderRadius: 8 }}>
                  <span style={{ fontSize: 13, color: 'white' }}>{i + 1}. {c.name}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#E8622A' }}>{c.contact_count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Pipeline health (Session 2 brief Part 8) */}
      <div style={{ background: '#0A1E38', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: 20, marginBottom: 22 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'white', marginBottom: 14 }}>Pipeline health</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 18 }}>
          {[
            { label: 'Real-estate clients', value: realEstateClients, color: '#E8622A' },
            { label: 'All pipeline clients', value: pipelineClients, color: '#1565C0' },
            { label: 'Contacts in pipeline', value: contactsInPipeline ?? 0, color: '#22C55E' },
          ].map(s => (
            <div key={s.label} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 11, padding: 14 }}>
              <div style={{ height: 2, background: s.color, marginBottom: 10, marginLeft: -14, marginRight: -14, marginTop: -14 }} />
              <p style={{ fontSize: 11, fontWeight: 700, color: '#7BAED4', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>{s.label}</p>
              <p style={{ fontSize: 22, fontWeight: 800, color: 'white', letterSpacing: '-0.5px' }}>{s.value}</p>
            </div>
          ))}
        </div>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#7BAED4', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Average stage distribution</div>
        {stageEntries.length === 0 ? (
          <div style={{ fontSize: 12, color: '#7BAED4' }}>No pipeline contacts yet.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {stageEntries.map(([stage, count]) => {
              const max = stageEntries[0][1] ?? 1
              return (
                <div key={stage} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 12, color: 'white', minWidth: 160 }}>{stage}</span>
                  <div style={{ flex: 1, height: 6, background: 'rgba(255,255,255,0.05)', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ width: `${(count / max) * 100}%`, height: '100%', background: '#E8622A', borderRadius: 3 }} />
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'white', minWidth: 24, textAlign: 'right' as const }}>{count}</span>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Smart list activity (Session 2 brief Part 8) */}
      <div style={{ background: '#0A1E38', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: 20, marginBottom: 22 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'white', marginBottom: 14 }}>Smart list activity</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#7BAED4', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Most populated lists</div>
            {topLists.length === 0 ? (
              <div style={{ fontSize: 12, color: '#7BAED4' }}>No lists with contacts yet.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {topLists.map((l, i) => (
                  <div key={`${l.business_name}-${l.name}-${i}`} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 12px', background: 'rgba(255,255,255,0.03)', borderRadius: 8 }}>
                    <span style={{ fontSize: 12, color: 'white', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{l.business_name} · {l.name}</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#E8622A', flexShrink: 0, marginLeft: 10 }}>{l.contact_count}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#F59E0B', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Upsell signal: Lapsed regulars</div>
            {lapsedRegularSignal.length === 0 ? (
              <div style={{ fontSize: 12, color: '#7BAED4' }}>No clients with lapsed regulars right now.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {lapsedRegularSignal.map((s, i) => (
                  <div key={`${s.business_name}-${i}`} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 8 }}>
                    <span style={{ fontSize: 12, color: 'white' }}>{s.business_name}</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#F59E0B' }}>{s.count} lapsed</span>
                  </div>
                ))}
              </div>
            )}
          </div>
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
