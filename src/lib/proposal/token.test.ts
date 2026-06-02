import assert from 'node:assert'
import { generateAcceptToken } from './token'

const a = generateAcceptToken()
const b = generateAcceptToken()
assert.match(a, /^[A-Za-z0-9_-]{32,}$/)
assert.notEqual(a, b)
console.log('token ok')
