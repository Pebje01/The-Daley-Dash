import fs, { type Dirent } from 'fs'
import path from 'path'
import { homedir } from 'os'
import { IS_TEST } from '@/lib/dashModus'

const HOME = process.env.DALEY_WERK_ROOT ?? `${homedir()}/Documents/DALEY WERK`

function envPaths(value: string | undefined): string[] {
  // De testversie erft .env.local, en daarin wijzen ADMIN_*_PATH naar de echte
  // administratie. In test tellen alleen de mappen onder de zandbak (DALEY_WERK_ROOT).
  if (IS_TEST) return []
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

// De twee mappen onder `We Grow Brands/Bedrijf Administratie` staan hier niet
// meer in: ze zijn leeg en worden nergens meer gevuld. PDF's van WGB-facturen
// gaan net als die van de andere bedrijven naar Verkoopfacturen, zie
// `pdfPadVoorFactuur` in lib/pdf/factuurGenerator.ts. Zolang ze wel gescand
// werden, leverde een kopie daar een dubbel nummer op. Zoeken doen we er nog
// wel, via getAdminZoekPaths, want een oud bestand kan er nog liggen.
//
// Montung (VOF BB-Import, voorheen Bleijenberg) staat bewust NIET in deze lijsten.
// Dat is een aparte VOF met een eigen BTW-nummer, eigen nummerreeks en een eigen
// systeem in montung-voorraad. Die facturen horen niet in de omzet van de Dash.
export function getAdminFacturenPaths(): string[] {
  return unique([
    ...envPaths(process.env.ADMIN_FACTUREN_PATH),
    `${HOME}/Bedrijf Administratie/Verkoopfacturen`,
    `${HOME}/Bedrijf Administratie/Facturen`,
    `${HOME}/DALEY PHOTOGRAPHY/Facturen`,
  ])
}

export function getAdminOffertesPaths(): string[] {
  return unique([
    ...envPaths(process.env.ADMIN_OFFERTES_PATH),
    `${HOME}/Bedrijf Administratie/Offertes`,
  ])
}

export function getAdminDocumentPaths(): string[] {
  return unique([...getAdminFacturenPaths(), ...getAdminOffertesPaths()])
}

/**
 * Mappen waarin we zoeken als een PDF niet meer op zijn vaste plek ligt.
 * Ruimer dan de scanmappen, want een verplaatst bestand is geen verwijderd
 * bestand. Bevat bewust ook `_Concepten` en `_Teruggezet`, die de scan overslaat.
 */
function getAdminZoekPaths(): string[] {
  return unique([
    ...getAdminDocumentPaths(),
    `${HOME}/Bedrijf Administratie`,
    `${HOME}/We Grow Brands/Bedrijf Administratie`,
    `${HOME}/DALEY PHOTOGRAPHY`,
  ])
}

/**
 * Zoekt de PDF van een factuur- of offertenummer in de hele administratie.
 *
 * Hiermee kan de sync het verschil zien tussen "de PDF is verplaatst" en "de
 * PDF is echt weg". Dat onderscheid ontbrak, waardoor een factuur waarvan de
 * PDF naar een andere map ging uit de database verdween.
 */
export function zoekDocumentBestand(nummer: string): string | null {
  const doel = nummer.toUpperCase()
  const bezocht = new Set<string>()

  function loop(map: string, diepte: number): string | null {
    if (diepte > 6) return null
    const echt = path.resolve(map)
    if (bezocht.has(echt)) return null
    bezocht.add(echt)

    let entries: Dirent[]
    try {
      entries = fs.readdirSync(echt, { withFileTypes: true })
    } catch {
      return null
    }

    for (const entry of entries) {
      const vol = path.join(echt, entry.name)
      if (entry.isFile()) {
        if (!entry.name.toLowerCase().endsWith('.pdf')) continue
        if (entry.name.toUpperCase().startsWith(doel)) return vol
      }
    }
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith('.')) continue
      const gevonden = loop(path.join(echt, entry.name), diepte + 1)
      if (gevonden) return gevonden
    }
    return null
  }

  for (const basis of getAdminZoekPaths()) {
    const gevonden = loop(basis, 0)
    if (gevonden) return gevonden
  }
  return null
}

export function isAllowedAdminDocumentPath(absolutePath: string): boolean {
  const resolved = path.resolve(absolutePath)
  return getAdminDocumentPaths().some(base => {
    const resolvedBase = path.resolve(base)
    return resolved === resolvedBase || resolved.startsWith(`${resolvedBase}${path.sep}`)
  })
}
