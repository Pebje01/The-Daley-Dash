'use client'

import jsPDF from 'jspdf'
import { Offerte } from '../types'
import { Company } from '../types'

const euro = (n: number) =>
  new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(n)

// Parse hex color to RGB
function hexToRgb(hex: string): [number, number, number] {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  if (!result) return [3, 72, 58] // fallback green-dark
  return [parseInt(result[1], 16), parseInt(result[2], 16), parseInt(result[3], 16)]
}

// Darken a color by a factor (0-1)
function darken(rgb: [number, number, number], factor: number): [number, number, number] {
  return [
    Math.round(rgb[0] * (1 - factor)),
    Math.round(rgb[1] * (1 - factor)),
    Math.round(rgb[2] * (1 - factor)),
  ]
}

// Lighten a color towards white
function lighten(rgb: [number, number, number], factor: number): [number, number, number] {
  return [
    Math.round(rgb[0] + (255 - rgb[0]) * factor),
    Math.round(rgb[1] + (255 - rgb[1]) * factor),
    Math.round(rgb[2] + (255 - rgb[2]) * factor),
  ]
}

export function generateOffertePdf(offerte: Offerte, company: Company) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const pw = 210, ml = 20, rx = pw - 20, cw = pw - 40
  let y = 0

  const brandRgb = hexToRgb(company.color)
  const brandDark = darken(brandRgb, 0.35)
  const brandLight = lighten(brandRgb, 0.85)
  const brandMuted = lighten(brandRgb, 0.5)

  // ── Header ─────────────────────────────────────────────────────
  doc.setFillColor(...brandRgb)
  doc.rect(0, 0, pw, 36, 'F')

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(22)
  doc.setTextColor(255, 255, 255)
  doc.text('OFFERTE', ml, 18)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)
  doc.setTextColor(...brandMuted)
  doc.text(company.name.toUpperCase(), ml, 24)

  // Company info right side
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(255, 255, 255)
  doc.text(company.name, rx, 10, { align: 'right' })
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(210, 225, 220)
  doc.text(company.address, rx, 15, { align: 'right' })
  doc.text(`${company.email} | ${company.phone}`, rx, 20, { align: 'right' })
  doc.setTextColor(160, 190, 180)
  doc.text(`KVK: ${company.kvk} | BTW: ${company.btw}`, rx, 25, { align: 'right' })

  // ── Meta bar ───────────────────────────────────────────────────
  doc.setFillColor(...brandDark)
  doc.rect(0, 36, pw, 14, 'F')
  const metas = [
    { label: 'OFFERTENUMMER', value: offerte.number },
    { label: 'DATUM', value: new Date(offerte.date).toLocaleDateString('nl-NL') },
    { label: 'GELDIG TOT', value: new Date(offerte.validUntil).toLocaleDateString('nl-NL') },
  ]
  metas.forEach((m, i) => {
    const mx = ml + i * 50
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(6)
    doc.setTextColor(...brandMuted)
    doc.text(m.label, mx, 41.5)
    doc.setFontSize(9)
    doc.setTextColor(255, 255, 255)
    doc.text(m.value, mx, 46.5)
  })

  y = 58

  // ── Client info box ────────────────────────────────────────────
  doc.setFillColor(245, 245, 245)
  doc.roundedRect(ml, y, cw, 18, 3, 3, 'F')
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(6)
  doc.setTextColor(160, 160, 160)
  doc.text('KLANT', ml + 6, y + 5)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(30, 30, 30)
  doc.text(offerte.client.name, ml + 6, y + 11)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(100, 100, 100)
  if (offerte.client.contactPerson) doc.text(`t.a.v. ${offerte.client.contactPerson}`, ml + 6, y + 15.5)
  if (offerte.client.email) doc.text(offerte.client.email, rx - 6, y + 11, { align: 'right' })

  y += 26

  // ── Intro text ───────────────────────────────────────────────────
  if (offerte.introText) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(60, 60, 60)
    const introLines = doc.splitTextToSize(offerte.introText, cw)
    doc.text(introLines, ml, y)
    y += introLines.length * 4 + 6
  }

  // ── Group items by section ─────────────────────────────────────
  const pdfSections: { title: string; items: typeof offerte.items }[] = []
  for (const item of offerte.items) {
    const title = item.sectionTitle || ''
    const last = pdfSections[pdfSections.length - 1]
    if (last && last.title === title) {
      last.items.push(item)
    } else {
      pdfSections.push({ title, items: [item] })
    }
  }

  for (const section of pdfSections) {
    // Section header
    if (section.title) {
      if (y > 255) { doc.addPage(); y = 20 }
      doc.setFillColor(...brandLight)
      doc.rect(ml, y, cw, 7, 'F')
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(8)
      doc.setTextColor(...brandDark)
      doc.text(section.title.toUpperCase(), ml + 4, y + 5)
      y += 10
    }

    // Table header
    doc.setFillColor(...brandLight)
    doc.rect(ml, y, cw, 8, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7)
    doc.setTextColor(...brandRgb)
    doc.text('OMSCHRIJVING', ml + 4, y + 5.5)
    doc.text('AANTAL', ml + 100, y + 5.5)
    doc.text('PRIJS', ml + 120, y + 5.5)
    doc.text('TOTAAL', rx - 4, y + 5.5, { align: 'right' })
    y += 12

    // Items
    doc.setFontSize(9)
    for (const item of section.items) {
      if (y > 255) { doc.addPage(); y = 20 }
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(30, 30, 30)
      doc.text(item.description, ml + 4, y)
      doc.setFont('helvetica', 'normal')
      doc.text(String(item.quantity), ml + 100, y)
      doc.text(euro(item.unitPrice), ml + 120, y)
      doc.text(euro(item.quantity * item.unitPrice), rx - 4, y, { align: 'right' })
      y += 4
      if (item.details) {
        doc.setFontSize(7.5)
        doc.setTextColor(120, 120, 120)
        const lines = doc.splitTextToSize(item.details, 90)
        doc.text(lines, ml + 4, y)
        y += lines.length * 3.5
        doc.setFontSize(9)
      }
      doc.setDrawColor(230, 230, 230)
      doc.line(ml, y + 1, rx, y + 1)
      y += 5
    }
    y += 3
  }

  // ── Totals ─────────────────────────────────────────────────────
  y += 5
  const tx = ml + cw - 70
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(100, 100, 100)
  doc.text('Subtotaal', tx, y)
  doc.setTextColor(30, 30, 30)
  doc.text(euro(offerte.subtotal), rx - 4, y, { align: 'right' })
  y += 6
  doc.setTextColor(100, 100, 100)
  doc.text(`BTW ${offerte.btwPercentage}%`, tx, y)
  doc.setTextColor(30, 30, 30)
  doc.text(euro(offerte.btwAmount), rx - 4, y, { align: 'right' })
  y += 3
  doc.setDrawColor(...brandRgb)
  doc.line(tx, y, rx, y)
  y += 6
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.setTextColor(...brandRgb)
  doc.text('Totaal', tx, y)
  doc.text(euro(offerte.total), rx - 4, y, { align: 'right' })

  // ── Terms ────────────────────────────────────────────────────────
  const termsOrNotes = offerte.termsText || offerte.notes
  if (termsOrNotes) {
    y += 14
    if (y > 260) { doc.addPage(); y = 20 }
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    doc.setTextColor(100, 100, 100)
    doc.text('VOORWAARDEN & OPMERKINGEN', ml, y)
    y += 5
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(60, 60, 60)
    const termLines = doc.splitTextToSize(termsOrNotes, cw)
    doc.text(termLines, ml, y)
  }

  // ── Footer ─────────────────────────────────────────────────────
  const fy = 282
  doc.setDrawColor(200, 200, 200)
  doc.line(ml, fy, rx, fy)
  doc.setFontSize(7)
  doc.setTextColor(160, 160, 160)
  doc.text(`${company.name} · ${company.email} · KVK: ${company.kvk} · IBAN: ${company.iban}`, pw / 2, fy + 4, { align: 'center' })

  return doc
}

export async function downloadOffertePdf(offerte: Offerte, company: Company) {
  const { savePdfToFolder } = await import('./folderStorage')
  const doc = generateOffertePdf(offerte, company)
  const filename = `offerte-${offerte.number}.pdf`
  const blob = doc.output('blob')

  // Try saving to the offerte folder first
  const savedToFolder = await savePdfToFolder(blob, filename)

  if (!savedToFolder) {
    // Fallback: normal browser download
    doc.save(filename)
  }
}
