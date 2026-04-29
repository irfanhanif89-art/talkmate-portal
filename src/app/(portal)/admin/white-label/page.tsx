import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import type { WhiteLabelConfig } from '@/lib/white-label'

export const metadata: Metadata = { title: 'White Label' }
export const dynamic = 'force-dynamic'

export default async function AdminWhiteLabelPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: userProfile } = await supabase.from('users').select('role').eq('id', user.id).single()
  const isSuperAdmin = user.email === process.env.INTERNAL_ALERT_EMAIL || user.email === 'hello@talkmate.com.au'
  if (userProfile?.role !== 'admin' && !isSuperAdmin) redirect('/dashboard')

  const admin = createAdminClient()
  const { data: configs } = await admin
    .from('white_label_configs')
    .select('*, businesses(name)')
    .order('created_at', { ascending: false })

  type Row = WhiteLabelConfig & { businesses: { name: string } | null }
  const rows = (configs ?? []) as Row[]

  return (
    <div style={{ padding: 28, maxWidth: 1200, margin: '0 auto' }}>
      <Link href="/admin" style={{ fontSize: 13, color: '#7BAED4', textDecoration: 'none' }}>← Admin</Link>
      <h1 style={{ fontSize: '1.6rem', fontWeight: 800, color: 'white', marginTop: 8, marginBottom: 16 }}>White label configs</h1>
      <p style={{ fontSize: 14, color: '#7BAED4', marginBottom: 22, lineHeight: 1.6 }}>
        Every white-label partner has their own brand-name, colours, and subdomain. The preview link shows
        what the portal looks like to anyone landing on the partner&apos;s subdomain.
      </p>

      <div style={{ background: '#0A1E38', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' as const }}>
          <thead>
            <tr style={{ background: '#071829' }}>
              {['Partner', 'Brand', 'Subdomain', 'Active', 'Preview'].map(h => (
                <th key={h} style={{ textAlign: 'left' as const, padding: '10px 18px', fontSize: 11, fontWeight: 700, color: '#4A7FBB', textTransform: 'uppercase' as const, letterSpacing: '0.06em' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} style={{ padding: 24, fontSize: 13, color: '#7BAED4', textAlign: 'center' as const }}>
                  No white-label configs yet.
                </td>
              </tr>
            )}
            {rows.map((c, i) => (
              <tr key={c.id} style={{ borderTop: '1px solid rgba(255,255,255,0.04)', background: i % 2 === 0 ? '#0A1E38' : '#071829' }}>
                <td style={{ padding: '12px 18px', fontSize: 13, color: 'white' }}>
                  {c.businesses?.name ?? <span style={{ color: '#7BAED4', fontStyle: 'italic' }}>Demo (no partner)</span>}
                </td>
                <td style={{ padding: '12px 18px', fontSize: 13, fontWeight: 600, color: 'white', display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ width: 18, height: 18, borderRadius: 5, background: c.primary_color, border: '1px solid rgba(255,255,255,0.1)' }} />
                  {c.brand_name}
                </td>
                <td style={{ padding: '12px 18px', fontSize: 12, color: '#7BAED4', fontFamily: 'monospace' }}>
                  {c.portal_subdomain ?? '—'}
                </td>
                <td style={{ padding: '12px 18px' }}>
                  <span style={{ fontSize: 11, padding: '3px 9px', borderRadius: 99, background: c.is_active ? 'rgba(34,197,94,0.12)' : 'rgba(255,255,255,0.04)', color: c.is_active ? '#22C55E' : '#7BAED4' }}>
                    {c.is_active ? 'active' : 'inactive'}
                  </span>
                </td>
                <td style={{ padding: '12px 18px', fontSize: 12 }}>
                  {c.portal_subdomain ? (
                    <Link
                      href={`/wl-preview/${c.portal_subdomain}`}
                      style={{ color: '#E8622A', textDecoration: 'none', fontWeight: 600 }}
                    >Preview →</Link>
                  ) : <span style={{ color: '#7BAED4' }}>—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
