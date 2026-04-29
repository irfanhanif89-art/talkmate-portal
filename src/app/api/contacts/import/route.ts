import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { refreshSmartListCounts } from '@/lib/smart-lists'

interface ImportRow {
  name?: string
  phone?: string
  email?: string
  notes?: string
  tags?: string
}

function normalizePhone(raw: string): string | null {
  let cleaned = raw.replace(/[\s\-\(\)\.]/g, '')
  if (!cleaned) return null
  if (cleaned.startsWith('+61')) return cleaned
  if (cleaned.startsWith('04')) return '+61' + cleaned.slice(1)
  if (cleaned.startsWith('0')) return '+61' + cleaned.slice(1)
  if (cleaned.startsWith('61')) return '+' + cleaned
  if (cleaned.length === 9) return '+61' + cleaned
  return null
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false }, { status: 401 })
  const { data: business } = await supabase.from('businesses').select('id').eq('owner_user_id', user.id).single()
  if (!business) return NextResponse.json({ ok: false, error: 'No business' }, { status: 404 })

  const body = await req.json().catch(() => null) as { rows?: ImportRow[] } | null
  if (!body?.rows) return NextResponse.json({ ok: false, error: 'Missing rows' }, { status: 400 })

  const admin = createAdminClient()
  let imported = 0, updated = 0, skipped = 0

  for (const row of body.rows) {
    const phone = row.phone ? normalizePhone(row.phone) : null
    if (!phone) { skipped++; continue }

    const tags = (row.tags ?? '').split(',').map(t => t.trim()).filter(Boolean)

    const { data: existing } = await admin.from('contacts')
      .select('id, name, email, tags').eq('client_id', business.id).eq('phone', phone).eq('is_merged', false).maybeSingle()

    if (existing) {
      const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
      if (!existing.name && row.name) update.name = row.name
      if (!existing.email && row.email) update.email = row.email
      if (row.notes) update.notes = row.notes
      if (tags.length > 0) {
        update.tags = Array.from(new Set([...(existing.tags ?? []), ...tags]))
      }
      if (Object.keys(update).length > 1) {
        await admin.from('contacts').update(update).eq('id', existing.id)
        updated++
      } else {
        skipped++
      }
    } else {
      const { error } = await admin.from('contacts').insert({
        client_id: business.id,
        phone,
        name: row.name || null,
        email: row.email || null,
        notes: row.notes || null,
        tags,
        first_seen: new Date().toISOString(),
        last_seen: new Date().toISOString(),
        call_count: 0,
      })
      if (error) skipped++
      else imported++
    }
  }

  refreshSmartListCounts(admin, business.id).catch(e => console.error('[import] smart-list refresh', e))

  return NextResponse.json({ ok: true, imported, updated, skipped })
}
