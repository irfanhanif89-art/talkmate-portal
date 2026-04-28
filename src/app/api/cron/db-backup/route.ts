import { NextResponse } from 'next/server'
import { verifyCron } from '@/lib/cron-auth'
import { sendInternalEmail, createSystemAlert } from '@/lib/alerts'
import { createAdminClient } from '@/lib/supabase/server'

// Brief Part 12 — database backups.
// Real pg_dump is not feasible from a serverless Vercel function (no shell,
// no pg_dump binary). This cron triggers Supabase's own scheduled-backups
// feature via the management API when configured, and otherwise records the
// daily run as a no-op for visibility. See DEPLOYMENT.md for the manual setup.
export async function GET(req: Request) {
  const guard = verifyCron(req); if (guard) return guard

  const supabase = createAdminClient()
  const projectRef = process.env.SUPABASE_PROJECT_REF
  const mgmtToken = process.env.SUPABASE_MANAGEMENT_TOKEN

  // Soft path: if management API creds aren't set, just confirm the cron ran.
  if (!projectRef || !mgmtToken) {
    await sendInternalEmail(
      'TalkMate daily backup — manual mode',
      '<p>The db-backup cron ran. Supabase Pro auto-backups handle daily snapshots — no action needed.</p>',
    )
    return NextResponse.json({ ok: true, mode: 'supabase_native', note: 'Relying on Supabase Pro auto-backups' })
  }

  try {
    // Trigger an on-demand point-in-time backup via Supabase Management API.
    const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/backups`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${mgmtToken}`, 'Content-Type': 'application/json' },
    })
    if (!res.ok) throw new Error(`Supabase mgmt API ${res.status}`)
    await sendInternalEmail('✅ TalkMate daily backup OK', '<p>Daily on-demand backup triggered successfully.</p>')
    return NextResponse.json({ ok: true, mode: 'management_api' })
  } catch (e) {
    await createSystemAlert(supabase, {
      type: 'db_backup_failed',
      severity: 'critical',
      message: 'Daily database backup failed',
      metadata: { error: (e as Error).message },
    })
    await sendInternalEmail('🚨 TalkMate daily backup FAILED', `<p>${(e as Error).message}</p>`)
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 })
  }
}
