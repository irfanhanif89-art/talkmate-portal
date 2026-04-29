import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export default async function SmartListsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: business } = await supabase.from('businesses').select('id, industry').eq('owner_user_id', user.id).single()
  if (!business) redirect('/register')

  const { data: lists } = await supabase
    .from('smart_lists')
    .select('id, name, description, is_system, contact_count, last_refreshed_at, color, icon')
    .eq('client_id', business.id)
    .order('is_system', { ascending: false })
    .order('name', { ascending: true })

  const system = (lists ?? []).filter(l => l.is_system)
  const custom = (lists ?? []).filter(l => !l.is_system)

  return (
    <div style={{ padding: 28, color: '#F2F6FB' }}>
      <div style={{ marginBottom: 22 }}>
        <Link href="/contacts" style={{ fontSize: 13, color: '#7BAED4', textDecoration: 'none' }}>← All contacts</Link>
        <h1 style={{ fontSize: '1.6rem', fontWeight: 800, color: 'white', marginTop: 6 }}>Smart lists</h1>
        <p style={{ fontSize: 13, color: '#7BAED4', marginTop: 4 }}>
          Filtered views of your contacts. System lists update automatically; custom lists are coming in Session 2.
        </p>
      </div>

      {[
        { title: 'System lists', items: system },
        { title: 'Custom lists', items: custom, empty: 'No custom lists yet. Coming in Session 2.' },
      ].map(group => (
        <div key={group.title} style={{ marginBottom: 28 }}>
          <h2 style={{ fontSize: 13, fontWeight: 700, color: '#7BAED4', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>{group.title}</h2>
          {group.items.length === 0 ? (
            <div style={{ background: '#0A1E38', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 14, padding: 22, fontSize: 13, color: '#7BAED4' }}>
              {group.empty ?? 'None yet.'}
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
              {group.items.map(l => (
                <div key={l.id} style={{
                  background: '#0A1E38', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 14, padding: 18,
                  borderLeft: `3px solid ${l.color ?? '#1565C0'}`,
                }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'white' }}>{l.name}</div>
                  <div style={{ fontSize: 12, color: '#7BAED4', marginTop: 4, lineHeight: 1.5 }}>{l.description}</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
                    <span style={{ fontSize: 22, fontWeight: 800, color: l.color ?? '#1565C0' }}>{l.contact_count ?? 0}</span>
                    <span style={{ fontSize: 11, color: '#4A7FBB' }}>
                      {l.last_refreshed_at ? `Updated ${new Date(l.last_refreshed_at).toLocaleString('en-AU', { dateStyle: 'short', timeStyle: 'short' })}` : 'Pending refresh'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
