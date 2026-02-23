import bcrypt from 'bcryptjs'

/**
 * Generate a date-based prefix for offerte/factuur numbering: YYMMDD
 */
function datePrefix(): string {
  const now = new Date()
  const yy = String(now.getFullYear()).slice(2)
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const dd = String(now.getDate()).padStart(2, '0')
  return `${yy}${mm}${dd}`
}

/**
 * Generate an offerte number like "OF-260221-01"
 * Uses Supabase count of today's offertes for the sequence number
 */
export function generateOfferteNumber(prefix: string, todayCount: number): string {
  const today = datePrefix()
  const seq = String(todayCount + 1).padStart(2, '0')
  return `${prefix}-${today}-${seq}`
}

/**
 * Generate a URL-friendly slug from offerte number and client name
 * e.g. "OF-260221-01-acme-corp"
 */
export function generateSlug(offerteNumber: string, clientName: string): string {
  const clean = clientName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  return `${offerteNumber.toLowerCase()}-${clean}`
}

/**
 * Generate a random password (12 chars, mixed case + digits)
 */
export function generatePassword(): string {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
  const lower = 'abcdefghjkmnpqrstuvwxyz'
  const digits = '23456789'
  const all = upper + lower + digits
  let pass = ''
  // Ensure at least one of each type
  pass += upper[Math.floor(Math.random() * upper.length)]
  pass += lower[Math.floor(Math.random() * lower.length)]
  pass += digits[Math.floor(Math.random() * digits.length)]
  for (let i = 3; i < 12; i++) {
    pass += all[Math.floor(Math.random() * all.length)]
  }
  // Shuffle
  return pass.split('').sort(() => Math.random() - 0.5).join('')
}

/**
 * Hash a password with bcrypt
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10)
}

/**
 * Verify a password against a bcrypt hash
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash)
}
