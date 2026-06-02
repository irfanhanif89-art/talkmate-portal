import assert from 'node:assert'
import { inlineFonts } from './inline-fonts'

const html = `@font-face{src:url("/fonts/outfit-latin.woff2")}
@font-face{src:url("/fonts/outfit-latin-ext.woff2")}
body{font-family:Outfit}`

const out = inlineFonts(html)

// Both url(...) refs become base64 data URIs.
assert.ok(out.includes('url("data:font/woff2;base64,'), 'should inline as data URI')
// No bare /fonts paths remain.
assert.ok(!out.includes('url("/fonts/outfit-latin.woff2")'), 'latin path replaced')
assert.ok(!out.includes('url("/fonts/outfit-latin-ext.woff2")'), 'latin-ext path replaced')
// Two distinct data URIs (latin vs latin-ext) present.
const uris = [...out.matchAll(/url\("(data:font\/woff2;base64,[^"]+)"\)/g)].map(m => m[1])
assert.equal(uris.length, 2, 'two inlined fonts')
assert.notEqual(uris[0], uris[1], 'latin and latin-ext differ')
// Non-font CSS untouched.
assert.ok(out.includes('font-family:Outfit'))

console.log('inline-fonts ok')
