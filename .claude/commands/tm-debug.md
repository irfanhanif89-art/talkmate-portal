# TalkMate Debug Session

Structured debugging for production issues, broken builds, or unexpected behaviour.
Run this instead of diving straight into the code when something is not working.

---

## Phase 1 — Reproduce

Before touching any code:
1. State the bug in one sentence: what is happening vs what should happen
2. Identify where it is failing:
   - Browser console error
   - Server-side error (check Vercel logs: `vercel logs --follow`)
   - Supabase error (check Supabase dashboard logs)
   - Vapi webhook error (check Make.com scenario history + Vapi dashboard)
   - Make.com automation error (check scenario execution history)
3. Reproduce it in the simplest possible way. Can you trigger it with a specific
   API call, a specific user action, or a specific data state?
4. Is it reproducible on preview or only on production?

Do not move to Phase 2 until the bug is reliably reproducible.

---

## Phase 2 — Isolate

Narrow the blast radius:
1. What is the smallest piece of code involved? Identify the exact file and function.
2. What changed recently that could have caused this?
   Run: `git log --oneline -20`
   Run: `git diff HEAD~5 -- [suspected file]`
3. Is this a data problem or a code problem?
   - Data: Check the specific row in Supabase that is involved
   - Code: Check the logic path for that specific input
4. For Supabase issues: run the raw query in the Supabase SQL editor with the exact
   data that is failing. Does the query return what you expect?
5. For Vapi issues: check the raw webhook payload in Make.com execution history.
   Is the data arriving correctly before TalkMate processes it?

---

## Phase 3 — Hypothesize

List every plausible cause before trying any fix:
1. Write down 3-5 hypotheses (e.g., "RLS policy blocking the query",
   "missing null check on optional field", "wrong status filter", "env var not set")
2. Rank them by likelihood
3. For each: what single check or log line would confirm or rule it out?

Do not start fixing until the most likely hypothesis is confirmed.

---

## Phase 4 — Diagnose

Test the top hypothesis:
- Add a temporary `console.log` or read the Supabase logs
- Run the suspected query manually in Supabase SQL editor
- Check the env var is actually set: `vercel env ls` or check Vercel dashboard
- For RLS: run the query as the specific user using their JWT to verify RLS is the blocker
- For Vapi: use the Vapi dashboard to inspect the specific call and what the agent received

Confirm the root cause before writing any fix.

---

## Phase 5 — Fix

Write the minimal fix:
1. Change only what is necessary to fix the confirmed root cause
2. Do not refactor or improve unrelated code while fixing a bug
3. If the fix touches the database: write a migration, do not edit data directly
4. If the fix changes a Vapi agent: use the Sync Agent button after fixing

---

## Phase 6 — Verify

After the fix:
1. Reproduce the original steps — confirm the bug no longer occurs
2. Check that nothing adjacent is broken:
   - Run: `npx tsc --noEmit`
   - Test the page/flow in a browser
   - For Supabase changes: verify on preview before production
3. If the bug was in production: apply and verify on preview first

---

## Phase 7 — Document

After the fix is confirmed:
1. Write the lesson to LESSONS.md:
   Format: `Date | What broke | Root cause | Rule derived`
2. If the bug revealed a gap in DECISIONS.md: add the decision and why
3. If the bug was caused by an engineering rule that isn't in CLAUDE.md: add it
4. Run `/tm-session-wrap` to capture the session

---

## TalkMate-Specific Debug Patterns

### Supabase / RLS issues
- Run the query in SQL editor AS the failing user (use their JWT as Bearer token)
- Check if the RLS policy exists: `SELECT * FROM pg_policies WHERE tablename = 'x'`
- Check account_status: is the business `cancelled` or `expired`? That would filter it out.

### Vapi webhook not firing
- Check Make.com scenario is active and has not hit an error
- Check `/api/vapi/functions` — does it return 500? That means `VAPI_WEBHOOK_SECRET` is unset
- Check Vapi dashboard for the specific call — did the webhook URL receive the event?

### Make.com automation not running
- Check the scenario is active (not paused)
- Check the scenario's execution history for the last attempted run
- Check the webhook trigger URL is the current production Vercel URL, not a preview URL

### Stripe webhook issue
- Check `/api/stripe/webhook` — is `STRIPE_WEBHOOK_SECRET` set in Vercel?
- Use Stripe dashboard to replay the failed webhook event

### Next.js build error
- Run: `npx next build` locally and read the full error
- Common cause: `'use client'` missing on a component using hooks
- Common cause: server-only code imported into a client component
- Common cause: TypeScript error that was suppressed locally but caught in CI
