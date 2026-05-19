import { createClient } from '@/lib/supabase/server'
import { requireSalesRep } from '@/lib/sales-auth'
import { redirect } from 'next/navigation'
import ContractView, { type ContractRow } from '@/components/sales/contract-view'

export const dynamic = 'force-dynamic'

export default async function SalesContractPage() {
  const auth = await requireSalesRep()
  if (!auth.ok) redirect('/')

  const supabase = await createClient()
  // Latest non-superseded contract for this rep.
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
