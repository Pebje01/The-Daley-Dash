/**
 * Klantnummer utilities
 *
 * Afleidingslogica voor de 3-letter prefix:
 *  - 3+ significante woorden: eerste letter van elk van de eerste 3 woorden (bijv. "We Grow Brands" -> WGB)
 *  - 2 significante woorden: eerste letter van woord1 + eerste twee letters van woord2 (bijv. "Daley Photography" -> DPH)
 *  - 1 significant woord: eerste 3 letters van dat woord (bijv. "Nike" -> NIK)
 *
 * Stopwoorden (de, van, het, etc.) worden overgeslagen.
 */

const STOPWORDS = new Set([
  'de', 'van', 'het', 'een', 'den', 'der', 'ten', 'ter', 'te',
  'bij', 'voor', 'op', 'the', 'of', 'and', 'in', 'en', 'uit',
])

export function deriveKlantnummerLetters(naam: string): string {
  const words = naam
    .trim()
    .split(/[\s\-_&/]+/)
    .map(w => w.replace(/[^a-zA-Z]/g, ''))
    .filter(w => w.length > 0 && !STOPWORDS.has(w.toLowerCase()))

  if (words.length === 0) {
    const cleaned = naam.replace(/[^a-zA-Z]/g, '')
    return cleaned.slice(0, 3).toUpperCase().padEnd(3, 'X')
  }

  let letters: string
  if (words.length >= 3) {
    // First letter of each of the first 3 significant words
    letters = words.slice(0, 3).map(w => w[0]).join('')
  } else if (words.length === 2) {
    // First letter of word1 + first 2 letters of word2
    const a = words[0][0]
    const b = words[1][0] ?? ''
    const c = words[1][1] ?? words[0][1] ?? words[0][0]
    letters = a + b + c
  } else {
    // 1 word: first 3 letters, pad with last letter if needed
    const w = words[0]
    letters = w.slice(0, 3).padEnd(3, w[w.length - 1])
  }

  return letters.toUpperCase()
}
