import { redirect } from 'next/navigation'
import Link from 'next/link'
import { AlertTriangle } from 'lucide-react'
import { requireSalesRep } from '@/lib/sales-auth'
import QuickProposalForm from '@/components/sales/QuickProposalForm'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Send Proposal — TalkMate Sales HQ' }

export default async function NewProposalPage() {
  const auth = await requireSalesRep()
  if (!auth.ok) redirect('/')

  const hasReplyTo = !!auth.rep.notification_email

  return (
    <div style={{ padding: '24px 24px 60px', fontFamily: 'Outfit, sans-serif', maxWidth: 720 }}>
      <div style={{ marginBottom: 22 }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0, letterSpacing: '-0.5px' }}>Send a Proposal</h1>
        <p style={{ fontSize: 13, color: '#7BAED4', margin: 0, marginTop: 4 }}>
          Enter the client&apos;s details and we&apos;ll auto-generate a branded proposal for their
          industry and email it from sales@talkmate.com.au.{hasReplyTo ? ` Replies come straight to ${auth.rep.notification_email}.` : ''}
        </p>
      </div>

      {!hasReplyTo ? (
        <div style={{
          background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)',
          borderRadius: 12, padding: 22, display: 'flex', gap: 14, alignItems: 'flex-start',
        }}>
          <AlertTriangle size={20} style={{ color: '#f59e0b', flexShrink: 0, marginTop: 2 }} />
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'white', marginBottom: 6 }}>
              Set your reply-to email first
            </div>
            <p style={{ fontSize: 13, color: '#fcd34d', lineHeight: 1.6, margin: 0, marginBottom: 14 }}>
              Proposals are sent from sales@talkmate.com.au, but client replies need to come back to
              you. Add the email you want replies sent to, then come back here to send your proposal.
            </p>
            <Link
              href="/sales/profile"
              style={{
                display: 'inline-block', padding: '10px 18px', borderRadius: 9,
                background: '#E8622A', color: 'white', textDecoration: 'none',
                fontSize: 13, fontWeight: 700,
              }}
            >Go to Profile</Link>
          </div>
        </div>
      ) : (
        <QuickProposalForm />
      )}
    </div>
  )
}
