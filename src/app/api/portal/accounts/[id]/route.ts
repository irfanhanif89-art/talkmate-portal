import { NextResponse } from 'next/server'
import { requireClient } from '@/lib/portal-auth'

interface LinkedNumber {
  phone: string
  name: string | null
  is_primary: boolean
}

function cleanLinkedNumbers(input: unknown): LinkedNumber[] {
  if (!Array.isArray(input)) return []
  return input
    .map(entry => {
      if (!entry || typeof entry !== 'object') return null
      const e = entry as Record<string, unknown>
      const phone = String(e.phone ?? '').trim()
      if (!phone) return null
      return {
        phone,
        name: typeof e.name === 'string' ? e.name : null,
        is_primary: e.is_primary === true,
      }
    })
    .filter((x): x is LinkedNumber => x !== null)
    .slice(0, 30)
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireClient()
  if ('error' in auth) return auth.error
  const { supabase, clientId } = auth
  const { id } = await params

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const update: Record<string, unknown> = {}
  if (typeof body.company_name === 'string') {
    const v = body.company_name.trim()
    if (v) { update.company_name = v; update.name = v }
  }
  if (typeof body.abn === 'string') update.abn = body.abn.trim() || null
  if (typeof body.billing_contact_name === 'string') update.billing_contact_name = body.billing_contact_name.trim() || null
  if (typeof body.billing_contact_email === 'string') update.billing_contact_email = body.billing_contact_email.trim() || null
  if (typeof body.note === 'string') update.note = body.note.trim() || null
  if (typeof body.active === 'boolean') update.active = body.active
  if (body.linked_numbers !== undefined) {
    const linked = cleanLinkedNumbers(body.linked_numbers)
    update.linked_numbers = linked
    const primary = linked.find(n => n.is_primary) ?? linked[0]
    if (primary) update.phone = primary.phone
  }
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('vip_callers')
    .update(update)
    .eq('id', id)
    .eq('client_id', clientId)
    .eq('account_type', 'account')
    .select('*')
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Account not found' }, { status: 404 })
  return NextResponse.json({ account: data })
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireClient()
  if ('error' in auth) return auth.error
  const { supabase, clientId } = auth
  const { id } = await params

  const { error } = await supabase
    .from('vip_callers')
    .delete()
    .eq('id', id)
    .eq('client_id', clientId)
    .eq('account_type', 'account')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
