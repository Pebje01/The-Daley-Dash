/**
 * Generate a date-based prefix for factuur numbering: YYMMDD
 */
function datePrefix(date: Date = new Date()): string {
  const yy = String(date.getFullYear()).slice(2)
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  return `${yy}${mm}${dd}`
}

/**
 * Generate a factuur number like "F-260225-01"
 * count = aantal facturen dat al op die datum bestaat. date valt terug op vandaag.
 */
export function generateFactuurNumber(prefix: string, count: number, date: Date = new Date()): string {
  const seq = String(count + 1).padStart(2, '0')
  return `${prefix}-${datePrefix(date)}-${seq}`
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
