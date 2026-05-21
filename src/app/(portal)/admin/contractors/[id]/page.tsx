import type { Metadata } from 'next'
import { redirect, notFound } from 'next/navigation'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import ContractorDetailView, {
  type DetailContractor,
  type DetailAgreement,
  type DetailAcknowledgement,
  type DetailCommission,
} from './contractor-detail-view'

export const metadata: Metadata = { title: 'Contractor' }
export const dynamic = 'force-dynamic'

// Set ADMIN_EMAIL in Vercel environment variables
const ADMIN_EMAILS = ['hello@talkmate.com.au', process.env.ADMIN_EMAIL].filter(Boolean) as string[]
const STORAGE_BUCKET = 'contractor-agreements'

export default async function ContractorDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const isSuperAdmin = !!user.email && ADMIN_EMAILS.includes(user.email)
  if (!isSuperAdmin) {
    const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).maybeSingle()
    if (profile?.role !== 'admin') redirect('/dashboard')
  }

  const admin = createAdminClient()
  const { data: contractor } = await admin
    .from('contractors')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (!contractor) notFound()

  const [{ data: agreements }, { data: acks }, { data: commissions }] = await Promise.all([
    admin
      .from('contractor_agreements')
      .select('id, agreement_version, script_version, script_date, signed_at, signed_pdf_url, status, created_at')
      .eq('contractor_id', id)
      .order('created_at', { ascending: false }),
    admin
      .from('script_acknowledgements')
      .select('id, script_id, script_version, acknowledged_at')
      .eq('contractor_id', id)
      .order('acknowledged_at', { ascending: false }),
    admin
      .from('contractor_commissions')
      .select('id, plan_type, billing_cycle, sale_amount, commission_amount, status, clawback_period_ends_at, paid_at, created_at, client_business_id, notes')
      .eq('contractor_id', id)
      .order('created_at', { ascending: false }),
  ])

  // Generate a fresh signed URL for the latest signed PDF if we have one.
  let signedPdfUrl: string | null = null
  if (contractor.signed_pdf_url) {
    const { data: signed } = await admin.storage
      .from(STORAGE_BUCKET)
      .createSignedUrl(contractor.signed_pdf_url, 60 * 60 * 24)
    signedPdfUrl = signed?.signedUrl ?? null
  }

  return (
    <ContractorDetailView
      contractor={contractor as DetailContractor}
      agreements={(agreements ?? []) as DetailAgreement[]}
      acknowledgements={(acks ?? []) as DetailAcknowledgement[]}
      commissions={(commissions ?? []) as DetailCommission[]}
      signedPdfUrl={signedPdfUrl}
    />
  )
}
