import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto'

/**
 * Authenticated symmetric encryption for secrets stored at rest (e.g. the platform
 * AI API key in the `settings` global — Codex R1 #17).
 *
 * Scheme: derive a 32-byte key from PAYLOAD_SECRET via HKDF-SHA256 (domain-separated
 * by a fixed `info` label), then AES-256-GCM with a random 12-byte nonce. The output
 * is VERSIONED so the scheme can evolve: `v1:<nonce>:<tag>:<data>` (each base64).
 *
 * `decryptSecret` FAILS LOUDLY on any tamper / wrong key (the GCM auth tag check
 * throws). Callers MUST treat a thrown error as "key present but unreadable" and
 * fail closed — never silently fall back to an env key (Codex R1 #19).
 */
const VERSION = 'v1'
const INFO = 'siteagent:secretbox:v1'

function deriveKey(secret: string): Buffer {
  if (!secret) throw new Error('secretBox: missing key material (PAYLOAD_SECRET)')
  // Empty salt is acceptable: PAYLOAD_SECRET is already high-entropy and the fixed
  // `info` label domain-separates this use from any other HKDF use of the secret.
  const derived = hkdfSync('sha256', Buffer.from(secret, 'utf8'), Buffer.alloc(0), Buffer.from(INFO, 'utf8'), 32)
  return Buffer.from(derived)
}

export function encryptSecret(plaintext: string, secret: string): string {
  const key = deriveKey(secret)
  const nonce = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, nonce)
  const data = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return [VERSION, nonce.toString('base64'), tag.toString('base64'), data.toString('base64')].join(':')
}

export function decryptSecret(ciphertext: string, secret: string): string {
  const parts = ciphertext.split(':')
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new Error('secretBox: unrecognized ciphertext format')
  }
  const [, nonceB64, tagB64, dataB64] = parts
  const key = deriveKey(secret)
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(nonceB64, 'base64'))
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'))
  return Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]).toString('utf8')
}
