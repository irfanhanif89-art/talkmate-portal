import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/admin-auth'

export const dynamic = 'force-dynamic'

export async function GET() {
  const auth = await requireAdmin()
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status })

  const admin = createAdminClient()
  const { data: scripts, error } = await admin
    .from('sales_scripts')
    .select('id, version, title, content, is_active, activated_at, created_by, created_at, updated_at')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  // Acknowledgement counts per script
  const { data: ackCounts } = await admin
    .from('script_acknowledgements')
    .select('script_id')

  const ackByScript = new Map<string, number>()
  for (const row of ackCounts ?? []) {
    const sid = row.script_id as string
    ackByScript.set(sid, (ackByScript.get(sid) ?? 0) + 1)
  }

  return NextResponse.json({
    ok: true,
    scripts: (scripts ?? []).map(s => ({ ...s, ack_count: ackByScript.get(s.id) ?? 0 })),
  })
}

export async function POST(req: Request) {
  const auth = await requireAdmin()
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status })

  const body = (await req.json().catch(() => ({}))) as {
    version?: unknown
    title?: unknown
    content?: unknown
  }
  const version = String(body.version ?? '').trim()
  const title = String(body.title ?? '').trim()
  const content = String(body.content ?? '').trim()

  if (!version) return NextResponse.json({ ok: false, error: 'Version is required' }, { status: 400 })
  if (!title) return NextResponse.json({ ok: false, error: 'Title is required' }, { status: 400 })
  if (!content) return NextResponse.json({ ok: false, error: 'Script content is required' }, { status: 400 })

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('sales_scripts')
    .insert({
      version,
      title,
      content,
      is_active: false,
      created_by: auth.user.email ?? null,
    })
    .select('id, version, title, is_active, created_at')
    .single()

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, script: data })
}
