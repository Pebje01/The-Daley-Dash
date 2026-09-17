/**
 * GoCardless Bank Account Data (voorheen Nordigen): banktransacties ophalen.
 *
 * Waarom deze route en niet inloggen op knab.nl:
 * GoCardless is een vergunninghoudende AISP onder PSD2. Daley keurt de toegang
 * eenmalig goed op het inlogscherm van Knab zelf, wij krijgen alleen een token.
 * Er staat dus nergens een bankwachtwoord in dit project.
 *
 * Belangrijk over de geldigheid:
 * Een goedkeuring is beperkt houdbaar (access_valid_for_days, doorgaans 90 tot
 * 180 dagen). Daarna moet Daley opnieuw goedkeuren, anders stopt de sync stil.
 * Daarom slaan we `geldig_tot` op en waarschuwt de sync ruim van tevoren.
 *
 * Docs: https://developer.gocardless.com/bank-account-data/overview
 */

import { IS_TEST } from './dashModus'

const BASE = 'https://bankaccountdata.gocardless.com/api/v2'

export interface GcToken {
  access: string
  access_expires: number
  refresh: string
  refresh_expires: number
}

export interface GcInstitution {
  id: string
  name: string
  bic?: string
  transaction_total_days?: string
  countries?: string[]
}

export interface GcRequisition {
  id: string
  status: string
  link: string
  accounts: string[]
  agreement?: string
  institution_id?: string
}

/** Ruwe transactie zoals GoCardless hem teruggeeft. Velden zijn optioneel: niet elke bank vult alles. */
export interface GcTransaction {
  transactionId?: string
  internalTransactionId?: string
  bookingDate?: string
  valueDate?: string
  transactionAmount: { amount: string; currency: string }
  creditorName?: string
  debtorName?: string
  creditorAccount?: { iban?: string }
  debtorAccount?: { iban?: string }
  remittanceInformationUnstructured?: string
  remittanceInformationUnstructuredArray?: string[]
  proprietaryBankTransactionCode?: string
  bankTransactionCode?: string
  endToEndId?: string
}

function creds() {
  const secretId = process.env.GOCARDLESS_SECRET_ID
  const secretKey = process.env.GOCARDLESS_SECRET_KEY
  if (!secretId || !secretKey) {
    throw new Error(
      'GOCARDLESS_SECRET_ID of GOCARDLESS_SECRET_KEY ontbreekt in .env.local. ' +
      'Aanmaken op bankaccountdata.gocardless.com onder Developers, User secrets.',
    )
  }
  return { secretId, secretKey }
}

async function gcFetch<T>(pad: string, opties: RequestInit & { token?: string } = {}): Promise<T> {
  const { token, ...rest } = opties
  const res = await fetch(`${BASE}${pad}`, {
    ...rest,
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(rest.headers || {}),
    },
    cache: 'no-store',
  })

  const tekst = await res.text()
  if (!res.ok) {
    // De foutmelding van GoCardless is meestal bruikbaar, dus die geven we door.
    // Bij een verlopen goedkeuring komt hier een 401 of 403 met een duidelijke reden.
    throw new Error(`GoCardless ${res.status} op ${pad}: ${tekst.slice(0, 500)}`)
  }
  return (tekst ? JSON.parse(tekst) : {}) as T
}

/** Verse toegangstoken. Deze leeft maar 24 uur, dus we halen hem per run opnieuw op. */
export async function haalToken(): Promise<string> {
  // De testversie koppelt nooit je echte bankrekening
  if (IS_TEST) throw new Error('Bankkoppeling is uitgeschakeld in de testversie')
  const { secretId, secretKey } = creds()
  const data = await gcFetch<GcToken>('/token/new/', {
    method: 'POST',
    body: JSON.stringify({ secret_id: secretId, secret_key: secretKey }),
  })
  return data.access
}

/** Alle banken van een land. Knab staat hier als KNAB_KNABNL2H. */
export async function haalInstellingen(token: string, land = 'nl'): Promise<GcInstitution[]> {
  return gcFetch<GcInstitution[]>(`/institutions/?country=${land}`, { token })
}

/** Zoek een bank op naam, bijvoorbeeld 'knab'. */
export async function zoekInstelling(token: string, naam: string, land = 'nl'): Promise<GcInstitution | null> {
  const alle = await haalInstellingen(token, land)
  const gezocht = naam.toLowerCase()
  return alle.find(i => i.name.toLowerCase().includes(gezocht)) ?? null
}

/**
 * Start een koppeling. Levert een link op die Daley zelf moet openen om bij
 * Knab in te loggen en toegang goed te keuren.
 *
 * maxHistorischeDagen: Knab levert tot 730 dagen historie, genoeg voor twee
 * jaar aangifte. Vraag niet meer dan de bank ondersteunt, anders faalt de call.
 */
export async function startKoppeling(
  token: string,
  institutionId: string,
  redirectUrl: string,
  maxHistorischeDagen = 730,
  geldigDagen = 180,
): Promise<{ requisition: GcRequisition; agreementId: string; geldigDagen: number }> {
  const agreement = await gcFetch<{ id: string; access_valid_for_days: number }>('/agreements/enduser/', {
    method: 'POST',
    token,
    body: JSON.stringify({
      institution_id: institutionId,
      max_historical_days: maxHistorischeDagen,
      access_valid_for_days: geldigDagen,
      access_scope: ['balances', 'details', 'transactions'],
    }),
  })

  const requisition = await gcFetch<GcRequisition>('/requisitions/', {
    method: 'POST',
    token,
    body: JSON.stringify({
      redirect: redirectUrl,
      institution_id: institutionId,
      agreement: agreement.id,
      reference: `dash-${Date.now()}`,
      user_language: 'NL',
    }),
  })

  return { requisition, agreementId: agreement.id, geldigDagen: agreement.access_valid_for_days ?? geldigDagen }
}

/** Status van een koppeling ophalen. Na goedkeuring staat `accounts` gevuld. */
export async function haalKoppeling(token: string, requisitionId: string): Promise<GcRequisition> {
  return gcFetch<GcRequisition>(`/requisitions/${requisitionId}/`, { token })
}

/** Rekeninggegevens, vooral het IBAN. */
export async function haalRekening(token: string, accountId: string): Promise<{ id: string; iban?: string }> {
  return gcFetch<{ id: string; iban?: string }>(`/accounts/${accountId}/`, { token })
}

/** Transacties van een rekening. `vanaf` in ISO-formaat, bijvoorbeeld 2026-01-01. */
export async function haalTransacties(
  token: string,
  accountId: string,
  vanaf?: string,
): Promise<{ booked: GcTransaction[]; pending: GcTransaction[] }> {
  const query = vanaf ? `?date_from=${vanaf}` : ''
  const data = await gcFetch<{ transactions: { booked?: GcTransaction[]; pending?: GcTransaction[] } }>(
    `/accounts/${accountId}/transactions/${query}`,
    { token },
  )
  return {
    booked: data.transactions?.booked ?? [],
    pending: data.transactions?.pending ?? [],
  }
}

/**
 * Zet een GoCardless-transactie om naar de vorm die lib/btw.ts verwacht,
 * zodat categoriseer() en matchFactuur() precies hetzelfde werken als bij
 * de handmatige Knab-CSV. Eén classificatielogica voor beide bronnen.
 */
export function naarBankRegel(t: GcTransaction, eigenIban: string) {
  const bedragRuw = parseFloat(t.transactionAmount.amount)
  const isCredit = bedragRuw >= 0

  // Bij een afschrijving is de tegenpartij de crediteur, bij een bijschrijving de debiteur.
  const tegenrekening = (isCredit ? t.debtorAccount?.iban : t.creditorAccount?.iban) ?? ''
  const tegenrekeninghouder = (isCredit ? t.debtorName : t.creditorName) ?? ''

  const omschrijving =
    t.remittanceInformationUnstructured ??
    (t.remittanceInformationUnstructuredArray ?? []).join(' ') ??
    ''

  return {
    rekeningnummer: eigenIban,
    datum: (t.bookingDate || t.valueDate || '').slice(0, 10),
    bedrag: Math.abs(bedragRuw),
    creditDebet: (isCredit ? 'C' : 'D') as 'C' | 'D',
    tegenrekening,
    tegenrekeninghouder,
    omschrijving,
    betaalwijze: t.proprietaryBankTransactionCode || t.bankTransactionCode || '',
    // Dedup-sleutel. transactionId is stabiel bij Knab; internalTransactionId is
    // de terugvaloptie. Zonder een van beide kunnen we niet ontdubbelen en slaan
    // we de regel over, liever een gat dan een dubbele boeking in de aangifte.
    referentie: t.transactionId || t.internalTransactionId || '',
  }
}
