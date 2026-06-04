/**
 * Session 4A Round 2 — prompt-safety harness.
 *
 * READ-ONLY. Writes NOTHING to Vapi. For every live agent (active, non-demo
 * business with a vapi_agent_id) it:
 *   1. fetches the current Vapi system prompt and saves it verbatim to
 *      prompt-snapshots/<vapi_agent_id>-<ts>.txt  (the rollback baseline)
 *   2. prints a DRY-RUN diff of exactly what enabling the identity block
 *      WOULD change (using injectIdentityBlock with enabled=true), so a human
 *      can eyeball it before any flag is flipped.
 *
 * Usage (from the worktree, env from .env.local):
 *   npx tsx scripts/snapshot-live-prompts.ts
 *
 * Nothing here is destructive. Enabling identity injection on a real agent is a
 * SEPARATE, deliberate step (set businesses.identity_block_enabled=true on a
 * TEST agent first, place a test call, then sign off).
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync, mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { injectIdentityBlock, type IdentityContext } from '../src/lib/kb-block'

// Minimal .env.local loader (this is a standalone script, not the Next runtime).
function loadEnv() {
  const path = join(process.cwd(), '.env.local')
  if (!existsSync(path)) return
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}
loadEnv()

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const VAPI_KEY = process.env.VAPI_API_KEY!
const TS = new Date().toISOString().replace(/[:.]/g, '-')

async function main() {
  if (!SUPABASE_URL || !SERVICE_KEY || !VAPI_KEY) {
    console.error('Missing env (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / VAPI_API_KEY).')
    process.exit(1)
  }
  const sb = createClient(SUPABASE_URL, SERVICE_KEY)
  const { data: bizRows, error } = await sb
    .from('businesses')
    .select('id, name, vapi_agent_id, identity_block_enabled, owner_name, agent_name, is_demo, account_status')
    .not('vapi_agent_id', 'is', null)
    .eq('account_status', 'active')
  if (error) { console.error('DB error:', error.message); process.exit(1) }

  const live = (bizRows ?? []).filter(b => !b.is_demo)
  const outDir = join(process.cwd(), 'prompt-snapshots')
  mkdirSync(outDir, { recursive: true })
  console.log(`Found ${live.length} live agent(s). Snapshotting to ${outDir}\n`)

  for (const b of live) {
    const res = await fetch(`https://api.vapi.ai/assistant/${b.vapi_agent_id}`, {
      headers: { Authorization: `Bearer ${VAPI_KEY}` },
    })
    if (!res.ok) { console.error(`  [${b.name}] Vapi GET ${res.status} — skipped`); continue }
    const agent = await res.json() as { model?: { systemPrompt?: string } }
    const prompt = agent.model?.systemPrompt ?? ''

    const file = join(outDir, `${b.vapi_agent_id}-${TS}.txt`)
    writeFileSync(file, prompt, 'utf8')

    // Dry-run: what WOULD enabling do? (does not write anywhere)
    const ctx: IdentityContext = { agentName: b.agent_name, ownerName: b.owner_name, businessName: b.name, callFlow: [] }
    const wouldEnable = injectIdentityBlock(prompt, ctx, true)
    const currentlyOff = injectIdentityBlock(prompt, ctx, false)

    console.log(`  [${b.name}]`)
    console.log(`     vapi_agent_id     : ${b.vapi_agent_id}`)
    console.log(`     identity_enabled  : ${b.identity_block_enabled}`)
    console.log(`     owner_name        : ${b.owner_name ?? '(null)'}`)
    console.log(`     snapshot          : ${file} (${prompt.length} chars)`)
    console.log(`     flag-OFF changes? : ${currentlyOff.changed ? 'YES (unexpected!)' : 'no — byte-identical (safe)'}`)
    console.log(`     IF enabled, delta : ${wouldEnable.changed ? `+${wouldEnable.next.length - prompt.length} chars (identity block added)` : 'no change (no owner_name)'}`)
    console.log('')
  }
  console.log('Done. No changes written to Vapi.')
}

main().catch(e => { console.error(e); process.exit(1) })
