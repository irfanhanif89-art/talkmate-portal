import { NextResponse } from 'next/server'
import { requireSalesRep } from '@/lib/sales-auth'
import { createAdminClient } from '@/lib/supabase/server'
import { sendDemoBookingInviteEmail } from '@/lib/sales-notify'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireSalesRep(request)
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }

    const { id: leadId } = await params

    const body = await request.json().catch(() => ({})) as {
      prospect_name?: string
      prospect_email?: string
    }

    if (!body.prospect_email || !EMAIL_RE.test(body.prospect_email)) {
      return NextResponse.json({ error: 'invalid_email' }, { status: 400 })
    }

    const supabase = createAdminClient()

    // Fetch lead
    const { data: lead, error: leadError } = await supabase
      .from('leads')
      .select('id, assigned_to, business_name, contact_name, email, status')
      .eq('id', leadId)
      .single()

    if (leadError || !lead) {
      return NextResponse.json({ error: 'lead_not_found' }, { status: 404 })
    }

    if (lead.assigned_to !== auth.rep.id) {
      return NextResponse.json({ error: 'not_assigned_to_you' }, { status: 403 })
    }

    // Fetch rep row with demo_calendly_url
    const { data: rep, error: repError } = await supabase
      .from('sales_reps')
      .select('id, full_name, email, phone, notification_email, demo_calendly_url')
      .eq('id', auth.rep.id)
      .single()

    if (repError || !rep) {
      return NextResponse.json({ error: 'internal' }, { status: 500 })
    }

    const calendlyUrl: string =
      (rep as { demo_calendly_url?: string | null }).demo_calendly_url ||
      process.env.NEXT_PUBLIC_DEMO_CALENDLY_URL ||
      ''

    if (!calendlyUrl) {
      return NextResponse.json({ error: 'no_calendly_url' }, { status: 400 })
    }

    const prospectName = body.prospect_name?.trim() || lead.contact_name || lead.business_name
    const prospectEmail = body.prospect_email

    // Send email
    await sendDemoBookingInviteEmail({
      toEmail: prospectEmail,
      prospectName,
      calendlyUrl,
      repFullName: rep.full_name,
      repReplyToEmail: (rep as { notification_email?: string | null }).notification_email || rep.email,
    })

    // Update lead status
    await supabase
      .from('leads')
      .update({ status: 'demo_booked' })
      .eq('id', leadId)

    // Insert lead activity
    await supabase.from('lead_activities').insert({
      lead_id: leadId,
      rep_id: rep.id,
      activity_type: 'demo',
      title: 'Demo invite sent',
      body: 'Demo booking invite sent to ' + prospectEmail,
      new_status: 'demo_booked',
      old_status: lead.status,
    })

    // Insert rep notification
    await supabase.from('rep_notifications').insert({
      rep_id: rep.id,
      type: 'demo_booked',
      lead_id: leadId,
      message: 'Demo invite sent to ' + prospectName,
    })

    return NextResponse.json({ ok: true, calendly_url: calendlyUrl })
  } catch (err) {
    console.error('[book-demo]', err)
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }
}
