import assert from 'node:assert'
import { injectIdentityBlock, type IdentityContext } from './kb-block'

const ctx: IdentityContext = {
  agentName: 'Sarah',
  ownerName: 'Glen',
  businessName: 'GM Towing',
  callFlow: [{ question: 'Where are you located right now?' }, { question: 'What type of vehicle is it?' }],
}

const basePrompt = 'You are a helpful AI receptionist.\n\nBUSINESS KNOWLEDGE:\n- Q: Hours?\n  A: 9-5.\n'

// ── Idempotency: inject twice -> byte-identical the second time ──
const first = injectIdentityBlock(basePrompt, ctx, true)
assert.equal(first.changed, true, 'first inject should change')
const second = injectIdentityBlock(first.next, ctx, true)
assert.equal(second.changed, false, 'second inject must be a no-op (no stacking)')
assert.equal(second.next, first.next, 'second inject must be byte-identical')

// Exactly one block present (no duplicates).
const occurrences = first.next.split('=== TALKMATE IDENTITY START ===').length - 1
assert.equal(occurrences, 1, 'exactly one identity block')

// ── Disabled on a clean prompt (the GM Towing / Spectrum case) = no-op ──
const gmPrompt = 'GM Towing system prompt, 21645 chars worth.\n\nBUSINESS KNOWLEDGE:\n- Q: x\n  A: y.\n'
const gmResult = injectIdentityBlock(gmPrompt, ctx, false)
assert.equal(gmResult.changed, false, 'disabled on a block-free prompt must not change it')
assert.equal(gmResult.next, gmPrompt, 'GM prompt must be byte-identical when flag is off')

// ── No owner_name -> no block even when enabled ──
const noOwner = injectIdentityBlock(basePrompt, { ...ctx, ownerName: null }, true)
assert.equal(noOwner.changed, false, 'no owner_name -> no identity block')

// ── Disabling after enabling strips the block cleanly ──
const stripped = injectIdentityBlock(first.next, ctx, false)
assert.equal(stripped.changed, true, 'disabling strips the block')
assert.ok(!stripped.next.includes('=== TALKMATE IDENTITY START ==='), 'block fully removed')
assert.ok(stripped.next.includes('BUSINESS KNOWLEDGE:'), 'KB block untouched by identity strip')

// ── Content checks ──
assert.ok(first.next.includes("I'm Sarah, Glen's assistant at GM Towing."), 'who-am-I line present')
assert.ok(first.next.includes('CALL FLOW - OPENING QUESTIONS:'), 'call flow present')
assert.ok(!first.next.includes('—'), 'no em dashes in identity block')

console.log('kb-block.identity.test.ts: all assertions passed')
