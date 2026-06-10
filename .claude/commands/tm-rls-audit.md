Run a full Row-Level Security audit across both Supabase projects and report any
public table with RLS disabled (or enabled with no policy).

This uses the LIVE Supabase security advisor — the same source as the Supabase
alert email — not a scan of migration files. That is deliberate: the tables that
triggered the 08 Jun 2026 alert were created by direct SQL and never appeared in a
migration file, so only a live-DB check catches them.

## How to run
- Preferred: `npm run rls-audit` (needs `SUPABASE_ACCESS_TOKEN` in env).
  Wraps `scripts/security/rls-advisor-check.mjs`, checks production
  (`mdsfdaefsxwrakgkyflr`) and preview (`rgifivtzmjvanzqwgadq`), exits non-zero on
  any blocking finding.
- If a token is not available in this environment, run the Supabase MCP
  `get_advisors(type: "security")` against each project instead.

## What counts as a CRITICAL (blocking) finding
- `rls_disabled_in_public` — a public table with RLS off. Fix in a migration:
  enable RLS + add the correct policy (see `_TEMPLATE_new_table.sql`).
- `rls_enabled_no_policy` — RLS on but no policy (a locked, fail-closed table). Add
  the `service_role_only` restrictive policy if it is service-role-only data.

## NOT blocking (do not flag these as failures)
- The RLS-helper functions (`current_rep_id`, `get_current_client_id`,
  `is_super_admin`) being executable — intentional (migration 054), now in the
  `private` schema. The audit script already allowlists them.

## When to run
- At the end of any session that adds a migration or makes a direct Supabase SQL edit.
- After any direct Supabase dashboard change.
- Any time Irfan asks "are we secure?".
- As part of `/tm-deploy-check`.

## After running
Log the result (timestamp + per-project PASS/CRITICAL) to DEPLOYMENT.md.
