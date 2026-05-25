import { redirect } from 'next/navigation'
import { createAdminClient, createClient } from '@/lib/supabase/server'
import LeadsImportClient from './leads-import-client'

export const dynamic = 'force-dynamic'

export default async function LeadsImportPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()
  const { data: reps } = await admin
    .from('sales_reps')
    .select('id, full_name, email, status')
    .eq('status', 'active')
    .order('full_name', { ascending: true })

  return <LeadsImportClient reps={reps ?? []} />
}
