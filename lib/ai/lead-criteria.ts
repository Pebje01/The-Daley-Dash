/**
 * Wat maakt een lead goed of slecht voor Daley.
 *
 * Dit bestand is bewust los van de techniek: hier stel je bij wat je zoekt,
 * zonder aan de motor in kwalificeer-lead.ts te komen. Pas het gerust aan
 * zodra je merkt dat de scores niet kloppen met je onderbuikgevoel.
 */

/**
 * Branchelabels die de AI mag plakken. Kent hij de branche niet terug in dit
 * lijstje, dan mag hij zelf een kort label verzinnen. Het lijstje is er om te
 * voorkomen dat vijf hoveniers vijf verschillende labels krijgen.
 */
export const BRANCHE_LABELS = [
  'hovenier',
  'tuinarchitect',
  'boomverzorger',
  'aannemer',
  'installateur',
  'makelaar',
  'horeca',
  'retail',
  'webshop',
  'zorg',
  'coach of therapeut',
  'fotograaf of creatief',
  'sportschool of studio',
  'zakelijke dienstverlening',
  'bouw en techniek',
  'vastgoed',
  'toerisme en verhuur',
  'onderwijs',
  'non-profit',
  'overig',
] as const

/**
 * Het profiel waar de AI tegenaan houdt. Geschreven als briefing aan een
 * collega, niet als lijstje regels: dat levert betere oordelen op.
 */
export const KWALIFICATIE_PROFIEL = `
Je beoordeelt leads voor Daley Jansen, een zelfstandig ondernemer met drie labels:

- We Grow Brands (WGB): websites, webshops, SEO, Google Ads, branding en logo's.
  Websites vanaf ongeveer 1.200 euro, webshops vanaf 1.800, logo's vanaf 450.
- The Daley Edit (TDE): content, social media, visuele branding voor premium merken.
- Daley Photography: branding-, product- en contentfotografie.

Het meeste werk komt uit het MKB in Nederland: eenmanszaken tot bedrijven met
enkele tientallen medewerkers. Daley werkt alleen, dus grote aanbestedingen en
trajecten die maandenlang fulltime capaciteit vragen zijn geen match.

Wat een lead kansrijk maakt:
- Een verouderde, trage of slecht converterende website, terwijl het bedrijf
  duidelijk van klanten uit die website moet komen.
- Zichtbaar budget: het bedrijf loopt al, heeft personeel, adverteert, of doet
  werk in een prijssegment waar een paar duizend euro geen probleem is.
- Een concrete aanleiding: verhuizing, rebrand, nieuwe dienst, nieuwe eigenaar.
- Een branche waar beeld en uitstraling het verschil maken, zoals hoveniers,
  tuinarchitecten, horeca, interieur, zorgpraktijken en verhuur.
- Bereikbaar: er staat een naam, een mailadres of een telefoonnummer op de site.

Wat een lead zwak maakt:
- Recent al een goede, moderne site. Dan is er geen aanleiding en wordt het
  hooguit een gesprek over onderhoud of vindbaarheid.
- Een bedrijf dat het duidelijk zwaar heeft of nauwelijks activiteit toont.
- Een groot bedrijf met een eigen marketingafdeling of een vast bureau.
- Alleen prijsvraag zonder enige context, of iemand die vooral gratis advies wil.
- Ver buiten Nederland, of een taal waarin Daley niet werkt.

Wees eerlijk streng. Een score van 80 of hoger moet echt iets betekenen: dat is
een lead waar je morgen achteraan belt. Het gros van de gewone binnenkomers zit
tussen de 30 en 60. Liever een lage score met een scherpe reden dan een
vriendelijke 70 waar Daley niets aan heeft.
`.trim()

/** Score naar een grovere bak, voor de badge op de kaart. */
export function prioriteitVanScore(score: number): 'hoog' | 'midden' | 'laag' {
  if (score >= 70) return 'hoog'
  if (score >= 40) return 'midden'
  return 'laag'
}
