import { NextResponse } from 'next/server'
import { requireClient } from '@/lib/portal-auth'

// Session 19 — messages-after-this-call lookup for the client transcript
// modal. Returns sms_log rows linked to the call_id, plus rows in the
// 10-minute window after the call ended (deduped by id). Admin-only
// types and "failed" rows are stripped before responding.

export const dynamic = 'force-dynamic'

const ADMIN_ONLY_TYPES = new Set(['call_intelligence_alert'])

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireClient()
  if ('error' in auth) return auth.error
  const { supabase, clientId } = auth
  const { id: callId } = await params

  // Pull the parent call so we have the time window. RLS scopes it to
  // the calling client.
  const { data: call } = await supabase
    .from('calls')
    .select('id, business_id, ended_at, created_at')
    .eq('id', callId)
    .maybeSingle()

  if (!call) return NextResponse.json({ messages: [] })

  const callEndIso = (call as { ended_at: string | null; created_at: string }).ended_at
    ?? (call as { created_at: string }).created_at
  const windowEndIso = new Date(Date.parse(callEndIso) + 10 * 60 * 1000).toISOString()

  // Two queries in parallel: linked-by-id and in-window. Dedupe by id.
  const [linkedRes, windowRes] = await Promise.all([
    supabase
      .from('sms_log')
      .select('id, to_phone, message, sms_type, status, sent_at')
      .eq('call_id', callId),
    supabase
      .from('sms_log')
      .select('id, to_phone, message, sms_type, status, sent_at')
      .eq('client_id', clientId)
      .gte('sent_at', callEndIso)
      .lte('sent_at', windowEndIso),
  ])

  const seen = new Set<string>()
  type Row = { id: string; to_phone: string | null; message: string; sms_type: string | null; status: string | null; sent_at: string | null }
  const merged: Row[] = []
  for (const r of [...((linkedRes.data ?? []) as Row[]), ...((windowRes.data ?? []) as Row[])]) {
    if (seen.has(r.id)) continue
    seen.add(r.id)
    if (r.sms_type && ADMIN_ONLY_TYPES.has(r.sms_type)) continue
    merged.push(r)
  }
  merged.sort((a, b) => (a.sent_at ?? '').localeCompare(b.sent_at ?? ''))

  return NextResponse.json({ messages: merged })
}
