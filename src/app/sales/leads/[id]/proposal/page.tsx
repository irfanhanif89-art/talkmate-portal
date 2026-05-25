import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/server'
import { requireSalesRep } from '@/lib/sales-auth'
import ProposalForm from '@/components/sales/ProposalForm'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Send Proposal — TalkMate Sales HQ' }

interface Props {
  params: Promise<{ id: string }>
}

export default async function ProposalPage({ params }: Props) {
  const auth = await requireSalesRep()
  if (!auth.ok) redirect('/')
  if (!auth.rep.notification_email) {
    redirect('/sales/profile?warn=proposal')
  }

  const { id } = await params
  const admin = createAdminClient()
  const { data: lead } = await admin
    .from('leads')
    .select('id, business_name, contact_name, industry, email, assigned_to')
    .eq('id', id)
    .maybeSingle()

  if (!lead || lead.assigned_to !== auth.rep.id) {
    redirect('/sales/leads')
  }

  return (
    <div style={{ padding: '24px 24px 60px', fontFamily: 'Outfit, sans-serif', maxWidth: 720 }}>
      <div style={{ marginBottom: 22 }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0, letterSpacing: '-0.5px' }}>Send Proposal</h1>
        <p style={{ fontSize: 13, color: '#7BAED4', margin: 0, marginTop: 4 }}>
          A branded proposal email goes from sales@talkmate.com.au. Replies come straight to {auth.rep.notification_email}.
        </p>
      </div>

      <ProposalForm
        leadId={lead.id}
        initialBusinessName={lead.business_name}
        initialContactName={lead.contact_name ?? ''}
        initialIndustry={lead.industry ?? ''}
        leadEmail={lead.email ?? ''}
      />
    </div>
  )
}
