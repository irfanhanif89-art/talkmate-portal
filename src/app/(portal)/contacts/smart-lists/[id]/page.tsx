import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { resolveSmartList, type FilterRules } from '@/lib/smart-list-resolver'
import { ArrowLeft } from 'lucide-react'

export const dynamic = 'force-dynamic'

function timeAgo(iso: string | null): string {
  if (!iso) return '—'
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d < 7) return `${d}d ago`
  return `${Math.floor(d / 7)}w ago`
}

function formatPhone(phone: string): string {
  const m = phone.match(/^\+61(\d{3})(\d{3})(\d{3})$/)
  return m ? `+61 ${m[1]} ${m[2]} ${m[3]}` : phone
}

export default async function SmartListDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: business } = await supabase.from('businesses').select('id').eq('owner_user_id', user.id).single()
  if (!business) redirect('/register')

  const { data: list } = await supabase
    .from('smart_lists').select('*').eq('id', id).eq('client_id', business.id).single()
  if (!list) return notFound()

  const { contacts, total } = await resolveSmartList(supabase, business.id, (list.filter_rules ?? {}) as FilterRules, { limit: 200 })

  return (
    <div style={{ padding: 28, color: '#F2F6FB' }}>
      <Link href="/contacts/smart-lists" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#7BAED4', textDecoration: 'none', marginBottom: 18 }}>
        <ArrowLeft size={14} /> Back to smart lists
      </Link>

      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 8 }}>
        <span style={{ fontSize: 32 }}>{list.icon ?? '📋'}</span>
        <h1 style={{ fontSize: '1.6rem', fontWeight: 800, color: 'white', margin: 0 }}>{list.name}</h1>
      </div>
      {list.description && <p style={{ fontSize: 13, color: '#7BAED4', marginBottom: 14 }}>{list.description}</p>}
      <div style={{ fontSize: 12, color: '#4A7FBB', marginBottom: 22 }}>
        {total} contact{total === 1 ? '' : 's'} · borderColour {list.color ?? '#1565C0'}
      </div>

      <div style={{ background: '#0A1E38', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 14, overflow: 'hidden' }}>
        {contacts.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', fontSize: 13, color: '#7BAED4' }}>
            No contacts match this list yet. As TalkMate captures more calls they&apos;ll appear here automatically.
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead style={{ background: '#071829' }}>
              <tr>
                {['Contact', 'Phone', 'Calls', 'Last contact', 'Tags'].map(h => (
                  <th key={h} style={{ padding: '12px 18px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#7BAED4', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {contacts.map((c, i) => (
                <tr key={c.id} style={{ borderTop: i > 0 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
                  <td style={{ padding: '12px 18px' }}>
                    <Link href={`/contacts/${c.id}`} style={{ color: 'white', textDecoration: 'none', fontWeight: 600 }}>
                      {c.name || <span style={{ color: '#7BAED4' }}>Unknown caller</span>}
                    </Link>
                  </td>
                  <td style={{ padding: '12px 18px', fontSize: 13, color: '#7BAED4' }}>{formatPhone(c.phone)}</td>
                  <td style={{ padding: '12px 18px', fontSize: 13, fontWeight: 700, color: 'white' }}>{c.call_count}</td>
                  <td style={{ padding: '12px 18px', fontSize: 12, color: '#7BAED4' }}>{timeAgo(c.last_seen)}</td>
                  <td style={{ padding: '12px 18px' }}>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {(c.tags ?? []).slice(0, 3).map(t => (
                        <span key={t} style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 99, background: 'rgba(74,159,232,0.12)', color: '#4A9FE8', textTransform: 'capitalize' }}>{t.replace(/_/g, ' ')}</span>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
