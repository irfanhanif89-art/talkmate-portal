import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import ResourcesView, { type ResourceRow, type RepOption } from './resources-view'

export const metadata: Metadata = { title: 'Sales Resources' }
export const dynamic = 'force-dynamic'

// Set ADMIN_EMAIL in Vercel environment variables
const ADMIN_EMAILS = ['hello@talkmate.com.au', process.env.ADMIN_EMAIL].filter(Boolean) as string[]

export default async function SalesResourcesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const isSuperAdmin = !!user.email && ADMIN_EMAILS.includes(user.email)
  if (!isSuperAdmin) {
    const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).maybeSingle()
    if (profile?.role !== 'admin') redirect('/dashboard')
  }

  const admin = createAdminClient()

  const { data: resources } = await admin
    .from('sales_resources')
    .select('id, title, description, file_name, file_type, file_size, is_active, created_at')
    .eq('is_active', true)
    .order('created_at', { ascending: false })

  const { data: assignments } = await admin
    .from('sales_resource_assignments')
    .select('resource_id, rep_id')

  const { data: reps } = await admin
    .from('sales_reps')
    .select('id, full_name')
    .eq('status', 'active')
    .order('full_name', { ascending: true })

  const byResource = new Map<string, string[]>()
  for (const a of assignments ?? []) {
    const rid = a.resource_id as string
    const list = byResource.get(rid) ?? []
    list.push(a.rep_id as string)
    byResource.set(rid, list)
  }

  const rows: ResourceRow[] = (resources ?? []).map(r => ({
    id: r.id,
    title: r.title,
    description: r.description,
    file_name: r.file_name,
    file_type: r.file_type,
    file_size: r.file_size,
    is_active: !!r.is_active,
    created_at: r.created_at,
    assigned_rep_ids: byResource.get(r.id) ?? [],
  }))

  const repOptions: RepOption[] = (reps ?? []).map(r => ({ id: r.id, full_name: r.full_name }))

  return <ResourcesView resources={rows} reps={repOptions} />
}
