import { NextRequest, NextResponse } from 'next/server'
import { exec } from 'child_process'
import { promisify } from 'util'
import { homedir } from 'os'

const execAsync = promisify(exec)

const HOME = process.env.DALEY_WERK_ROOT ?? `${homedir()}/Documents/DALEY WERK`

const FACTUREN_PATHS: Record<string, string> = {
  wgb: `${HOME}/We Grow Brands/Bedrijf Administratie/Facturen`,
  daleyphotography: `${HOME}/Bedrijf Administratie/Verkoopfacturen`,
  tde: `${HOME}/Bedrijf Administratie/Verkoopfacturen`,
}

const DEFAULT_PATH = HOME

export async function POST(request: NextRequest) {
  try {
    const { company } = await request.json()
    const folderPath = FACTUREN_PATHS[company as string] ?? DEFAULT_PATH
    await execAsync(`open "${folderPath}"`)
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
