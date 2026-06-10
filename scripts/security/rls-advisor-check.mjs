#!/usr/bin/env node
// rls-advisor-check.mjs — DB-advisor-based RLS gate (Security Session, 2026-06-11).
//
// WHY THIS EXISTS, AND WHY IT IS NOT A MIGRATION-FILE REGEX:
// The Supabase alert of 08 Jun 2026 was triggered by two tables (demo_tts,
// webhook_debug) that were created by DIRECT SQL / the dashboard, never through a
// migration file. A regex over supabase/migrations/ is blind to those. The only
// reliable detector is the live Supabase security advisor — the exact source of the
// alert email — so this script queries it directly for both projects and fails CI
// if any public table is RLS-disabled (or RLS-enabled with no policy).
//
// AUTH: needs a Supabase personal access token in env SUPABASE_ACCESS_TOKEN
//   (Account > Access Tokens). In CI, add it as a repository secret. No DB password
//   or service-role key required — this only reads advisor output.
//
// USAGE:
//   SUPABASE_ACCESS_TOKEN=sbp_xxx node scripts/security/rls-advisor-check.mjs
//   npm run rls-audit
// Optional overrides:
//   RLS_AUDIT_PROJECTS="prod=mdsfdaefsxwrakgkyflr,preview=rgifivtzmjvanzqwgadq"
//
// EXIT CODES: 0 = pass (no blocking findings), 1 = blocking finding, 2 = setup error.

const DEFAULT_PROJECTS = [
  { label: 'production', ref: 'mdsfdaefsxwrakgkyflr' },
  { label: 'preview', ref: 'rgifivtzmjvanzqwgadq' },
]

// Findings that BLOCK the build. These are the genuine "data exposed" classes.
const BLOCKING_LINTS = new Set(['rls_disabled_in_public', 'rls_enabled_no_policy'])

// Known-intentional advisor warnings we do NOT block on. The RLS-helper functions
// (current_rep_id / get_current_client_id / is_super_admin) are referenced inside
// RLS policies and were deliberately kept executable (migration 054) before being
// moved to the private schema (migration 056). Do not let them fail the gate.
const ALLOWLISTED_FUNCTIONS = new Set([
  'current_rep_id',
  'get_current_client_id',
  'is_super_admin',
])

function parseProjects() {
  const raw = process.env.RLS_AUDIT_PROJECTS
  if (!raw) return DEFAULT_PROJECTS
  return raw.split(',').map((pair) => {
    const [label, ref] = pair.split('=').map((s) => s.trim())
    return { label, ref }
  })
}

async function fetchSecurityAdvisors(ref, token) {
  const url = `https://api.supabase.com/v1/projects/${ref}/advisors/security`
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) {
    throw new Error(`advisor API ${res.status} ${res.statusText} for project ${ref}`)
  }
  const json = await res.json()
  return Array.isArray(json.lints) ? json.lints : []
}

function isBlocking(lint) {
  if (!BLOCKING_LINTS.has(lint.name)) return false
  const fnName = lint?.metadata?.name
  if (lint.metadata?.type === 'function' && ALLOWLISTED_FUNCTIONS.has(fnName)) return false
  return true
}

async function main() {
  const token = process.env.SUPABASE_ACCESS_TOKEN
  if (!token) {
    console.error('[rls-audit] SETUP ERROR: SUPABASE_ACCESS_TOKEN is not set.')
    console.error('  Create one at Supabase > Account > Access Tokens and export it,')
    console.error('  or add it as a CI secret. This script only reads advisor output.')
    process.exit(2)
  }

  const projects = parseProjects()
  const stamp = new Date().toISOString()
  console.log(`RLS AUDIT — ${stamp}`)
  console.log('='.repeat(60))

  let blockingTotal = 0
  for (const { label, ref } of projects) {
    let lints
    try {
      lints = await fetchSecurityAdvisors(ref, token)
    } catch (err) {
      console.error(`${label} (${ref}): ERROR fetching advisors — ${err.message}`)
      blockingTotal++
      continue
    }

    const blocking = lints.filter(isBlocking)
    const otherSecurity = lints.filter((l) => !isBlocking(l))

    console.log(`\n${label} (${ref}):`)
    if (blocking.length === 0) {
      console.log('  PASS — no RLS-disabled or no-policy public tables')
    } else {
      for (const l of blocking) {
        console.log(`  CRITICAL — ${l.name}: ${l.detail}`)
      }
    }
    if (otherSecurity.length) {
      console.log(`  (info: ${otherSecurity.length} non-blocking advisor notice(s) — review separately)`)
    }
    blockingTotal += blocking.length
  }

  console.log('\n' + '='.repeat(60))
  if (blockingTotal > 0) {
    console.log(`RESULT: ${blockingTotal} BLOCKING ISSUE(S) FOUND`)
    process.exit(1)
  }
  console.log('RESULT: PASS')
  process.exit(0)
}

main().catch((err) => {
  console.error('[rls-audit] unexpected error:', err)
  process.exit(2)
})
