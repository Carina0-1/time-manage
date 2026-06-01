import { scryptSync, randomBytes, timingSafeEqual } from 'crypto'

export function hashPassword(plain: string): string {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(plain, salt, 64).toString('hex')
  return `${salt}:${hash}`
}

export function verifyPassword(plain: string, stored: string): boolean {
  const [salt, hash] = stored.split(':')
  if (!salt || !hash) return false
  const hashBuf = Buffer.from(hash, 'hex')
  const derivedBuf = scryptSync(plain, salt, 64)
  return timingSafeEqual(hashBuf, derivedBuf)
}
