import { NextResponse } from 'next/server'
import { requireDispatchAccess } from '@/lib/portal-auth'

export async function GET() {
  const auth = await requireDispatchAccess()
  if ('error' in auth) return auth.error
  const { supabase } = auth
  const { data, error } = await supabase
    .from('vehicles').select('*').order('created_at', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ vehicles: data ?? [] })
}

export async function POST(request: Request) {
  const auth = await requireDispatchAccess()
  if ('error' in auth) return auth.error
  const { supabase, clientId } = auth
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const name = String(body.name ?? '').trim()
  const type = String(body.type ?? '').trim()
  if (!name || !type) return NextResponse.json({ error: 'name and type are required' }, { status: 400 })

  const capabilities = Array.isArray(body.capabilities)
    ? (body.capabilities as unknown[]).filter(x => typeof x === 'string')
    : []

  const { data, error } = await supabase
    .from('vehicles')
    .insert({
      client_id: clientId,
      name, type,
      registration: (body.registration as string | undefined)?.trim() || null,
      capabilities,
      capacity_notes: (body.capacity_notes as string | undefined)?.trim() || null,
      active: body.active === false ? false : true,
    })
    .select('*')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ vehicle: data })
}
