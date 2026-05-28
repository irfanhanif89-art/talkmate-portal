import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireSalesRep } from '@/lib/sales-auth'
import { sendEmail } from '@/lib/resend'
import { contractSignedEmailHtml, notifyContractSigned } from '@/lib/sales-notify'

export async function POST(req: Request) {
  const auth = await requireSalesRep(req)
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status })

  const body = (await req.json().catch(() => ({}))) as { signer_name?: unknown }
  const typedName = String(body.signer_name ?? '').trim()
  if (!typedName) {
    return NextResponse.json({ ok: false, error: 'Type your full name to confirm your signature' }, { status: 400 })
  }

  // Case-insensitive comparison after collapsing internal whitespace.
  const normalise = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim()
  if (normalise(typedName) !== normalise(auth.rep.full_name)) {
    return NextResponse.json({
      ok: false,
      error: 'Name does not match your account name. Please type your full name exactly.',
    }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data: contract } = await admin
    .from('rep_contracts')
    .select('id, status, document_name')
    .eq('rep_id', auth.rep.id)
    .eq('status', 'pending_signature')
    .order('sent_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!contract) {
    return NextResponse.json({ ok: false, error: 'No contract pending signature' }, { status: 404 })
  }

  // Capture IP + UA. Vercel proxies set x-forwarded-for.
  const headers = req.headers
  const xff = headers.get('x-forwarded-for') ?? ''
  const ip = xff.split(',')[0]?.trim() || headers.get('x-real-ip') || 'unknown'
  const userAgent = headers.get('user-agent') ?? 'unknown'

  const signedAt = new Date().toISOString()

  const { error: contractErr } = await admin
    .from('rep_contracts')
    .update({
      status: 'signed',
      signed_at: signedAt,
      signer_name: typedName,
      ip_address: ip,
      user_agent: userAgent,
    })
    .eq('id', contract.id)

  if (contractErr) {
    return NextResponse.json({ ok: false, error: contractErr.message }, { status: 500 })
  }

  await admin
    .from('sales_reps')
    .update({ contract_signed_at: signedAt })
    .eq('id', auth.rep.id)

  // Best-effort email + Telegram.
  const signedAtFmt = new Date(signedAt).toLocaleString('en-AU', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    timeZone: 'Australia/Brisbane',
  })

  sendEmail({
    to: auth.rep.email,
    subject: 'Contract signed — welcome to the team',
    html: contractSignedEmailHtml({ repName: auth.rep.full_name, signedAt: `${signedAtFmt} AEST` }),
  }).catch(() => {})

  notifyContractSigned({
    repName: auth.rep.full_name,
    signedAt: signedAtFmt,
  }).catch(() => {})

  return NextResponse.json({ ok: true })
}
