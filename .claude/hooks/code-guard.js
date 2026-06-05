#!/usr/bin/env node
/**
 * TalkMate Code Guard (PreToolUse — Write, Edit, Create)
 * Scans file content for secrets and rule violations before writing.
 */
let data = '';
process.stdin.on('data', chunk => data += chunk);
process.stdin.on('end', () => {
  try {
    const input = JSON.parse(data);
    const content = input.tool_input?.content || input.tool_input?.new_str || '';
    const filePath = input.tool_input?.path || input.tool_input?.file_path || '';
    const blocks = [];
    const warnings = [];

    const isSource = /\.(ts|tsx|js|jsx|mjs|cjs)$/.test(filePath);
    const isTest = /\.(test|spec)\.(ts|tsx|js)$/.test(filePath) || filePath.includes('__tests__');

    if (isSource && !isTest) {
      const secretPatterns = [
        { p: /['"]sk_live_[a-zA-Z0-9]{24,}['"]/, l: 'Stripe live secret key' },
        { p: /SUPABASE_SERVICE_ROLE_KEY\s*[:=]\s*['"][a-zA-Z0-9._-]{40,}['"]/, l: 'Supabase service role key' },
        { p: /VAPI_API_KEY\s*[:=]\s*['"][a-zA-Z0-9-]{30,}['"]/, l: 'Vapi API key' },
        { p: /RESEND_API_KEY\s*[:=]\s*['"]re_[a-zA-Z0-9]{32,}['"]/, l: 'Resend API key' },
        { p: /TELEGRAM_BOT_TOKEN\s*[:=]\s*['"][0-9]{8,}:[a-zA-Z0-9_-]{35,}['"]/, l: 'Telegram bot token' },
        { p: /ghp_[a-zA-Z0-9]{36}/, l: 'GitHub personal access token' },
        { p: /sk-ant-[a-zA-Z0-9_-]{40,}/, l: 'Anthropic API key' },
      ];
      for (const { p, l } of secretPatterns) {
        if (p.test(content)) blocks.push(`Hardcoded ${l} detected. Use process.env.VAR_NAME instead.`);
      }

      const dangerPublic = ['NEXT_PUBLIC_SUPABASE_SERVICE_ROLE','NEXT_PUBLIC_STRIPE_SECRET','NEXT_PUBLIC_VAPI_API_KEY','NEXT_PUBLIC_RESEND_API','NEXT_PUBLIC_TELEGRAM','NEXT_PUBLIC_CRON_SECRET'];
      for (const v of dangerPublic) {
        if (content.includes(v)) blocks.push(`${v} exposes a secret in the browser. Remove NEXT_PUBLIC_ prefix.`);
      }

      if (/\.from\(["']businesses["']\)[^;]*\.single\(\)/s.test(content)) {
        blocks.push('.single() on businesses is FORBIDDEN. Use .maybeSingle() or .limit(1).');
      }

      if (content.includes('businesses') && /\.eq\(["']owner_id["']/.test(content)) {
        blocks.push('businesses.owner_id does not exist. Use businesses.owner_user_id.');
      }

      const clientData = [
        { p: /['"]df0ab1a1/, l: 'GM Towing business UUID' },
        { p: /['"]18a8f78e/, l: 'Spectrum Towing business UUID' },
        { p: /['"]25443e10/, l: 'GM Towing Vapi agent UUID' },
        { p: /['"]8121a8b0/, l: 'Spectrum Towing Vapi agent UUID' },
      ];
      for (const { p, l } of clientData) {
        if (p.test(content)) warnings.push(`Hardcoded ${l}. Read from DB, not as a constant.`);
      }

      const logs = content.match(/console\.log\(/g);
      if (logs) warnings.push(`${logs.length} console.log() in ${filePath || 'file'}. Remove before committing.`);

      if (content.includes('grok-2-latest')) warnings.push('grok-2-latest is deprecated. Use grok-3.');
      if (content.includes('claude-sonnet-4-20250514')) warnings.push('claude-sonnet-4-20250514 is deprecated. Use claude-sonnet-4-6.');
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
