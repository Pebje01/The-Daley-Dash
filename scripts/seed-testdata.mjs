#!/usr/bin/env node
/**
 * Vult de database van de TESTVERSIE met nepdata. Maakt hem eerst helemaal leeg.
 *
 *   npm run testdb:vullen
 *
 * Leest uitsluitend .env.test.local, nooit .env.local, en weigert als de
 * data-URL naar het live project wijst of niet lokaal is. Dit script gooit
 * tabellen leeg: op de verkeerde database is dat je hele administratie.
 */
import { readFileSync } from 'fs'
import { createClient } from '@supabase/supabase-js'
import { vulTestdata } from '../lib/testdata/vulTestdata.mjs'

const LIVE_PROJECT_REF = 'fvywfygsjslojpvqrpxw'

function leesEnv(bestand) {
  const env = {}
  for (const regel of readFileSync(bestand, 'utf8').split('\n')) {
    const m = regel.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
  }
  return env
}

const env = leesEnv(new URL('../.env.test.local', import.meta.url))
const url = env.SUPABASE_DATA_URL
const key = env.SUPABASE_DATA_SECRET_KEY

if (!url || !key) {
  console.error('SUPABASE_DATA_URL of SUPABASE_DATA_SECRET_KEY ontbreekt in .env.test.local')
  process.exit(1)
}
if (url.includes(LIVE_PROJECT_REF) || !/^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(url)) {
  console.error(`Geweigerd: ${url} is niet de lokale testdatabase.`)
  process.exit(1)
}

const supabase = createClient(url, key, { auth: { persistSession: false } })
const sjablonen = JSON.parse(readFileSync(new URL('../testversie/crm-veldsjablonen.json', import.meta.url), 'utf8'))

const resultaat = await vulTestdata(supabase, { sjablonen })
console.log('Testdata gevuld:', resultaat)
