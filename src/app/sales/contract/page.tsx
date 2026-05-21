import { createAdminClient, createClient } from '@/lib/supabase/server'
import { requireSalesRep } from '@/lib/sales-auth'
import { redirect } from 'next/navigation'
import { FileText } from 'lucide-react'
import ContractView, { type ContractRow } from '@/components/sales/contract-view'

export const dynamic = 'force-dynamic'

const CONTRACT_BUCKET = 'contractor-agreements'
const SIGNED_URL_TTL_SECONDS = 60 * 60 // 1 hour — page reload regenerates

export default async function SalesContractPage() {
  const auth = await requireSalesRep()
  if (!auth.ok) redirect('/')

  // Contractor-flow reps see their pre-signed agreement, not the manual
  // upload UI. The signed PDF lives in the private contractor-agreements
  // bucket — generate a short-lived signed URL on each load.
  if (auth.rep.onboarded_via === 'contractor_flow' && auth.rep.contractor_id) {
    const admin = createAdminClient()
    const { data: contractor } = await admin
      .from('contractors')
      .select('signed_pdf_url, agreement_signed_at')
      .eq('id', auth.rep.contractor_id)
      .maybeSingle()

    let signedUrl: string | null = null
    if (contractor?.signed_pdf_url) {
      const { data } = await admin.storage
        .from(CONTRACT_BUCKET)
        .createSignedUrl(contractor.signed_pdf_url, SIGNED_URL_TTL_SECONDS)
      signedUrl = data?.signedUrl ?? null
    }

    return (
      <div style={{ padding: '24px 24px 40px', fontFamily: 'Outfit, sans-serif' }}>
        <div style={{ marginBottom: 22 }}>
          <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0, letterSpacing: '-0.5px' }}>My contract</h1>
          <p style={{ fontSize: 13, color: '#7BAED4', margin: 0, marginTop: 4 }}>
            Your TalkMate Sales Contractor Agreement.
          </p>
        </div>

        <div style={{
          padding: 24, borderRadius: 12,
          background: '#0A1E38', border: '1px solid rgba(255,255,255,0.06)',
        }}>
          <p style={{ fontSize: 14, color: '#7BAED4', margin: '0 0 18px', lineHeight: 1.6 }}>
            Your contractor agreement is on file
            {contractor?.agreement_signed_at
              ? `, signed on ${new Date(contractor.agreement_signed_at).toLocaleDateString('en-AU')}.`
              : '.'}
          </p>
          {signedUrl ? (
            <a
              href={signedUrl}
              target="_blank"
              rel="noreferrer"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '10px 16px', borderRadius: 9,
                background: '#22D3EE', color: '#061322', textDecoration: 'none',
                fontWeight: 700, fontSize: 14,
              }}
            >
              <FileText size={14} /> View signed agreement
            </a>
          ) : (
            <span style={{ color: '#7BAED4', fontSize: 13 }}>
              Signed PDF is not yet available. Contact admin if this persists.
            </span>
          )}
        </div>
      </div>
    )
  }

  // Manual/legacy reps fall through to the existing upload-and-sign flow.
  const supabase = await createClient()
  const { data: contract } = await supabase
    .from('rep_contracts')
    .select('id, document_name, document_path, policy_version, status, sent_at, signed_at, signer_name')
    .eq('rep_id', auth.rep.id)
    .in('status', ['pending_signature', 'signed'])
    .order('sent_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  return (
    <div style={{ padding: '24px 24px 40px', fontFamily: 'Outfit, sans-serif' }}>
      <div style={{ marginBottom: 22 }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0, letterSpacing: '-0.5px' }}>My contract</h1>
        <p style={{ fontSize: 13, color: '#7BAED4', margin: 0, marginTop: 4 }}>
          Your TalkMate Independent Sales Representative Agreement.
        </p>
      </div>

      <ContractView contract={(contract as ContractRow) ?? null} repFullName={auth.rep.full_name} />
    </div>
  )
}
