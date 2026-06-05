#!/usr/bin/env node
/**
 * TalkMate Bash Guard (PreToolUse — Bash)
 * Blocks dangerous git operations.
 */
let data = '';
process.stdin.on('data', chunk => data += chunk);
process.stdin.on('end', () => {
  try {
    const input = JSON.parse(data);
    const command = (input.tool_input?.command || '').trim();
    const blocks = [];
    const warnings = [];

    if (/git push.*origin\s+main\b/.test(command) || /git push.*\bmain\b/.test(command)) {
      blocks.push('Direct push to main is not allowed. Raise a PR against dev and get Irfan\'s approval.');
    }
    if (/git push.*(--force|-f)\b/.test(command)) {
      blocks.push('Force push is not allowed on TalkMate.');
    }
    if (/git commit.*--no-verify/.test(command)) {
      blocks.push('--no-verify bypasses commit hooks. Never do this on TalkMate.');
    }
    const isProd = command.includes('mdsfdaefsxwrakgkyflr');
    const isDestructive = /\b(DROP TABLE|TRUNCATE|DELETE FROM|DROP COLUMN)\b/i.test(command);
    if (isProd && isDestructive) {
      blocks.push('Destructive SQL on PRODUCTION Supabase. Apply to PREVIEW first and get Irfan\'s approval.');
    }
    if (/git push origin/.test(command) && !command.includes('main')) {
      warnings.push('Reminder: create a PR against dev after pushing — not main.');
    }

    if (blocks.length > 0) {
      console.error('\n[TalkMate Guard] BLOCKED:\n' + blocks.map(b => '  ✗  ' + b).join('\n') + '\n');
      process.exit(2);
    }
    if (warnings.length > 0) {
      console.error('\n[TalkMate Guard] WARNING:\n' + warnings.map(w => '  ⚠️  ' + w).join('\n') + '\n');
    }
    console.log(data);
  } catch (e) {
    console.log(data);
  }
});
