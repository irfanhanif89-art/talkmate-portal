import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { WhiteLabelConfig } from '@/lib/white-label'
import { canHideTalkmateBranding } from '@/lib/white-label'
import WhiteLabelConfigClient from './white-label-config-client'

export const metadata: Metadata = { title: 'White Label' }
export const dynamic = 'force-dynamic'

export default async function PartnerWhiteLabelPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: business } = await supabase
    .from('businesses')
    .select('id, name, is_partner, partner_tier')
    .eq('owner_user_id', user.id)
    .single()
  if (!business) redirect('/register')

  if (!business.is_partner) {
    return (
      <div style={{ padding: 28, color: '#F2F6FB', maxWidth: 720 }}>
        <h1 style={{ fontSize: '1.6rem', fontWeight: 800, color: 'white', marginBottom: 12 }}>White label</h1>
        <p style={{ fontSize: 14, color: '#7BAED4', lineHeight: 1.6, marginBottom: 18 }}>
          White label is available to TalkMate partner accounts. If you run an agency, franchise group, or
          industry network and want to put TalkMate behind your own brand, contact our partnerships team and
          we&apos;ll set you up.
        </p>
        <a
          href="https://talkmate.com.au/partners"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            background: '#E8622A', color: 'white', padding: '10px 18px', borderRadius: 8,
            fontSize: 13, fontWeight: 700, textDecoration: 'none',
          }}
        >Talk to us about white labelling →</a>
      </div>
    )
  }

  const { data: config } = await supabase
    .from('white_label_configs')
    .select('*')
    .eq('partner_id', business.id)
    .maybeSingle()

  return (
    <WhiteLabelConfigClient
      businessName={business.name}
      partnerTier={business.partner_tier}
      canHideBranding={canHideTalkmateBranding(business.partner_tier)}
      initialConfig={config as WhiteLabelConfig | null}
    />
  )
}
