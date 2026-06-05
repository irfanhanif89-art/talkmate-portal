End-of-session checklist. Run before closing Claude Code.

1. Summarize what was built (1-2 sentences)
2. List migrations applied (numbers and descriptions)
3. List new/modified API routes and components
4. Check git status — any uncommitted changes?
5. Confirm PR is created if feature branch work is done
6. Update SYSTEM_MAP.md:
   - Last updated date
   - Last session description
   - Current SHA if anything merged
   - Next migration number if migrations applied
   - Add to Session Log table
   - Document any new Known Gaps

Output session summary:

---
Session: [number or "unnamed"]
Date: [YYYY-MM-DD]
Built: [one sentence]
Migrations: [NNN - description, or none]
Routes changed: [list or none]
Deployed to: [preview / prod / not yet]
PRs open: [list or none]
Deferred: [cut items]
Next up: [what's next]
---
