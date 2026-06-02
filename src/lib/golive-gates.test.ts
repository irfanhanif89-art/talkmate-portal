import assert from 'node:assert'
import { computeVipFastPath, computeTemplateMatch, type VipRow } from './golive-checks'

// ─── VIP fast-path gate ─────────────────────────────────────────────

// GM Towing pre-fix: 123 regulars loaded as `vip` with a transfer action
// but no bypass, no target, and no business live-transfer number. Every
// one needs a transfer it can't perform → block.
const gmPreFix: VipRow[] = Array.from({ length: 123 }, () => ({
  account_type: 'vip', vip_bypass: false, transfer_to_member_id: null, action: 'transfer_escalation',
}))
assert.equal(computeVipFastPath(gmPreFix, false), false, 'GM pre-fix should fail the VIP gate')

// GM Towing post-fix: converted to `account` → recognised → pass.
const gmPostFix: VipRow[] = Array.from({ length: 124 }, () => ({
  account_type: 'account', vip_bypass: false, transfer_to_member_id: null, action: 'transfer_escalation',
}))
assert.equal(computeVipFastPath(gmPostFix, true), true, 'GM post-fix should pass')

// No regulars loaded → nothing to enforce → pass.
assert.equal(computeVipFastPath([], false), true, 'empty list passes')

// vip + explicit transfer member → routable → pass.
assert.equal(
  computeVipFastPath([{ account_type: 'vip', vip_bypass: false, transfer_to_member_id: 'member-1', action: 'transfer_escalation' }], false),
  true, 'vip with transfer member passes',
)

// vip whose action only takes a message → recognised handling → pass.
assert.equal(
  computeVipFastPath([{ account_type: 'vip', vip_bypass: false, transfer_to_member_id: null, action: 'take_message' }], false),
  true, 'take_message vip passes (no transfer required)',
)

// vip_bypass true but NO live transfer number → not routable → fail.
assert.equal(
  computeVipFastPath([{ account_type: 'vip', vip_bypass: true, transfer_to_member_id: null, action: 'transfer_escalation' }], false),
  false, 'vip_bypass without live transfer number fails',
)

// vip_bypass true WITH live transfer number → routable → pass.
assert.equal(
  computeVipFastPath([{ account_type: 'vip', vip_bypass: true, transfer_to_member_id: null, action: 'transfer_escalation' }], true),
  true, 'vip_bypass with live transfer number passes',
)

// ─── Template-match gate ────────────────────────────────────────────

// GM Towing: container catalogue but roadside car-towing FAQs/escalation
// (the un-converted template) → block.
const gmTemplate = {
  industry: 'towing',
  catalog: [{ category: 'Container Transport', name: 'Loaded Tilt Tray – 0 to 10km' }],
  faqs: [{ question: "I've got RACV / NRMA — does that cover this?", answer: 'Worth calling them first.' }],
  escalationRules: 'If caller is being pressured to sign at an accident scene, advise not to sign.',
}
assert.equal(computeTemplateMatch(gmTemplate), false, 'freight catalogue + roadside language should fail')

// Genuine roadside tower: roadside FAQs but a roadside catalogue → pass
// (no contradiction).
const realRoadside = {
  industry: 'towing',
  catalog: [{ category: 'Roadside', name: 'Local tow 0-10km' }],
  faqs: [{ question: "I've got RACV — does that cover this?", answer: 'Depends on your cover.' }],
  escalationRules: 'Accident scene: confirm nobody injured first.',
}
assert.equal(computeTemplateMatch(realRoadside), true, 'genuine roadside tower passes')

// Freight business with freight-appropriate FAQs → pass.
const cleanFreight = {
  industry: 'freight',
  catalog: [{ category: 'Container Transport', name: 'Sideloader 40ft' }],
  faqs: [{ question: 'Do you do 40ft containers?', answer: 'Yes, via sideloader.' }],
  escalationRules: 'If a container has tight access, escalate to the yard.',
}
assert.equal(computeTemplateMatch(cleanFreight), true, 'converted freight template passes')

// No onboarding data → pass (nothing to judge).
assert.equal(computeTemplateMatch(null), true, 'null responses pass')

console.log('golive-gates ok')
