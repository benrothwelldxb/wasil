import crypto from 'crypto'
import bcrypt from 'bcrypt'
import * as OTPAuth from 'otpauth'

const TOTP_ENCRYPTION_KEY = process.env.TOTP_ENCRYPTION_KEY
const ISSUER = 'WASIL CONNECT'
const SALT_ROUNDS = 12

// --- TOTP Generation & Verification ---

export function generateSecret(email: string): { secret: string; otpauthUri: string } {
  const totp = new OTPAuth.TOTP({
    issuer: ISSUER,
    label: email,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: new OTPAuth.Secret({ size: 20 }),
  })

  return {
    secret: totp.secret.base32,
    otpauthUri: totp.toString(),
  }
}

export function verifyToken(secret: string, token: string): boolean {
  const totp = new OTPAuth.TOTP({
    issuer: ISSUER,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(secret),
  })

  const delta = totp.validate({ token, window: 1 })
  return delta !== null
}

// --- Recovery Codes ---

export function generateRecoveryCodes(count = 8): string[] {
  const codes: string[] = []
  for (let i = 0; i < count; i++) {
    const part1 = crypto.randomBytes(2).toString('hex').toUpperCase()
    const part2 = crypto.randomBytes(2).toString('hex').toUpperCase()
    codes.push(`${part1}-${part2}`)
  }
  return codes
}

export async function hashRecoveryCode(code: string): Promise<string> {
  return bcrypt.hash(code.toUpperCase().replace(/-/g, ''), SALT_ROUNDS)
}

export async function hashRecoveryCodes(codes: string[]): Promise<string[]> {
  return Promise.all(codes.map(hashRecoveryCode))
}

export async function verifyRecoveryCode(
  code: string,
  hashedCodes: string[]
): Promise<{ valid: boolean; index: number }> {
  const normalized = code.toUpperCase().replace(/-/g, '')
  for (let i = 0; i < hashedCodes.length; i++) {
    const match = await bcrypt.compare(normalized, hashedCodes[i])
    if (match) return { valid: true, index: i }
  }
  return { valid: false, index: -1 }
}

// --- AES-256-GCM Encryption ---

function getEncryptionKey(): Buffer {
  if (!TOTP_ENCRYPTION_KEY || TOTP_ENCRYPTION_KEY.length < 64) {
    throw new Error('TOTP_ENCRYPTION_KEY must be a 32-byte hex string (64 hex chars). Generate with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"')
  }
  return Buffer.from(TOTP_ENCRYPTION_KEY, 'hex')
}

export function encryptSecret(secret: string): string {
  const key = getEncryptionKey()
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  let encrypted = cipher.update(secret, 'utf8', 'hex')
  encrypted += cipher.final('hex')
  const authTag = cipher.getAuthTag()
  // Format: iv:authTag:ciphertext (all hex)
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`
}

export function decryptSecret(encrypted: string): string {
  const key = getEncryptionKey()
  const parts = encrypted.split(':')
  if (parts.length !== 3) throw new Error('Invalid encrypted secret format')

  const iv = Buffer.from(parts[0], 'hex')
  const authTag = Buffer.from(parts[1], 'hex')
  const ciphertext = parts[2]

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(authTag)
  let decrypted = decipher.update(ciphertext, 'hex', 'utf8')
  decrypted += decipher.final('utf8')
  return decrypted
}
