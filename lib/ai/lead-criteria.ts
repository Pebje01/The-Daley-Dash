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
  'toerismebureau of DMO',
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

Daarnaast is er een tweede spoor: de internationale reisbranche. Toerismebureaus,
DMO's, nationale en regionale toerismeorganisaties, reisproducten en aanbieders.
Daley wil hier graag werken, maar alleen waar er echt een kans in zit. Beoordeel
ze niet langs de MKB-meetlat, want dan valt iedereen bij voorbaat af, maar langs
de vragen die hier beslissen.

Let op, hier is het eerder misgegaan: **het ontbreken van een Nederlandse of
Benelux-ingang is geen reden om laag te scoren.** Dat gat is juist waar Daley
binnenkomt, want zij kan die ingang zelf zijn: Nederlandstalige content, beeld
en bereik richting de Benelux. Een organisatie die hier nog niets heeft is dus
een kans, geen afvaller. Schrijf dat ook niet als minpunt op.

Weeg in plaats daarvan deze vier dingen:

1. Werken ze in het Engels en kijken ze naar buiten? Een Engelstalige site,
   internationale campagnes, een marketing- of persafdeling die zich op
   buitenlandse bezoekers richt. Zonder dat is er niemand om mee te schakelen.
2. Kopen ze wel eens buiten de deur? Eerdere samenwerking met buitenlandse
   PR-bureaus, contentmakers of vertegenwoordigers, persreizen, een stand op een
   buitenlandse beurs. Dat bewijst dat er een budgetregel voor bestaat.
3. Is er een aanleiding? Een nieuwe vliegroute of verbinding, een campagne, een
   jubileum, een expo, een nieuwe markt die ze willen aanboren, een rebrand.
4. Landt een koud bericht uit Nederland hier eigenlijk? Dit is de echte reden om
   laag te scoren. Denk aan: alles loopt via de nationale koepel of het
   ministerie, budgetten liggen een jaar vooruit vast (let op afwijkende
   boekjaren, bijvoorbeeld april tot maart in Japan, waar rond januari wordt
   vastgelegd), er staat alleen een infomailbox en geen mens, of er is geen
   enkele Engelstalige ingang. Klein en direct aanspreekbaar weegt hier zwaarder
   dan groot en indrukwekkend.

Is er wél al een Nederlandse of Benelux-ingang, dan is dat een plus en geen
voorwaarde: er wordt dan al geld aan deze markt uitgegeven. Loopt die ingang via
een vertegenwoordiger of PR-bureau hier, noem dat bureau dan als route in je
eerste stap, want daar wordt de opdracht gegund.

Schaal voor dit spoor, houd je hieraan:
- 45 tot 60: kleine of middelgrote organisatie, Engelstalig, richt zich al jaren
  op Europese bezoekers, direct aanspreekbaar met een naam erbij, en er is een
  aanleiding. Veel hoger komt een koude benadering hier zelden.
- 30 tot 45: dezelfde blik naar buiten, maar groter en formeler, of de
  internationale focus is er wel maar dun.
- 20 tot 30: groot en bureaucratisch, heeft eerder Europese campagnes gedaan,
  maar alles loopt via een nationale koepel.
- 10 tot 20: hun probleem is niet bekendheid maar drukte (overtoerisme), of ze
  richten zich puur op de eigen markt in de eigen taal.
- Boven de 60 kom je alleen langs een warme route: een bureau of
  vertegenwoordiger hier die al met ze werkt, een introductie, of een
  openstaande uitvraag die precies hierover gaat.

Dat het een publieke of overheidsgelieerde organisatie is, is op zichzelf geen
minpunt: die hebben juist promotiebudget en werken per campagne met freelancers.
Een trage inkoopprocedure is dat wel. Afstand en tijdzone zijn geen zelfstandig
minpunt bij dit spoor.

Een dienstverlener in de reisbranche (bagagevervoer, een touroperator, een
boekingsplatform) is geen DMO. Leg daar de gewone commerciële meetlat naast en
zeg dat er ook bij, dan weet Daley waarom hij laag of hoog staat.

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
- Ver buiten Nederland, of een taal waarin Daley niet werkt. Voor de
  internationale reisbranche hierboven is afstand geen bezwaar en het ontbreken
  van een Benelux-ingang evenmin. Daar telt of er een Engelstalige ingang is en
  of een koud bericht uit Nederland er überhaupt aankomt.

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
