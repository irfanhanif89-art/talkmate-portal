import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ALL_LEGAL_DOCS, pendingDocsForBusiness } from '@/lib/legal-docs'
import AcceptTermsClient from './accept-terms-client'

// Standalone retroactive-acceptance page. Existing clients who completed
// onboarding before the T&C step existed are redirected here from the
// dashboard banner. Once they sign, they go back to wherever they were.
export const dynamic = 'force-dynamic'

export default async function AcceptTermsPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: business } = await supabase
    .from('businesses')
    .select('id, name, tos_accepted_version, privacy_accepted_version, dpa_accepted_version')
    .eq('owner_user_id', user.id)
    .single()
  if (!business) redirect('/register')

  const params = await searchParams
  const nextUrl = params.next ?? '/dashboard'

  const pending = pendingDocsForBusiness(business)
  if (pending.length === 0) redirect(nextUrl)

  const pendingDocs = ALL_LEGAL_DOCS.filter(d => pending.includes(d.id))

  return <AcceptTermsClient docs={pendingDocs} businessName={business.name} nextUrl={nextUrl} />
}
