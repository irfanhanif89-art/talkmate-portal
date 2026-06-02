import assert from 'node:assert'
import { EOFY_SALE, isSaleActive, regularPrice, applyEofySaleToProposalHtml } from './eofy-sale'

assert.equal(regularPrice(299), 598)
assert.equal(EOFY_SALE.discountPercent, 50)
assert.equal(isSaleActive(new Date('2026-06-15T12:00:00+10:00')), true)
assert.equal(isSaleActive(new Date('2026-07-01T00:00:01+10:00')), false)

const sampleHtml = `
  <p class="plans-intro">All plans include full setup.</p>
  <div class="plan-card" data-plan="starter">
    <div class="plan-price">$299</div>
    <div class="plan-annual">or $2,990/yr · save $598</div>
  </div>`

const on = applyEofySaleToProposalHtml(sampleHtml, new Date('2026-06-15T12:00:00+10:00'))
assert.ok(on.includes('<div class="plan-was">$598</div>'), 'monthly was-price injected')
assert.ok(on.includes('class="eofy-banner"'), 'banner injected')
assert.ok(on.includes('$5,980'), 'annual was-price injected')

const off = applyEofySaleToProposalHtml(sampleHtml, new Date('2026-07-02T00:00:00+10:00'))
assert.equal(off, sampleHtml)
console.log('eofy-sale (portal) ok')
