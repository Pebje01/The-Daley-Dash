/**
 * Tests voor de periodegrenzen. Draaien met: npm test
 *
 * Deze tests bestaan omdat de omzetkaarten op het dashboard maandenlang met
 * alleen een ondergrens filterden. Een factuur met een datum in de toekomst
 * telde daardoor mee in "deze maand" en in het verkeerde jaar. De testen
 * hieronder leggen precies dat vast.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { jaarPeriode, maandPeriode, valtBinnen, alleenDatum } from './periode.mjs'

const peil = new Date(2026, 7, 1) // 1 augustus 2026

test('maandperiode loopt van de eerste tot en met de laatste dag', () => {
  assert.deepEqual(maandPeriode(peil), { begin: '2026-08-01', eind: '2026-08-31' })
})

test('maandperiode kent het aantal dagen per maand', () => {
  assert.equal(maandPeriode(new Date(2026, 1, 15)).eind, '2026-02-28')
  assert.equal(maandPeriode(new Date(2024, 1, 15)).eind, '2024-02-29') // schrikkeljaar
  assert.equal(maandPeriode(new Date(2026, 3, 10)).eind, '2026-04-30')
})

test('jaarperiode loopt van 1 januari tot en met 31 december', () => {
  assert.deepEqual(jaarPeriode(peil), { begin: '2026-01-01', eind: '2026-12-31' })
})

test('een factuur later deze maand telt mee', () => {
  assert.equal(valtBinnen('2026-08-04', maandPeriode(peil)), true)
})

test('een factuur van volgende maand telt NIET mee in deze maand', () => {
  // Dit ging fout: met alleen een ondergrens telde december al mee in augustus.
  assert.equal(valtBinnen('2026-09-01', maandPeriode(peil)), false)
  assert.equal(valtBinnen('2026-12-15', maandPeriode(peil)), false)
})

test('een factuur van volgend jaar telt NIET mee in dit jaar', () => {
  assert.equal(valtBinnen('2027-01-05', jaarPeriode(peil)), false)
})

test('een factuur van vorig jaar telt NIET mee in dit jaar', () => {
  assert.equal(valtBinnen('2025-12-31', jaarPeriode(peil)), false)
})

test('randen van de periode tellen mee', () => {
  assert.equal(valtBinnen('2026-08-01', maandPeriode(peil)), true)
  assert.equal(valtBinnen('2026-08-31', maandPeriode(peil)), true)
  assert.equal(valtBinnen('2026-01-01', jaarPeriode(peil)), true)
  assert.equal(valtBinnen('2026-12-31', jaarPeriode(peil)), true)
})

test('een lege of ontbrekende datum telt nooit mee', () => {
  assert.equal(valtBinnen('', maandPeriode(peil)), false)
  assert.equal(valtBinnen(alleenDatum(null), maandPeriode(peil)), false)
  assert.equal(valtBinnen(alleenDatum(undefined), jaarPeriode(peil)), false)
})

test('alleenDatum knipt de tijd eraf', () => {
  assert.equal(alleenDatum('2026-07-29T22:56:11.851+00:00'), '2026-07-29')
  assert.equal(alleenDatum('2026-07-29'), '2026-07-29')
})
