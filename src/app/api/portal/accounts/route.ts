import { NextResponse } from 'next/server'
import { requireClient } from '@/lib/portal-auth'

// Accounts share the vip_callers table but are filtered by account_type.
// The Accounts tab on /vip-callers reads through this endpoint so it
// never has to dig past account_type='account'.

interface LinkedNumber {
  phone: string
  name?: string | null
  is_primary?: boolean
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

function pickPrimary(numbers: LinkedNumber[]): string {
  const primary = numbers.find(n => n.is_primary)
  return primary?.phone ?? numbers[0]?.phone ?? ''
}

export async function GET() {
  const auth = await requireClient()
  if ('error' in auth) return auth.error
  const { supabase } = auth

  const { data, error } = await supabase
    .from('vip_callers')
    .select('*')
    .eq('account_type', 'account')
    .order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ accounts: data ?? [] })
}

export async function POST(request: Request) {
  const auth = await requireClient()
  if ('error' in auth) return auth.error
  const { supabase, clientId } = auth

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const companyName = String(body.company_name ?? '').trim()
  if (!companyName) {
    return NextResponse.json({ error: 'company_name required' }, { status: 400 })
  }
  const linked = cleanLinkedNumbers(body.linked_numbers)
  const phone = pickPrimary(linked)
  if (!phone) {
    return NextResponse.json({ error: 'At least one linked phone number is required' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('vip_callers')
    .insert({
      client_id: clientId,
      account_type: 'account',
      vip_bypass: false,
      phone,
      name: companyName,
      note: typeof body.note === 'string' ? body.note : null,
      action: 'take_message', // accounts do not bypass; agent handles normally
      company_name: companyName,
      abn: typeof body.abn === 'string' ? body.abn.trim() || null : null,
      billing_contact_name: typeof body.billing_contact_name === 'string' ? body.billing_contact_name.trim() || null : null,
      billing_contact_email: typeof body.billing_contact_email === 'string' ? body.billing_contact_email.trim() || null : null,
      linked_numbers: linked,
      active: body.active === false ? false : true,
    })
    .select('*')
    .single()
  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'A VIP or account already uses this primary phone number.' }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ account: data })
}
