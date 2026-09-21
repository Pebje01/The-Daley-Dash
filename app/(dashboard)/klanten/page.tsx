import { redirect } from 'next/navigation'

/**
 * De pagina Klanten is opgegaan in CRM > Bedrijven (september 2026). Een klant
 * is een bedrijf; uurtarief, klantnummer en factuuradres staan in de
 * detailkaart van dat bedrijf, en de contactpersonen bij Contacten. Oude
 * links en bladwijzers komen hier nog binnen en gaan door naar Bedrijven.
 */
export default function KlantenPagina() {
  redirect('/crm/bedrijven')
}
