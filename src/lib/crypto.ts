// Application-layer encryption for sensitive third-party credentials at rest
// (Session 6A — ServiceM8 API key; reusable for future OAuth tokens).
//
// AES-256-GCM. The key comes from SERVICEM8_ENCRYPTION_KEY (32 random bytes,
// base64). Generate with: openssl rand -base64 32
//
// Storage format: a single string `tm1:<base64(iv | authTag | ciphertext)>`.
// The `tm1:` prefix lets readers tell an encrypted value apart from a legacy
// plain-text key, so we can roll out encryption without a migration or a big
// backfill — legacy plain-text passes through on read and is re-encrypted
// opportunistically the next time a route touches it.
//
// Graceful degradation: if SERVICEM8_ENCRYPTION_KEY is not set (e.g. preview
// before the env var is added), encryptSecret() logs a warning and returns the
// plain text unchanged, so nothing breaks. Once the env var is set, new and
// lazily-touched keys become encrypted. decryptSecret() only needs the key
// when it actually encounters an encrypted value.

import crypto from 'crypto'

const PREFIX = 'tm1:'

function keyFromB64(b64: string | undefined, label: string): Buffer | null {
  if (!b64) return null
  const key = Buffer.from(b64, 'base64')
  if (key.length !== 32) {
    console.error(`[crypto] ${label} must decode to 32 bytes (use: openssl rand -base64 32)`)
    return null
  }
  return key
}

function getKey(): Buffer | null {
  return keyFromB64(process.env.SERVICEM8_ENCRYPTION_KEY, 'SERVICEM8_ENCRYPTION_KEY')
}

/** True if the stored value is in our encrypted format. */
export function isEncrypted(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.startsWith(PREFIX)
}

/**
 * Encrypt a secret for storage. If no key is configured, returns the plain
 * text unchanged (with a warning) so the feature keeps working until the env
 * var is set.
 */
export function encryptSecret(plaintext: string): string {
  const key = getKey()
  if (!key) {
    console.warn('[crypto] SERVICEM8_ENCRYPTION_KEY not set — storing secret WITHOUT encryption')
    return plaintext
  }
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return PREFIX + Buffer.concat([iv, tag, ct]).toString('base64')
}

/**
 * Decrypt a stored secret. Legacy plain-text values (no prefix) pass through
 * unchanged. Throws only if an encrypted value is read with no key available.
 */
export function decryptSecret(value: string | null | undefined): string | null {
  if (value == null) return null
  if (!value.startsWith(PREFIX)) return value // legacy plain-text
  const key = getKey()
  if (!key) {
    throw new Error('SERVICEM8_ENCRYPTION_KEY not set but an encrypted secret was read')
  }
  const raw = Buffer.from(value.slice(PREFIX.length), 'base64')
  const iv = raw.subarray(0, 12)
  const tag = raw.subarray(12, 28)
  const ct = raw.subarray(28)
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8')
}

// ── Key-parameterized variants ───────────────────────────────────────────────
// Same tm1:/AES-256-GCM format as above, but the base64 key is supplied by the
// caller (e.g. INTEGRATION_ENCRYPTION_KEY for HubSpot + MYOB OAuth tokens) so a
// single crypto module can serve multiple independent secrets.

/**
 * Encrypt with an explicit base64 key. If the key is missing/invalid, returns
 * the plain text unchanged (with a warning) so a route can still deploy before
 * the env var is set — exactly mirroring encryptSecret()'s graceful degradation.
 */
export function encryptWith(plaintext: string, keyB64: string | undefined, label = 'encryption key'): string {
  const key = keyFromB64(keyB64, label)
  if (!key) {
    console.warn(`[crypto] ${label} not set — storing secret WITHOUT encryption`)
    return plaintext
  }
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return PREFIX + Buffer.concat([iv, tag, ct]).toString('base64')
}

/** Decrypt with an explicit base64 key. Legacy plain-text passes through. */
export function decryptWith(value: string | null | undefined, keyB64: string | undefined, label = 'encryption key'): string | null {
  if (value == null) return null
  if (!value.startsWith(PREFIX)) return value // legacy plain-text
  const key = keyFromB64(keyB64, label)
  if (!key) {
    throw new Error(`${label} not set but an encrypted secret was read`)
  }
  const raw = Buffer.from(value.slice(PREFIX.length), 'base64')
  const iv = raw.subarray(0, 12)
  const tag = raw.subarray(12, 28)
  const ct = raw.subarray(28)
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8')
}
