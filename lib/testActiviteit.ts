import { homedir } from 'os'
import { join } from 'path'

/**
 * Tijdstempel van het laatste teken van leven uit de testversie, in seconden.
 *
 * De testversie schrijft hier elke minuut in zolang het tabblad in beeld is
 * (components/TestHartslag.tsx). scripts/test-wachtdienst.sh leest hem elke
 * minuut en sluit de boel af zodra hij ouder is dan 15 minuten.
 *
 * Alleen voor serverkant: dit bestand gebruikt os en path, en die horen niet in
 * de browserbundel. Importeer het dus nooit vanuit een client component.
 */
export const ACTIVITEIT_STEMPEL = join(
  homedir(),
  'Library',
  'Application Support',
  'daley-dash-test',
  'state',
  'laatste-activiteit',
)
