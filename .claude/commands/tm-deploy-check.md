Pre-deployment checklist. Go through every item. Report PASS/FAIL for each.

## Code
- [ ] TypeScript compiles: `npx tsc --noEmit`
- [ ] No console.log() in production files
- [ ] /tm-review run — verdict is PASS or WARN (not BLOCK)
- [ ] No hardcoded secrets

## Git
- [ ] On a feature branch (NOT main)
- [ ] All changes committed (`git status` clean)
- [ ] PR raised against `dev` — NOT main
- [ ] PR description: session number, migrations, what changed, how to test

## Migrations (skip if none)
- [ ] Named `NNN_description.sql`
- [ ] Idempotent
- [ ] Applied to PREVIEW and verified
- [ ] NOT applied to PROD yet

## Environment (skip if no new vars)
- [ ] New vars added to Vercel dashboard
- [ ] No secrets with NEXT_PUBLIC_ prefix

## Vapi (skip if no Vapi changes)
- [ ] Sync Agent button present on all affected pages
- [ ] Sync Agent tested manually

## Final
- [ ] SYSTEM_MAP.md updated
- [ ] /tm-session-wrap run

Report X/N passing. List any FAIL items.
