import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import ScriptsView, { type ScriptRow } from './scripts-view'

export const metadata: Metadata = { title: 'Sales Scripts' }
export const dynamic = 'force-dynamic'

const ADMIN_EMAILS = ['hello@talkmate.com.au', 'irfanhanif89@gmail.com']

export default async function SalesScriptsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const isSuperAdmin = !!user.email && ADMIN_EMAILS.includes(user.email)
  if (!isSuperAdmin) {
    const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).maybeSingle()
    if (profile?.role !== 'admin') redirect('/dashboard')
  }

  const admin = createAdminClient()
  const { data: scripts } = await admin
    .from('sales_scripts')
    .select('id, version, title, content, is_active, activated_at, created_by, created_at')
    .order('created_at', { ascending: false })

  const { data: acks } = await admin
    .from('script_acknowledgements')
    .select('script_id')

  const ackByScript = new Map<string, number>()
  for (const a of acks ?? []) {
    const sid = a.script_id as string
    ackByScript.set(sid, (ackByScript.get(sid) ?? 0) + 1)
  }

  const rows: ScriptRow[] = (scripts ?? []).map(s => ({
    id: s.id,
    version: s.version,
    title: s.title,
    content: s.content,
    is_active: !!s.is_active,
    activated_at: s.activated_at,
    created_by: s.created_by,
    created_at: s.created_at,
    ack_count: ackByScript.get(s.id) ?? 0,
  }))

  return <ScriptsView scripts={rows} />
}
