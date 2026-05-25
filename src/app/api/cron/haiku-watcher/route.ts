// Haiku cutover watcher — Session 38 hotfix (2026-05-25).
//
// 24/7 server-side replacement for the Claude-Code-side scheduled task
// that previously polled for the first Haiku-scored call. Fires hourly
// at :37 past, sends a single Telegram alert when Haiku has scored its
// first call after the cutover, and self-dedups via a system_alerts row.
//
// Three states:
//   - condition met + not yet alerted → fire Telegram + insert
//                                        system_alerts row + return 'fired'
//   - condition met + already alerted → return 'already_fired' no-op
//   - condition not met                → regression-check Sonnet for any
//                                        post-cutover successful scores;
//                                        flag if non-zero, else 'waiting'

import { NextResponse } from 'next/server'
import { verifyCron } from '@/lib/cron-auth'
import { createAdminClient } from '@/lib/supabase/server'
import { sendAdminTelegram } from '@/lib/notifications'

// Anchor: when SCORING_PROVIDER=haiku flipped in Vercel production.
// Backed by the env-var add log timestamp and the redeploy timestamp on
// dpl_de7vd80bc which went READY at ~04:54 UTC. Conservative cutoff at
// 03:53 UTC matches the original Claude-Code watcher so the two watchers
// see the same window during the brief overlap.
const CUTOVER_ISO = '2026-05-25T03:53:00+00:00'

const HAIKU_MODEL = 'claude-haiku-4-5-20251001'
const SONNET_MODEL = 'claude-sonnet-4-6'

const FIRED_ALERT_TYPE = 'haiku_cutover_confirmed'
const REGRESSION_ALERT_TYPE = 'haiku_cutover_regression'

export async function GET(request: Request) {
  const auth = verifyCron(request)
  if (auth) return auth

  const supabase = createAdminClient()

  // ── 1. Has the watcher already pinged for the cutover?
  const { data: existingAlertRow } = await supabase
    .from('system_alerts')
    .select('id, sent_at')
    .eq('type', FIRED_ALERT_TYPE)
    .limit(1)
    .maybeSingle()

  // ── 2. Look for the first Haiku-scored success row since cutover.
  const { data: firstHaikuRow, error: haikuErr } = await supabase
    .from('call_intelligence_log')
    .select('call_id, status, model, prompt_tokens, completion_tokens, scored_at')
    .eq('model', HAIKU_MODEL)
    .eq('status', 'success')
    .gt('scored_at', CUTOVER_ISO)
    .order('scored_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (haikuErr) {
    console.error('[haiku-watcher] failed to query call_intelligence_log:', haikuErr.message)
    return NextResponse.json(
      { status: 'error', detail: haikuErr.message },
      { status: 500 },
    )
  }

  // ── Branch A: Haiku confirmed, send the one-time alert.
  if (firstHaikuRow && !existingAlertRow) {
    const message = [
      '✅ TalkMate scoring is now on Claude Haiku',
      '',
      `First Haiku-scored call: ${firstHaikuRow.call_id}`,
      `Scored at: ${firstHaikuRow.scored_at}`,
      `Model: ${firstHaikuRow.model}`,
      `Tokens: ${firstHaikuRow.prompt_tokens ?? '?'} in / ${firstHaikuRow.completion_tokens ?? '?'} out`,
      '',
      'Cutover from Sonnet to Haiku is verified. This watcher will not fire again.',
    ].join('\n')

    // Fire the Telegram (best-effort) BEFORE persisting the dedup row.
    // If the Telegram send throws (sendAdminTelegram swallows internally,
    // so this is belt-and-braces), we'd rather alert next run than mark
    // ourselves done and never alert at all.
    await sendAdminTelegram(message)

    const { error: insertErr } = await supabase.from('system_alerts').insert({
      type: FIRED_ALERT_TYPE,
      severity: 'info',
      message: 'Haiku cutover confirmed — first successful scoring detected',
      resolved: true,
      sent_at: new Date().toISOString(),
      resolved_at: new Date().toISOString(),
      metadata: {
        first_call_id: firstHaikuRow.call_id,
        scored_at: firstHaikuRow.scored_at,
        prompt_tokens: firstHaikuRow.prompt_tokens,
        completion_tokens: firstHaikuRow.completion_tokens,
      },
    })

    if (insertErr) {
      // Couldn't persist the dedup row. We've already sent Telegram so
      // a future run might double-send — log loudly and accept that risk;
      // single duplicate is preferable to never confirming.
      console.error('[haiku-watcher] dedup insert failed:', insertErr.message)
    }

    return NextResponse.json({
      status: 'fired',
      first_call_id: firstHaikuRow.call_id,
      scored_at: firstHaikuRow.scored_at,
    })
  }

  // ── Branch B: already fired, no-op.
  if (firstHaikuRow && existingAlertRow) {
    return NextResponse.json({
      status: 'already_fired',
      alerted_at: existingAlertRow.sent_at,
    })
  }

  // ── Branch C: no Haiku scoring yet. Regression check — are we still
  //               running Sonnet successfully? If yes, the cutover env var
  //               isn't picked up by the running deploy and we should alert
  //               Irfan exactly once.
  const { count: sonnetSinceCutover, error: sonnetErr } = await supabase
    .from('call_intelligence_log')
    .select('call_id', { count: 'exact', head: true })
    .eq('model', SONNET_MODEL)
    .eq('status', 'success')
    .gt('scored_at', CUTOVER_ISO)

  if (sonnetErr) {
    console.error('[haiku-watcher] regression check failed:', sonnetErr.message)
    return NextResponse.json(
      { status: 'waiting', regression_check: 'errored', detail: sonnetErr.message },
    )
  }

  // If Sonnet is still scoring, that means the deploy didn't pick up the
  // env var. Send a one-time regression alert (separate dedup type).
  if ((sonnetSinceCutover ?? 0) > 0) {
    const { data: existingRegressionRow } = await supabase
      .from('system_alerts')
      .select('id')
      .eq('type', REGRESSION_ALERT_TYPE)
      .limit(1)
      .maybeSingle()

    if (!existingRegressionRow) {
      await sendAdminTelegram(
        [
          '⚠️ TalkMate scoring REGRESSION',
          '',
          `${sonnetSinceCutover} call(s) scored successfully on Sonnet since the Haiku cutover (${CUTOVER_ISO}).`,
          'The SCORING_PROVIDER=haiku env var may not be applied to the running deploy.',
          'Check the latest production deploy in Vercel and confirm the env var is set + the deploy is newer than the env-var change.',
        ].join('\n'),
      )

      await supabase.from('system_alerts').insert({
        type: REGRESSION_ALERT_TYPE,
        severity: 'warning',
        message: `${sonnetSinceCutover} Sonnet successes since Haiku cutover`,
        resolved: false,
        sent_at: new Date().toISOString(),
        metadata: { sonnet_count: sonnetSinceCutover, cutover: CUTOVER_ISO },
      })
    }
  }

  return NextResponse.json({
    status: 'waiting',
    sonnet_since_cutover: sonnetSinceCutover ?? 0,
  })
}
