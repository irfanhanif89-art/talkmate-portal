# TalkMate Session Wrap-Up

Run this at the end of every session before closing Claude Code.

---

## Step 1 — Summarize

State clearly:
- What was built this session (1-2 sentences)
- Migrations applied (numbers and descriptions, or "none")
- New or modified API routes (or "none")
- New or modified components (or "none")

## Step 2 — Capture lessons (most important step)

Review the session for anything that went wrong, had to be re-done, or caused
unexpected behaviour. For each one, add an entry to LESSONS.md:

Format:
`**YYYY-MM | What broke | Root cause**`
`[One paragraph: what happened, why it happened, rule to prevent it recurring]`

If nothing went wrong this session, write: `<!-- Session N: no new lessons -->`
at the bottom of LESSONS.md to confirm it was reviewed.

Prompt: "Did anything have to be re-done or fixed this session?
Did Claude Code misunderstand anything about the schema, rules, or stack?
Did a migration fail or need to be revised? Did a hook fire unexpectedly?"

## Step 3 — Capture decisions

If any significant architectural decision was made this session (e.g., chose one
approach over another, decided to use a specific pattern, ruled out an option),
add it to DECISIONS.md in the same format as existing entries:
- Decision: what was decided
- Why: the reasoning
- Implication: what future code must or must not do as a result

## Step 4 — Check git state

Run: `git status` and `git log --oneline -5`
- Uncommitted changes? Commit them or stash with a clear reason.
- Feature branch work done? Confirm PR is created against dev (not main).

## Step 5 — Update SYSTEM_MAP.md

Update these fields:
- `Last updated:` today's date
- `Last session:` brief description
- `Last config change:` if env vars, Vapi agents, or Stripe config changed
- `Main SHA:` if anything was merged
- `Next migration number:` if migrations were applied this session
- Add session to the Session Log table
- Add any new Known Gaps

## Step 6 — Remind Irfan

- If PR is open: "PR #N is open against dev — needs your review before merge to main"
- If migrations are preview-only: "Migration NNN on preview — needs PROD approval"
- If PR #119 identity block is still held: "PR #119 still held — do NOT merge without runbook"

## Step 7 — Output session summary

---
Session: [number or "unnamed"]
Date: [YYYY-MM-DD]
Built: [one sentence]
Migrations: [NNN - description, or none]
Routes changed: [list or none]
Deployed to: [preview / prod / not yet]
PRs open: [list or none]
New lessons: [count added to LESSONS.md, or "none"]
New decisions: [count added to DECISIONS.md, or "none"]
Deferred: [cut items]
Next up: [what is next from SYSTEM_MAP]
---
