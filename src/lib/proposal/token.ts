import { randomBytes } from 'node:crypto'

// URL-safe, unguessable token for the public accept link.
export function generateAcceptToken(): string {
  return randomBytes(24).toString('base64url')
}
