#!/usr/bin/env node
/**
 * MCP-server met de acties van de assistent in de Dash.
 *
 * Wordt per chatbericht gestart door de claude CLI (zie lib/assistent/claude.ts)
 * en praat via stdio. Alles loopt via de API van de Dash zelf, met de
 * x-dash-secret header, zodat de assistent precies dezelfde regels volgt als
 * de knoppen in de Dash en niets om de controles heen kan.
 *
 * Er zit bewust geen enkele actie in die zelf iets wijzigt. De stel_*-acties
 * leggen alleen een voorstel vast; uitvoeren kan alleen Daley, met de knop in
 * de chat.
 *
 * Omgeving: DASH_URL (bv. http://127.0.0.1:3003), DASH_SECRET, DASH_GESPREK_ID.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'

const DASH_URL = process.env.DASH_URL || 'http://127.0.0.1:3003'
const SECRET = process.env.DASH_SECRET || ''
const GESPREK_ID = process.env.DASH_GESPREK_ID || null

async function dash(pad, opties = {}) {
  const res = await fetch(`${DASH_URL}${pad}`, {
    ...opties,
    headers: { 'x-dash-secret': SECRET, 'Content-Type': 'application/json', ...(opties.headers || {}) },
  })
  const tekst = await res.text()
  let data
  try { data = JSON.parse(tekst) } catch { data = tekst }
  if (!res.ok) throw new Error(typeof data === 'object' && data?.error ? data.error : `Dash gaf ${res.status}`)
  return data
}

const antwoord = (data) => ({ content: [{ type: 'text', text: JSON.stringify(data, null, 1) }] })
const fout = (e) => ({ content: [{ type: 'text', text: `Fout: ${e instanceof Error ? e.message : String(e)}` }], isError: true })
const veilig = (fn) => async (args) => { try { return antwoord(await fn(args)) } catch (e) { return fout(e) } }

const server = new McpServer({ name: 'dash', version: '1.0.0' })

// ---------------------------------------------------------------------------
// Lezen
// ---------------------------------------------------------------------------

server.registerTool('zoek_klant', {
  description: 'Zoek een klant op (deel van de) naam. Combineert de urenregistratie, eerdere facturen en offertes: adres, klantnummer, contactpersoon, e-mail, KVK, btw-nummer, uurtarief, bedrijf en laatste factuur.',
  inputSchema: { zoekterm: z.string().min(2).describe('Naam of deel van de naam') },
}, veilig(({ zoekterm }) => dash(`/api/assistent/klanten?q=${encodeURIComponent(zoekterm)}`)))

server.registerTool('open_uren', {
  description: 'Uren die nog niet gefactureerd zijn, optioneel per klant en periode. Uren met een factuurnummer staan al op een concept.',
  inputSchema: {
    klant: z.string().optional().describe('Klantnaam, exact zoals in zoek_klant'),
    van: z.string().optional().describe('YYYY-MM-DD'),
    tot: z.string().optional().describe('YYYY-MM-DD'),
  },
}, veilig(async ({ klant, van, tot }) => {
  const q = new URLSearchParams()
  if (klant) q.set('klant', klant)
  if (van) q.set('datumVan', van)
  if (tot) q.set('datumTot', tot)
  const uren = await dash(`/api/uren?${q}`)
  return uren.map((u) => ({
    id: u.id, datum: u.datum, klant: u.klant, bedrijf: u.companyId, uren: u.uren,
    uurtarief: u.uurtarief, omschrijving: u.omschrijving, project: u.project,
    opConcept: u.factuurnummer || undefined,
  }))
}))

server.registerTool('open_projecten', {
  description: 'Vaste bedragen en projecten in de urenregistratie die nog niet gefactureerd zijn.',
  inputSchema: { klant: z.string().optional() },
}, veilig(async ({ klant }) => {
  const q = new URLSearchParams({ status: 'actief' })
  if (klant) q.set('klant', klant)
  return dash(`/api/uren-projecten?${q}`)
}))

server.registerTool('zoek_facturen', {
  description: 'Facturen zoeken op klant of nummer, optioneel op status (concept, verzonden, herinnering-verzonden, betaald, te-laat, geannuleerd) en bedrijf (tde, wgb, daleyphotography).',
  inputSchema: {
    zoekterm: z.string().optional(),
    status: z.string().optional(),
    bedrijf: z.string().optional(),
  },
}, veilig(async ({ zoekterm, status, bedrijf }) => {
  const q = new URLSearchParams()
  if (zoekterm) q.set('search', zoekterm)
  if (status) q.set('status', status)
  if (bedrijf) q.set('company', bedrijf)
  const facturen = await dash(`/api/facturen?${q}`)
  return facturen.slice(0, 25).map((f) => ({
    id: f.id, nummer: f.number, bedrijf: f.companyId, klant: f.client?.name, datum: f.date,
    vervaldatum: f.dueDate, status: f.status, totaal: f.total,
  }))
}))

server.registerTool('factuur_details', {
  description: 'Alle gegevens van één factuur, inclusief regels. Geef het id of het factuurnummer.',
  inputSchema: { idOfNummer: z.string() },
}, veilig(async ({ idOfNummer }) => {
  if (/^[0-9a-f-]{36}$/i.test(idOfNummer)) return dash(`/api/facturen/${idOfNummer}`)
  const lijst = await dash(`/api/facturen?search=${encodeURIComponent(idOfNummer)}`)
  const f = lijst.find((x) => x.number.toLowerCase() === idOfNummer.toLowerCase())
  if (!f) throw new Error(`Factuur ${idOfNummer} niet gevonden`)
  return f
}))

server.registerTool('akkoord_offertes', {
  description: 'Offertes met status akkoord, om een factuur aan te koppelen of regels van over te nemen.',
  inputSchema: { klant: z.string().optional() },
}, veilig(async ({ klant }) => {
  const q = new URLSearchParams({ status: 'akkoord' })
  if (klant) q.set('search', klant)
  const offertes = await dash(`/api/offertes?${q}`)
  return offertes.slice(0, 15).map((o) => ({
    id: o.id, nummer: o.number, bedrijf: o.companyId, klant: o.client?.name, datum: o.date,
    totaal: o.total, regels: (o.items || []).map((i) => ({ omschrijving: i.description, detail: i.details, aantal: i.quantity, prijs: i.unitPrice })),
  }))
}))

// ---------------------------------------------------------------------------
// Voorstellen: legt alleen vast, voert niets uit
// ---------------------------------------------------------------------------

const regel = z.object({
  omschrijving: z.string().describe('Korte titel van de regel, bv. "Nieuwsbrief september"'),
  detail: z.string().optional().describe('Kleine subregel onder de titel'),
  datum: z.string().optional().describe('YYYY-MM-DD, bij uren de dag van het werk'),
  aantal: z.number().describe('Aantal uren of stuks'),
  prijs: z.number().describe('Prijs per uur of per stuk, exclusief btw'),
  perUur: z.boolean().optional().describe('true voor uren'),
})

const klant = z.object({
  naam: z.string(),
  contactpersoon: z.string().optional(),
  adres: z.string().optional(),
  postcode: z.string().optional(),
  stad: z.string().optional(),
  email: z.string().optional(),
  telefoon: z.string().optional(),
  kvk: z.string().optional(),
  btw: z.string().optional(),
  klantnummer: z.string().optional(),
})

async function stelVoor(type, payload) {
  const v = await dash('/api/assistent/voorstellen', {
    method: 'POST',
    body: JSON.stringify({ gesprekId: GESPREK_ID, type, payload }),
  })
  return {
    voorstelId: v.id,
    uitgevoerd: false,
    uitleg: 'Het voorstel staat als kaart in de chat. Er is nog NIETS aangemaakt of gewijzigd: dat gebeurt pas als Daley op de knop klikt.',
    controle: v.controle,
  }
}

server.registerTool('stel_factuur_voor', {
  description: 'Stel een nieuwe factuur voor. Maakt NIETS aan: de factuur verschijnt als kaart met een knop, en pas als Daley klikt wordt hij gemaakt (met nummer, PDF in de kwartaalmap en gekoppelde uren). Ontbrekende klantgegevens worden aangevuld uit de Dash; het antwoord bevat de controle met fouten en waarschuwingen.',
  inputSchema: {
    bedrijf: z.enum(['tde', 'wgb', 'daleyphotography']),
    klant,
    factuurdatum: z.string().describe('YYYY-MM-DD'),
    betaaltermijnDagen: z.number().optional().describe('Standaard 14'),
    btwPercentage: z.number().optional().describe('21, 9 of 0. Standaard 21'),
    status: z.enum(['concept', 'verzonden']).optional().describe('Standaard concept'),
    betaallink: z.string().optional(),
    offerteId: z.string().optional(),
    notities: z.string().optional(),
    regels: z.array(regel).min(1),
    urenIds: z.array(z.string()).optional().describe('Id\'s van de uren die op deze factuur staan'),
    projectIds: z.array(z.string()).optional(),
  },
}, veilig((args) => stelVoor('factuur_nieuw', args)))

server.registerTool('stel_factuurwijziging_voor', {
  description: 'Stel een wijziging van een bestaande factuur voor. Geef alleen de velden die veranderen. Regels vervangen alle bestaande regels, dus geef dan de volledige nieuwe lijst. Verandert de factuurdatum van dag, dan krijgt de factuur een nieuw nummer. De PDF wordt bij uitvoeren opnieuw gemaakt. Wijzigt NIETS tot Daley klikt.',
  inputSchema: {
    factuurId: z.string(),
    factuurdatum: z.string().optional(),
    betaaltermijnDagen: z.number().optional(),
    klant: klant.partial().optional(),
    regels: z.array(regel).optional(),
    btwPercentage: z.number().optional(),
    status: z.enum(['concept', 'verzonden', 'herinnering-verzonden', 'betaald', 'te-laat', 'geannuleerd']).optional(),
    betaallink: z.string().nullable().optional(),
    notities: z.string().nullable().optional(),
  },
}, veilig((args) => stelVoor('factuur_wijzigen', args)))

server.registerTool('stel_pdf_opnieuw_voor', {
  description: 'Stel voor de PDF van een factuur opnieuw te maken en in de juiste kwartaalmap te zetten. Gebeurt pas als Daley klikt.',
  inputSchema: { factuurId: z.string() },
}, veilig((args) => stelVoor('factuur_pdf', args)))

server.registerTool('stel_koppeling_voor', {
  description: 'Stel voor uren en/of een offerte aan een bestaande factuur te koppelen. Verandert de regels niet. Gebeurt pas als Daley klikt.',
  inputSchema: {
    factuurId: z.string(),
    urenIds: z.array(z.string()).optional(),
    offerteId: z.string().optional(),
  },
}, veilig((args) => stelVoor('factuur_koppelen', args)))

await server.connect(new StdioServerTransport())
