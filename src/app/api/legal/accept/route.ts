import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import {
  ALL_LEGAL_DOCS, TOS_VERSION, PRIVACY_VERSION, DPA_VERSION,
  type DocumentType,
} from '@/lib/legal-docs'

// Records acceptance of the three legal documents.
// Body: { signature: string, acceptedDocs?: DocumentType[] }
// If acceptedDocs is omitted, all three docs are recorded (full first-run flow).
//
// Writes:
//   - one row per document into legal_acceptances (immutable audit log)
//   - businesses.tos_accepted_at / tos_accepted_version / tos_signature /
//     tos_ip_address / privacy_accepted_version / dpa_accepted_version
//     (denormalized for fast reads)
export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: 'Your session has expired. Please log in again.', redirect: '/login?next=%2Faccept-terms' }, { status: 401 })

  const body = await req.json().catch(() => ({})) as { signature?: string; acceptedDocs?: DocumentType[] }
  const signature = (body.signature ?? '').trim()
  if (!signature) {
    return NextResponse.json({ ok: false, error: 'Signature is required' }, { status: 400 })
  }

  const docsRequested = body.acceptedDocs && body.acceptedDocs.length > 0
    ? body.acceptedDocs
    : ALL_LEGAL_DOCS.map(d => d.id)

  const admin = createAdminClient()
  const { data: business } = await admin.from('businesses')
    .select('id').eq('owner_user_id', user.id).single()
  if (!business) return NextResponse.json({ ok: false, error: 'No business' }, { status: 404 })

  const ipAddress =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') || null
  const userAgent = req.headers.get('user-agent') || null
  const acceptedAt = new Date().toISOString()

  const versionFor: Record<DocumentType, string> = {
    terms_of_service: TOS_VERSION,
    privacy_policy: PRIVACY_VERSION,
    data_processing_agreement: DPA_VERSION,
  }

  // 1) Insert audit rows. ON CONFLICT not used here because the brief calls
  // for an immutable log — re-acceptance creates a new row, which is correct
  // when the user re-signs after a version bump.
  const rows = docsRequested.map(docType => ({
    client_id: business.id,
    user_id: user.id,
    document_type: docType,
    document_version: versionFor[docType],
    signature,
    accepted_at: acceptedAt,
    ip_address: ipAddress,
    user_agent: userAgent,
  }))

  const { error: insertError } = await admin.from('legal_acceptances').insert(rows)
  if (insertError) {
    return NextResponse.json({ ok: false, error: insertError.message }, { status: 500 })
  }

  // 2) Denormalize the latest acceptance onto businesses.
  const update: Record<string, unknown> = {}
  if (docsRequested.includes('terms_of_service')) {
    update.tos_accepted_at = acceptedAt
    update.tos_accepted_version = TOS_VERSION
    update.tos_signature = signature
    update.tos_ip_address = ipAddress
  }
  if (docsRequested.includes('privacy_policy')) {
    update.privacy_accepted_version = PRIVACY_VERSION
  }
  if (docsRequested.includes('data_processing_agreement')) {
    update.dpa_accepted_version = DPA_VERSION
  }

  if (Object.keys(update).length > 0) {
    const { error: updateError } = await admin.from('businesses').update(update).eq('id', business.id)
    if (updateError) {
      return NextResponse.json({ ok: false, error: updateError.message }, { status: 500 })
    }
  }

  // Invalidate cached server data so the dashboard banner disappears
  // immediately after the user accepts (no manual refresh required).
  revalidatePath('/dashboard')
  revalidatePath('/(portal)', 'layout')

  return NextResponse.json({ ok: true, acceptedAt, recorded: docsRequested })
}
