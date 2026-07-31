import path from 'path'
import { homedir } from 'os'

const HOME = process.env.DALEY_WERK_ROOT ?? `${homedir()}/Documents/DALEY WERK`

function envPaths(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map(p => p.trim())
    .filter(Boolean)
}

function unique(paths: string[]): string[] {
  const seen = new Set<string>()
  return paths
    .map(p => path.resolve(p))
    .filter(p => {
      if (seen.has(p)) return false
      seen.add(p)
      return true
    })
}

/**
 * Map waarin concept-facturen landen. De scan slaat mappen die met _ beginnen
 * over, zodat een concept nooit als echte factuur meegesynct wordt.
 */
export const CONCEPTEN_MAP = '_Concepten'

/**
 * Map waar PDF's van teruggezette facturen heen gaan. Weggooien doen we niet,
 * maar ze mogen ook niet in het archief blijven staan: dan pikt de sync ze weer
 * op en kan hun nummer intussen aan een andere factuur zijn uitgegeven.
 */
export const VERWIJDERD_MAP = '_Teruggezet'

// Montung (VOF BB-Import, voorheen Bleijenberg) staat bewust NIET in deze lijsten.
// Dat is een aparte VOF met een eigen BTW-nummer, eigen nummerreeks en een eigen
// systeem in montung-voorraad. Die facturen horen niet in de omzet van de Dash.
export function getAdminFacturenPaths(): string[] {
  return unique([
    ...envPaths(process.env.ADMIN_FACTUREN_PATH),
    `${HOME}/Bedrijf Administratie/Verkoopfacturen`,
    `${HOME}/Bedrijf Administratie/Facturen`,
    `${HOME}/We Grow Brands/Bedrijf Administratie/Facturen`,
    `${HOME}/DALEY PHOTOGRAPHY/Facturen`,
  ])
}

export function getAdminOffertesPaths(): string[] {
  return unique([
    ...envPaths(process.env.ADMIN_OFFERTES_PATH),
    `${HOME}/Bedrijf Administratie/Offertes`,
    `${HOME}/We Grow Brands/Bedrijf Administratie/Offertes`,
  ])
}

export function getAdminDocumentPaths(): string[] {
  return unique([...getAdminFacturenPaths(), ...getAdminOffertesPaths()])
}

export function isAllowedAdminDocumentPath(absolutePath: string): boolean {
  const resolved = path.resolve(absolutePath)
  return getAdminDocumentPaths().some(base => {
    const resolvedBase = path.resolve(base)
    return resolved === resolvedBase || resolved.startsWith(`${resolvedBase}${path.sep}`)
  })
}
