Run both reviewers on all modified files before committing.

1. Run `git diff --name-only HEAD`
2. Delegate security scan to @tm-security
3. Delegate code review to @tm-code-reviewer
4. Combine results into one report

Verdict: BLOCK = fix first. WARN = commit with notes. PASS = clear.
Do not auto-fix. Report only.
