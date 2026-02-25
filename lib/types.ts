export type CompanyId = 'tde' | 'wgb' | 'daleyphotography' | 'bleijenberg' | 'montung'

export interface Company {
  id: CompanyId
  name: string
  shortName: string
  color: string
  bgColor: string
  email: string
  phone: string
  address: string
  kvk: string
  btw: string
  iban: string
  prefix: {
    offerte: string
    factuur: string
  }
}

export type OfferteStatus = 'concept' | 'opgeslagen' | 'verstuurd' | 'akkoord' | 'afgewezen' | 'verlopen'
export type FactuurStatus = 'concept' | 'verzonden' | 'betaald' | 'te-laat' | 'geannuleerd'

export interface LineItem {
  id: string
  description: string
  details?: string
  quantity: number
  unitPrice: number
  sectionTitle?: string
}

export interface Client {
  name: string
  contactPerson?: string
  email?: string
  phone?: string
  address?: string
  kvk?: string
  btw?: string
}

export interface Offerte {
  id: string
  number: string           // e.g. OF-260221-01
  companyId: CompanyId
  client: Client
  date: string             // ISO date
  validUntil: string       // ISO date
  status: OfferteStatus
  items: LineItem[]
  subtotal: number
  btwPercentage: number
  btwAmount: number
  total: number
  notes?: string
  introText?: string
  termsText?: string
  paymentUrl?: string
  // Client-facing
  slug?: string
  password?: string        // plain-text, only returned once after creation
  passwordHash?: string
  isPublic?: boolean
  // Approval
  approvedAt?: string
  approvedByName?: string
  approvedByEmail?: string
  createdAt: string
  updatedAt: string
}

export interface OfferteApproval {
  id: string
  offerteId: string
  clientName: string
  clientEmail: string
  clientIp?: string
  userAgent?: string
  agreedToTerms: boolean
  createdAt: string
}

export interface Factuur {
  id: string
  number: string           // e.g. F-260221-01
  companyId: CompanyId
  offerteId?: string       // linked offerte if any
  client: Client
  date: string
  dueDate: string
  status: FactuurStatus
  items: LineItem[]
  subtotal: number
  btwPercentage: number
  btwAmount: number
  total: number
  paidAt?: string
  molliePaymentId?: string
  molliePaymentUrl?: string
  notes?: string
  createdAt: string
  updatedAt: string
}

export type BetalingStatus = 'openstaand' | 'betaald' | 'mislukt' | 'terugbetaald'
export type AbonnementStatus = 'actief' | 'gepauzeerd' | 'opgezegd' | 'verlopen'
export type AbonnementInterval = 'maandelijks' | 'kwartaal' | 'jaarlijks'

export interface Betaling {
  id: string
  factuurId?: string
  companyId: CompanyId
  client: Client
  amount: number
  status: BetalingStatus
  method?: string              // 'ideal' | 'bancontact' | 'handmatig' | etc.
  molliePaymentId?: string
  reference?: string           // factuur nummer of omschrijving
  paidAt?: string
  notes?: string
  createdAt: string
  updatedAt: string
}

export interface Abonnement {
  id: string
  companyId: CompanyId
  client: Client
  description: string
  amount: number               // bedrag per interval excl. BTW
  btwPercentage: number
  interval: AbonnementInterval
  status: AbonnementStatus
  startDate: string
  endDate?: string
  nextInvoiceDate?: string
  lastInvoiceDate?: string
  notes?: string
  createdAt: string
  updatedAt: string
}

export const STATUS_CATEGORIES = {
  // Offertes
  closedWon: ['akkoord'] as OfferteStatus[],
  closedLost: ['afgewezen', 'verlopen'] as OfferteStatus[],
  // Facturen
  factuurOpen: ['verzonden', 'te-laat'] as FactuurStatus[],
  factuurClosed: ['betaald', 'geannuleerd'] as FactuurStatus[],
}

export interface DashboardStats {
  openOffertes: number
  openFacturen: number
  totalOpenAmount: number
  totalPaidThisMonth: number
  recentOffertes: Offerte[]
  recentFacturen: Factuur[]
}
