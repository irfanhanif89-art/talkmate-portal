// Admin audit log helper — Session 11.
//
// Every state-changing admin action on a client account writes a row
// here so we have an append-only record of who did what, when, and to
// which business. Service-role only (no RLS on admin_audit_log) so
// requireAdmin() in the calling route is what gates writes.
//
// Design choices:
//   * Fire-and-forget by default. A logging failure must NEVER abort
//     the user-facing action that triggered it. Failures hit
//     console.error so they surface in Vercel logs.
//   * Best-effort IP capture from the most common forwarded headers.
//     Request is optional so it works from cron / background jobs too.
//   * before/after JSON snapshots are deliberately small — we strip
//     sensitive fields (notifications_config, etc.) at the call site
//     when needed, but the helper is content-agnostic.

import type { NextRequest } from 'next/server'
import { createAdminClient } from './supabase/server'

export interface AuditLogParams {
  adminEmail: string
  action: AuditAction | (string & {})
  businessId?: string | null
  businessName?: string | null
  before?: Record<string, unknown> | null
  after?: Record<string, unknown> | null
  ipAddress?: string | null
  request?: Request | NextRequest | null
}

export type AuditAction =
  | 'client_created'
  | 'client_updated'
  | 'plan_changed'
  | 'account_status_changed'
  | 'trial_started'
  | 'trial_converted'
  | 'trial_ended'
  | 'trial_extended'
  | 'trial_reactivated'
  | 'dispatch_toggled'
  | 'dispatch_config_updated'
  | 'team_member_added'
  | 'team_member_updated'
  | 'team_member_removed'
  | 'data_retention_purge'
  | 'data_retention_dry_run'
  // Session 47 — rep / contractor profile edits. Rep-centric entries set
  // `business_id` to NULL (no FK to a businesses row) and embed the
  // sales_rep.id + contractor.id in `after_value._rep_id` /
  // `_contractor_id` so the audit log query can still cross-reference.
  | 'rep_profile_self_update'
  | 'rep_profile_admin_update'
  | 'rep_email_changed_by_admin'

export async function logAdminAction(params: AuditLogParams): Promise<void> {
  try {
    const supabase = createAdminClient()
    const ip = params.ipAddress ?? extractIp(params.request ?? null)
    await supabase.from('admin_audit_log').insert({
      admin_email: params.adminEmail,
      action: params.action,
      business_id: params.businessId ?? null,
      business_name: params.businessName ?? null,
      before_value: params.before ?? null,
      after_value: params.after ?? null,
      ip_address: ip,
    })
  } catch (e) {
    // Never throw — audit logging must not break the calling action.
    console.error('[audit] logAdminAction failed', (e as Error).message)
  }
}

// Compute a diff of changed fields between two objects, suitable for
// passing as before/after to logAdminAction. Only includes keys that
// actually differ — keeps the audit log compact.
export function diffFields(
  before: Record<string, unknown> | null | undefined,
  after: Record<string, unknown> | null | undefined,
  keys?: string[],
): { before: Record<string, unknown>; after: Record<string, unknown> } {
  const b = before ?? {}
  const a = after ?? {}
  const keySet = keys ?? Array.from(new Set([...Object.keys(b), ...Object.keys(a)]))
  const beforeOut: Record<string, unknown> = {}
  const afterOut: Record<string, unknown> = {}
  for (const k of keySet) {
    if (!shallowEqual(b[k], a[k])) {
      beforeOut[k] = b[k]
      afterOut[k] = a[k]
    }
  }
  return { before: beforeOut, after: afterOut }
}

function shallowEqual(x: unknown, y: unknown): boolean {
  if (x === y) return true
  if (x == null || y == null) return x === y
  if (typeof x !== typeof y) return false
  if (typeof x !== 'object') return false
  try {
    return JSON.stringify(x) === JSON.stringify(y)
  } catch {
    return false
  }
}

function extractIp(req: Request | NextRequest | null): string | null {
  if (!req) return null
  const headers = req.headers
  const xff = headers.get('x-forwarded-for')
  if (xff) {
    // x-forwarded-for can be a comma-separated chain; the first entry
    // is the original client.
    return xff.split(',')[0]?.trim() ?? null
  }
  const xreal = headers.get('x-real-ip')
  if (xreal) return xreal.trim()
  return null
}
