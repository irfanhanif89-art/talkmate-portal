import assert from 'node:assert'
import { fillTemplate, featurePlan } from './fill-template'

const html = `<span data-tm="business">X</span><span data-tm="rep">Y</span>`
const out = fillTemplate(html, { business: 'Joe & Co <Towing>', rep: 'Sam' })
assert.ok(out.includes('Joe &amp; Co &lt;Towing&gt;'))   // escaped
assert.ok(out.includes('>Sam<'))

// featured plan: Growth card has class "plan-card pf", choosing pro moves it
const plans = `<div class="plan-card pf" data-plan="growth"><div class="plan-badge">Most Popular</div></div>
<div class="plan-card" data-plan="pro"></div>`
const pro = featurePlan(plans, 'pro')
assert.ok(/<div class="plan-card" data-plan="growth">/.test(pro))      // growth de-featured
assert.ok(/<div class="plan-card pf" data-plan="pro"><div class="plan-badge">Most Popular<\/div><\/div>/.test(pro))
console.log('fill ok')
