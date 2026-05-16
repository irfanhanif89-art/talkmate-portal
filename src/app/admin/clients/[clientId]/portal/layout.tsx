import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/admin-auth'
import { BusinessTypeProvider } from '@/context/business-type-context'
import type { BusinessType } from '@/lib/business-types'
import AdminPortalShell from '@/components/admin/admin-portal-shell'

// Admin portal parity layout (Session 13).
//
// Renders the client portal experience scoped to a specific clientId
// using the service-role Supabase client. The admin (irfan@) stays
// signed in — we DO NOT swap sessions like /admin/view-as does.
// All actions in this tree pass adminClientId down so data calls go
// through /api/admin/businesses/[clientId]/* and silent syncs hit
// /api/admin/vapi/sync?clientId=...
export const dynamic = 'force-dynamic'

export default async function AdminPortalLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ clientId: string }>
}) {
  const auth = await requireAdmin()
  if (!auth.ok) redirect('/login')

  const { clientId } = await params
  const admin = createAdminClient()
  const { data: business } = await admin
    .from('businesses')
    .select('id, name, business_type')
    .eq('id', clientId)
    .maybeSingle()

  if (!business) {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: '#061322', color: 'white', fontFamily: 'Outfit, sans-serif', padding: 24,
      }}>
        <div style={{
          maxWidth: 480, padding: 32, borderRadius: 16,
          background: '#0A1E38', border: '1px solid rgba(255,255,255,0.08)',
          textAlign: 'center' as const,
        }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0, marginBottom: 10 }}>
            Client not found
          </h1>
          <p style={{ fontSize: 14, color: '#7BAED4', lineHeight: 1.6, margin: 0, marginBottom: 18 }}>
            No business with id {clientId} exists. It may have been deleted.
          </p>
          <a
            href="/admin/clients"
            style={{
              display: 'inline-block', padding: '10px 20px', borderRadius: 9,
              background: '#E8622A', color: 'white', textDecoration: 'none',
              fontSize: 13, fontWeight: 700,
            }}
          >Back to Admin Clients</a>
        </div>
      </div>
    )
  }

  return (
    <BusinessTypeProvider
      businessType={(business.business_type as BusinessType) ?? 'other'}
      businessName={business.name}
      businessId={business.id}
    >
      <AdminPortalShell clientId={business.id} businessName={business.name}>
        {children}
      </AdminPortalShell>
    </BusinessTypeProvider>
  )
}
