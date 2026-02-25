/**
 * Generate a date-based prefix for factuur numbering: YYMMDD
 */
function datePrefix(): string {
  const now = new Date()
  const yy = String(now.getFullYear()).slice(2)
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const dd = String(now.getDate()).padStart(2, '0')
  return `${yy}${mm}${dd}`
}

/**
 * Generate a factuur number like "F-260225-01"
 * Uses Supabase count of today's facturen for the sequence number
 */
export function generateFactuurNumber(prefix: string, todayCount: number): string {
  const today = datePrefix()
  const seq = String(todayCount + 1).padStart(2, '0')
  return `${prefix}-${today}-${seq}`
}

/**
 * Generate a URL-friendly slug from factuur number and client name
 * e.g. "f-260225-01-acme-corp"
 */
export function generateSlug(factuurNumber: string, clientName: string): string {
  const clean = clientName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  return `${factuurNumber.toLowerCase()}-${clean}`
}
