// ServiceM8 push log — Session 3B. Last 50 push attempts for the business.

import { redirect } from 'next/navigation'
import { createClient, createAdminClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'ServiceM8 Push Log · TalkMate' }

interface LogRow {
  id: string
  pushed_at: string
  status: string
  servicem8_job_uuid: string | null
  error_message: string | null
  contact_id: string | null
}

export default async function ServiceM8LogPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: business } = await supabase
    .from('businesses')
    .select('id')
    .eq('owner_user_id', user.id)
    .limit(1)
    .maybeSingle()
  if (!business) redirect('/dashboard')

  const admin = createAdminClient()
  const { data: rows } = await admin
    .from('servicem8_push_log')
    .select('id, pushed_at, status, servicem8_job_uuid, error_message, contact_id')
    .eq('business_id', business.id)
    .order('pushed_at', { ascending: false })
    .limit(50)

  // Resolve contact names in one pass.
  const contactIds = Array.from(new Set((rows ?? []).map((r) => r.contact_id).filter(Boolean))) as string[]
  const nameById: Record<string, string> = {}
  if (contactIds.length > 0) {
    const { data: contacts } = await admin.from('contacts').select('id, name').in('id', contactIds)
    for (const c of contacts ?? []) nameById[c.id as string] = (c.name as string | null) ?? ''
  }

  const log = (rows ?? []) as LogRow[]

  const thCls = 'border-b border-line-strong px-3 py-2.5 text-left text-[12px] font-bold text-dim'
  const tdCls = 'border-b border-line px-3 py-2.5 align-top text-[13px] text-dim'

  function statusCls(s: string): string {
    if (s === 'success') return 'text-green'
    if (s === 'failed') return 'text-red'
    return 'text-gold'
  }

  return (
    <div className="mx-auto max-w-[980px] p-7 md:px-8">
      <a href="/settings" className="text-[13px] text-blue no-underline">← Back to Settings</a>
      <h1 className="mb-1 mt-3 text-[22px] font-[800] text-text">ServiceM8 Push Log</h1>
      <p className="mb-6 text-[13px] text-dim">The last 50 jobs TalkMate attempted to push to ServiceM8.</p>

      {log.length === 0 ? (
        <div className="rounded-[14px] border border-line bg-card p-6 text-[14px] text-dim">
          No jobs pushed yet. When a qualifying call ends, the job will appear here.
        </div>
      ) : (
        <div className="overflow-hidden rounded-[14px] border border-line bg-card">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className={thCls}>Date</th>
                <th className={thCls}>Contact</th>
                <th className={thCls}>Job UUID</th>
                <th className={thCls}>Status</th>
                <th className={thCls}>Error</th>
              </tr>
            </thead>
            <tbody>
              {log.map((r) => (
                <tr key={r.id}>
                  <td className={tdCls}>{new Date(r.pushed_at).toLocaleString('en-AU')}</td>
                  <td className={tdCls}>{(r.contact_id && nameById[r.contact_id]) || '—'}</td>
                  <td className={tdCls + ' font-mono text-[11px]'}>{r.servicem8_job_uuid ?? '—'}</td>
                  <td className={tdCls + ' font-bold ' + statusCls(r.status)}>{r.status}</td>
                  <td className={tdCls + ' max-w-[280px] break-words text-red'}>{r.error_message ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
