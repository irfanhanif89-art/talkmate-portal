// Session 43 — admin-editable sprint config.
//
// Reads / writes the three sales-pipeline settings as a single
// composite resource. Backed by the admin_settings table (migration 052).
// Used by the Sales Pipeline page header and the EditSprintModal.
//
// Keys exposed: sales_sprint_start, sales_sprint_end, sales_mrr_target.
// Date strings are validated as YYYY-MM-DD (the format the table stores).
// Target is validated as a positive integer.

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/admin-auth'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

interface SprintSettings {
  sprint_start: string | null
  sprint_end: string | null
  mrr_target: number | null
}

async function loadSprintSettings(): Promise<SprintSettings> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('admin_settings')
    .select('key, value')
    .in('key', ['sales_sprint_start', 'sales_sprint_end', 'sales_mrr_target'])
  const map = new Map((data ?? []).map(r => [r.key as string, r.value as string]))
  const targetRaw = map.get('sales_mrr_target')
  const target = targetRaw ? Number.parseInt(targetRaw, 10) : null
  return {
    sprint_start: map.get('sales_sprint_start') ?? null,
    sprint_end: map.get('sales_sprint_end') ?? null,
    mrr_target: target && Number.isFinite(target) ? target : null,
  }
}

export async function GET() {
  const auth = await requireAdmin()
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status })
  const settings = await loadSprintSettings()
  return NextResponse.json({ ok: true, ...settings })
}

export async function PUT(req: Request) {
  const auth = await requireAdmin()
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status })

  const body = (await req.json().catch(() => ({}))) as {
    sprint_start?: unknown
    sprint_end?: unknown
    mrr_target?: unknown
  }
  const start = typeof body.sprint_start === 'string' ? body.sprint_start.trim() : null
  const end = typeof body.sprint_end === 'string' ? body.sprint_end.trim() : null
  const targetRaw = body.mrr_target
  const target = typeof targetRaw === 'number'
    ? targetRaw
    : typeof targetRaw === 'string' && targetRaw.trim() !== ''
    ? Number.parseInt(targetRaw, 10)
    : null

  if (!start || !DATE_RE.test(start)) {
    return NextResponse.json({ ok: false, error: 'sprint_start must be YYYY-MM-DD' }, { status: 400 })
  }
  if (!end || !DATE_RE.test(end)) {
    return NextResponse.json({ ok: false, error: 'sprint_end must be YYYY-MM-DD' }, { status: 400 })
  }
  if (start > end) {
    return NextResponse.json({ ok: false, error: 'sprint_start must be on or before sprint_end' }, { status: 400 })
  }
  if (target === null || !Number.isFinite(target) || target <= 0) {
    return NextResponse.json({ ok: false, error: 'mrr_target must be a positive integer' }, { status: 400 })
  }

  const admin = createAdminClient()
  const updatedAt = new Date().toISOString()
  const upserts = [
    { key: 'sales_sprint_start', value: start, updated_at: updatedAt, updated_by: auth.user.id },
    { key: 'sales_sprint_end',   value: end,   updated_at: updatedAt, updated_by: auth.user.id },
    { key: 'sales_mrr_target',   value: String(target), updated_at: updatedAt, updated_by: auth.user.id },
  ]
  const { error } = await admin
    .from('admin_settings')
    .upsert(upserts, { onConflict: 'key' })
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, sprint_start: start, sprint_end: end, mrr_target: target })
}
