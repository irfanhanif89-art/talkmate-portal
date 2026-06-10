# TalkMate — Lessons Learned

Every entry here is a mistake that happened once and must never happen again.
Updated automatically by `/tm-session-wrap` at the end of each session.
Loaded by Claude Code at session start alongside CLAUDE.md.

Format:
- **Date | What broke | Root cause | Rule derived**

---

## Database

**2025 | Uncaught exception on businesses query | Used `.single()` when no row existed**
`.single()` throws an error if zero rows are returned. On the businesses table this
caused unhandled exceptions when a user had no active business record.
Rule: Always `.maybeSingle()` or `.limit(1)` on the businesses table. Never `.single()`.

**2025 | Contact data inconsistency | Wrote directly to `calls.contact_id`**
`calls.contact_id` is a legacy column that was superseded by the `contact_calls` join
table. Writing to it directly caused mismatched contact associations.
Rule: Never write to `calls.contact_id`. Use the `contact_calls` join table exclusively.

**2025 | Vapi call ID failed to save | Stored `call_xxx` string in a UUID column**
Vapi returns call IDs as strings like `call_01abc123` which are not valid UUIDs.
Inserting them into a UUID-typed column caused silent failures or cast errors.
Rule: `vapi_call_id` must always be a TEXT column. Never UUID for external IDs.

**2025 | Wrong business data returned for client | Hardcoded business UUID in component**
A component was written with a hardcoded business UUID during development. When
deployed, it returned the hardcoded client's data for every user.
Rule: Never hardcode business names, UUIDs, or phone numbers in components. Always read from DB.

**2025 | Cancelled clients appearing in active list | Missing account_status filter**
Businesses with `account_status = 'cancelled'` appeared in active client lists because
the query did not filter by status.
Rule: Every businesses query must include `account_status NOT IN ('cancelled', 'expired')`.

**2025 | Silent query failure | Used `owner_id` instead of `owner_user_id`**
The businesses table field is `owner_user_id`. Querying by `owner_id` returned zero
rows silently — no error, just empty results that were misread as "no clients found".
Rule: The field is `businesses.owner_user_id`. There is no `owner_id` column.

**2025 | Non-idempotent migration failed on re-run | No IF NOT EXISTS guard**
A migration that added a column without `IF NOT EXISTS` threw an error when the
Supabase MCP applied it a second time after a partial failure.
Rule: Every migration must be idempotent. Use `ADD COLUMN IF NOT EXISTS`, 
`CREATE TABLE IF NOT EXISTS`, `DROP COLUMN IF EXISTS` throughout.

---

## Security

**2025 | VAPI_WEBHOOK_SECRET check missing | New webhook route added without auth check**
A new route at `/api/vapi/functions` was added without verifying `VAPI_WEBHOOK_SECRET`.
It returned 500 in production because the check is required and the secret was unset.
Rule: Every `/api/vapi/` route must check `VAPI_WEBHOOK_SECRET` and return 500 if unset.

**2025 | Retention job silently skipped | DRY_RUN_RETENTION left set from testing**
`DRY_RUN_RETENTION` was set during a test run and never cleared. The production retention
job ran but did nothing. No error was logged.
Rule: `DRY_RUN_RETENTION` must always be unset in all environments. Check before every deploy.

---

## API / Models

**2026 | API errors in production | `grok-2-latest` model identifier used**
`grok-2-latest` was deprecated. Calls to it returned model-not-found errors.
Rule: Always `grok-3`. Never `grok-2-latest`.

**2026 | API errors in production | `claude-sonnet-4-20250514` model identifier used**
`claude-sonnet-4-20250514` was deprecated. Calls to it failed silently in some contexts.
Rule: Always `claude-sonnet-4-6`. Never `claude-sonnet-4-20250514`.

---

## Session Notes

**2026-06-11 | RLS-disabled tables flagged by Supabase | created by direct SQL, never via a migration | verify RLS with the LIVE advisor, not migration files**
The Supabase security advisor (08 Jun 2026) flagged RLS-disabled public tables. Migrations
053-056 had already hardened RLS; the two that remained — `demo_tts` (prod) and
`webhook_debug` (preview) — were created by direct SQL / the dashboard and never appeared
in any migration file, so a file-based check can never see them.
Rule: every public table needs RLS + a policy regardless of how it was created. Verify with
`npm run rls-audit` (live Supabase advisor), not by reading migration files.

**2026-06-11 | RLS policy would lock users out | unqualified get_current_client_id() | always private.get_current_client_id()**
A draft fix used `client_id = get_current_client_id()`. Migration 056 moved that helper to
the `private` schema, so an unqualified call resolves there (not `public`) and throws for
anon/authenticated inside an RLS policy → permission denied for legitimate users.
Rule: always `private.get_current_client_id()`. Never the unqualified form.

**2026-06-11 | Stale brief nearly overwrote a live migration | hardcoded migration number 038 | claim the next free number at build time**
A security brief said "create migration 038" from an old snapshot; 038
(`contractor_agreement_flow`) was already shipped and the repo was at 081.
Rule: never hardcode a migration number — claim the true next free number at build time
(check `supabase/migrations/` + SYSTEM_MAP.md, and any unmerged sibling sessions).

**2026-06-11 | Data-deleting RPCs callable unauthenticated | SECURITY DEFINER fns with PUBLIC/anon EXECUTE | revoke EXECUTE from PUBLIC/anon/authenticated on non-helper definer fns**
`app_purge_business` / `app_purge_sales_rep` (which DELETE account data),
`kb_entries_mark_pending`, and `increment_sms_used` were `SECURITY DEFINER` and reachable
over `/rest/v1/rpc` by anon/authenticated, though only ever called server-side via the
service-role admin client (or as triggers).
Rule: revoke EXECUTE from PUBLIC/anon/authenticated on any SECURITY DEFINER function that is
not an RLS helper. The RLS helpers (current_rep_id/get_current_client_id/is_super_admin) are
the deliberate exception (now in the private schema).

<!-- Add new lessons here after each session using the format above -->
<!-- /tm-session-wrap will prompt you to add any new lessons discovered -->
