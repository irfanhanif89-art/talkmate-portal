# TalkMate Portal — Claude Code Session Memory

> This file is auto-loaded by Claude Code on every session start.
> Full system state lives in SYSTEM_MAP.md — always fetch it before writing code.

---

## SESSION START CHECKLIST
Before writing a single line of code, in order:
1. `cd "C:\Users\info\.claude\WEBSITE BUILD\talkmate-portal"`
2. `cat SYSTEM_MAP.md` — get current migration number, branch state, known gaps
3. `git status` + `git log --oneline -5` — confirm you are NOT on main
4. If building a new feature, run `/tm-plan "feature description"` before touching any file

---

## Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 14 App Router (TypeScript) |
| Database | Supabase PostgreSQL, Sydney ap-southeast-2 |
| Hosting | Vercel (prj_loxPaAwjRW2VV4qxQP7qpu7iq68k) |
| Voice AI | Vapi + ElevenLabs |
| SMS / Phone | Twilio |
| Payments | Stripe (live — real money) |
| Email | Resend |
| Automation | Make.com |
| AI Scoring | claude-sonnet-4-6 (default) or grok-3 via SCORING_PROVIDER env var |
| Auth | Supabase Auth (JWT) |

**Supabase projects:**
- Production: `mdsfdaefsxwrakgkyflr`
- Preview: `rgifivtzmjvanzqwgadq`

**Working directory (one canonical location — no other copies exist):**
`C:\Users\info\.claude\WEBSITE BUILD\talkmate-portal`

---

## Current State

Update this section at the end of every session via `/tm-session-wrap`.

- **Next migration:** 077
- **Main SHA:** da38be3
- **Active clients:** GM Towing (biz: `df0ab1a1`, vapi: `25443e10`), Spectrum Towing (biz: `18a8f78e`, vapi: `8121a8b0`)
- **HELD — do not merge:** PR #119 identity block injection (branch: `feature/session-4a-round2`)

---

## Engineering Rules — ABSOLUTE. NEVER VIOLATE.

1. NEVER use `.single()` on the `businesses` table — use `.maybeSingle()` or `.limit(1)`
2. NEVER hardcode business data in components — always read from DB
3. NEVER push to `main` without Irfan's explicit approval — always work on `dev` or feature branches
4. NEVER create a second `businesses` record for the same `owner_user_id`
5. NEVER use partial UNIQUE indexes on the `businesses` table
6. NEVER store Vapi `call_xxx` IDs in UUID columns — use `vapi_call_id TEXT` column
7. NEVER write to `calls.contact_id` — use the `contact_calls` join table
8. NEVER leave `DRY_RUN_RETENTION` set — must be unset/empty in all environments
9. NEVER expose secrets with `NEXT_PUBLIC_` prefix (service role key, Stripe secret, Vapi API key)
10. NEVER use `grok-2-latest` — use `grok-3`
11. NEVER use `claude-sonnet-4-20250514` — use `claude-sonnet-4-6`
12. NEVER filter `businesses` without `account_status NOT IN ('cancelled', 'expired')`
13. `VAPI_WEBHOOK_SECRET` MUST be verified on `/api/vapi/functions` — 500 if unset
14. Field is `businesses.owner_user_id` — not `owner_id`
15. `account_status` valid values ONLY: `pending`, `active`, `suspended`, `cancelled`, `expired`

---

## Schema Quick Reference

| Table | Key field | Notes |
|-------|-----------|-------|
| businesses | owner_user_id | Filter by account_status NOT IN ('cancelled','expired') |
| calls | business_id | NOT owner_id |
| bookings | client_id | NOT business_id |
| sms_log | client_id | NOT business_id |
| contact_calls | join table | NEVER use calls.contact_id directly |
| users | auth table | NOT profiles |
| notifications_config | live_transfer_number | Canonical transfer number source |

---

## Feature Impact Rule

Every new feature requires a review across ALL surfaces before building:
- Client portal (which screens change?)
- Admin portal (must have full parity with client portal)
- Vapi agents (does this data feed the agent? Sync Agent button required on every affected page)
- Make.com (any automations triggered?)
- Legal docs (if data collection or billing is touched)

---

## Agent Delegation

| Task | Agent |
|------|-------|
| Feature planning before coding | `@tm-planner` |
| DB schema + migration design | `@tm-db-guardian` |
| Security review before committing | `@tm-security` |
| Code review (TypeScript + rules) | `@tm-code-reviewer` |
| Architecture decisions | `@tm-architect` |

---

## Slash Commands

| Command | When to use |
|---------|-------------|
| `/tm-plan "feature"` | Before any build — produces structured plan |
| `/tm-review` | Before committing — checks all engineering rules |
| `/tm-deploy-check` | Before raising PR — full pre-deployment checklist |
| `/tm-migrate "description"` | When writing a new migration |
| `/tm-session-wrap` | End of every session — updates SYSTEM_MAP |

---

## Brand Rules

- Always "TalkMate" — capital T, capital M
- No setup fees, no lock-in, 14-day money-back guarantee only (no "free trial")
- Never mention Vapi, ElevenLabs, Twilio, or Make.com in client-facing copy
- Pricing: Starter $299/mo, Growth $499/mo, Pro $799/mo
- No em dashes in any output
- Brand colours: Orange #E8622A, Navy #061322, Blue #1565C0, Green #22C55E
