import { NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { createAdminClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/admin-auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_SIZE = 20 * 1024 * 1024 // 20MB
const ALLOWED = new Set(['application/pdf', 'text/html'])
const EXT: Record<string, string> = { 'application/pdf': 'pdf', 'text/html': 'html' }

// List active resources with their per-rep assignments, plus the set of
// active reps for the "restrict to specific reps" picker.
export async function GET() {
  const auth = await requireAdmin()
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status })

  const admin = createAdminClient()
  const { data: resources, error } = await admin
    .from('sales_resources')
    .select('id, title, description, file_name, file_type, file_size, is_active, created_at')
    .eq('is_active', true)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  const { data: assignments } = await admin
    .from('sales_resource_assignments')
    .select('resource_id, rep_id')

  const byResource = new Map<string, string[]>()
  for (const a of assignments ?? []) {
    const rid = a.resource_id as string
    const list = byResource.get(rid) ?? []
    list.push(a.rep_id as string)
    byResource.set(rid, list)
  }

  const { data: reps } = await admin
    .from('sales_reps')
    .select('id, full_name')
    .eq('status', 'active')
    .order('full_name', { ascending: true })

  return NextResponse.json({
    ok: true,
    resources: (resources ?? []).map(r => ({ ...r, assigned_rep_ids: byResource.get(r.id) ?? [] })),
    reps: reps ?? [],
  })
}

// Upload a new resource (PDF or HTML) and optionally restrict it to reps.
export async function POST(req: Request) {
  const auth = await requireAdmin()
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status })

  const form = await req.formData().catch(() => null)
  if (!form) return NextResponse.json({ ok: false, error: 'Multipart form expected' }, { status: 400 })

  const title = String(form.get('title') ?? '').trim()
  const description = String(form.get('description') ?? '').trim()
  const file = form.get('file')

  let repIds: string[] = []
  const repIdsRaw = form.get('repIds')
  if (typeof repIdsRaw === 'string' && repIdsRaw.trim()) {
    try {
      const parsed = JSON.parse(repIdsRaw)
      if (Array.isArray(parsed)) repIds = parsed.filter(x => typeof x === 'string')
    } catch {
      return NextResponse.json({ ok: false, error: 'repIds must be a JSON array' }, { status: 400 })
    }
  }

  if (!title) return NextResponse.json({ ok: false, error: 'Title is required' }, { status: 400 })
  if (!(file instanceof File)) return NextResponse.json({ ok: false, error: 'File is required' }, { status: 400 })
  if (!ALLOWED.has(file.type)) {
    return NextResponse.json({ ok: false, error: 'Only PDF or HTML files are accepted' }, { status: 400 })
  }
  if (file.size > MAX_SIZE) return NextResponse.json({ ok: false, error: 'Max file size is 20MB' }, { status: 400 })

  const admin = createAdminClient()

  // Unique folder so two files with the same name never collide. The real
  // extension and content-type are preserved so the signed URL renders HTML
  // as HTML and PDF as PDF.
  const ts = Date.now()
  const cleanedName = (file.name || `resource.${EXT[file.type]}`)
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .slice(0, 80) || `resource.${EXT[file.type]}`
  const objectPath = `${randomUUID()}/${ts}_${cleanedName}`

  const bytes = await file.arrayBuffer()
  const { error: uploadErr } = await admin.storage
    .from('sales-resources')
    .upload(objectPath, bytes, { contentType: file.type, upsert: false })

  if (uploadErr) {
    return NextResponse.json({ ok: false, error: `Upload failed: ${uploadErr.message}` }, { status: 500 })
  }

  const { data: resource, error: insertErr } = await admin
    .from('sales_resources')
    .insert({
      title,
      description: description || null,
      file_path: objectPath,
      file_name: file.name || cleanedName,
      file_type: file.type,
      file_size: file.size,
      uploaded_by: auth.user.id,
    })
    .select('id')
    .single()

  if (insertErr || !resource) {
    // Clean up the orphaned object so we don't leave a file with no row.
    await admin.storage.from('sales-resources').remove([objectPath]).catch(() => {})
    return NextResponse.json({ ok: false, error: insertErr?.message ?? 'Insert failed' }, { status: 500 })
  }

  if (repIds.length > 0) {
    const rows = repIds.map(rep_id => ({ resource_id: resource.id, rep_id }))
    // Best-effort: if targeting fails the resource still exists (shared with
    // all reps) and the admin can fix it via Manage access.
    const { error: assignErr } = await admin.from('sales_resource_assignments').insert(rows)
    if (assignErr) {
      return NextResponse.json({ ok: true, id: resource.id, warning: `Saved, but assignments failed: ${assignErr.message}` })
    }
  }

  return NextResponse.json({ ok: true, id: resource.id })
}
