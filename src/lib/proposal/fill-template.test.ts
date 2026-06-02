import assert from 'node:assert'
import { fillTemplate, featurePlan } from './fill-template'

const html = `<span data-tm="business">X</span><span data-tm="rep">Y</span>`
const out = fillTemplate(html, { business: 'Joe & Co <Towing>', rep: 'Sam' })
assert.ok(out.includes('Joe &amp; Co &lt;Towing&gt;'))   // escaped
assert.ok(out.includes('>Sam<'))

// data-tm on NON-span elements (the confirmation template uses div + a)
const mixed = `<div class="rep-name" data-tm="rep">Sarah Mitchell</div>
<a href="tel:0412345678" data-tm="phone">0412 345 678</a>
<a href="mailto:sarah@talkmate.com.au" data-tm="email">sarah@talkmate.com.au</a>`
const filled = fillTemplate(mixed, { rep: 'QA Test Rep', phone: '0400 111 222', email: 'qa@talkmate.com.au' })
assert.ok(filled.includes('>QA Test Rep<'), 'div data-tm filled')
assert.ok(filled.includes('>0400 111 222<'), 'a phone text filled')
assert.ok(filled.includes('>qa@talkmate.com.au<'), 'a email text filled')
assert.ok(filled.includes('href="tel:0400111222"'), 'tel href updated to real number')
assert.ok(filled.includes('href="mailto:qa@talkmate.com.au"'), 'mailto href updated to real email')

// featured plan: Growth card has class "plan-card pf", choosing pro moves it
const plans = `<div class="plan-card pf" data-plan="growth"><div class="plan-badge">Most Popular</div></div>
<div class="plan-card" data-plan="pro"></div>`
const pro = featurePlan(plans, 'pro')
assert.ok(/<div class="plan-card" data-plan="growth">/.test(pro))      // growth de-featured
assert.ok(/<div class="plan-card pf" data-plan="pro"><div class="plan-badge">Most Popular<\/div><\/div>/.test(pro))
console.log('fill ok')
