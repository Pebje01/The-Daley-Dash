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

export function getAdminFacturenPaths(): string[] {
  return unique([
    ...envPaths(process.env.ADMIN_FACTUREN_PATH),
    `${HOME}/Bedrijf Administratie/Verkoopfacturen`,
    `${HOME}/Bedrijf Administratie/Facturen`,
    `${HOME}/We Grow Brands/Bedrijf Administratie/Facturen`,
    `${HOME}/DALEY PHOTOGRAPHY/Facturen`,
    `${HOME}/Bleijenberg_Montung/Administratie/Facturen`,
    `${HOME}/Montung/Documenten/Administratie/Verkoopfacturen`,
  ])
}

export function getAdminOffertesPaths(): string[] {
  return unique([
    ...envPaths(process.env.ADMIN_OFFERTES_PATH),
    `${HOME}/Bedrijf Administratie/Offertes`,
    `${HOME}/We Grow Brands/Bedrijf Administratie/Offertes`,
    `${HOME}/Bleijenberg_Montung/Administratie/Offertes`,
    `${HOME}/Montung/Documenten/Administratie/Offertes`,
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
