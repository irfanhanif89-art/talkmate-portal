import { redirect } from 'next/navigation'
import { requireSalesRep } from '@/lib/sales-auth'
import QuickProposalForm from '@/components/sales/QuickProposalForm'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Send Proposal — TalkMate Sales HQ' }

export default async function NewProposalPage() {
  const auth = await requireSalesRep()
  if (!auth.ok) redirect('/')

  return (
    <div style={{ padding: '24px 24px 60px', fontFamily: 'Outfit, sans-serif', maxWidth: 720 }}>
      <div style={{ marginBottom: 22 }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0, letterSpacing: '-0.5px' }}>Send a Proposal</h1>
        <p style={{ fontSize: 13, color: '#7BAED4', margin: 0, marginTop: 4 }}>
          Enter the client&apos;s details and we&apos;ll auto-generate a branded PDF proposal for their
          industry and email it from hello@talkmate.com.au.
        </p>
      </div>

      <QuickProposalForm />
    </div>
  )
}
