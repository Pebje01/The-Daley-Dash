'use client'

import jsPDF from 'jspdf'
import { Offerte } from '../types'
import { Company } from '../types'
import { instrumentSerifBase64 } from './instrumentSerif'

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

  // Registreer Instrument Serif font
  doc.addFileToVFS('InstrumentSerif-Regular.ttf', instrumentSerifBase64)
  doc.addFont('InstrumentSerif-Regular.ttf', 'InstrumentSerif', 'normal')

  // ── Header ─────────────────────────────────────────────────────
  doc.setFillColor(...brandRgb)
  doc.rect(0, 0, pw, 36, 'F')

  doc.setFont('InstrumentSerif', 'normal')
  doc.setFontSize(24)
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

  // Split diensten vs prijsoverzicht
  const serviceSections = pdfSections.filter(s => s.title.toLowerCase() !== 'prijsoverzicht')
  const pricingSection = pdfSections.find(s => s.title.toLowerCase() === 'prijsoverzicht')

  // ── Diensten als opsomming ─────────────────────────────────────
  for (const section of serviceSections) {
    if (y > 250) { doc.addPage(); y = 20 }

    // Section header
    if (section.title) {
      doc.setFillColor(...brandLight)
      doc.roundedRect(ml, y, cw, 8, 2, 2, 'F')
      doc.setFont('InstrumentSerif', 'normal')
      doc.setFontSize(12)
      doc.setTextColor(...brandDark)
      doc.text(section.title, ml + 5, y + 5.5)
      y += 12
    }

    // Bullet-point lijst
    for (const item of section.items) {
      if (y > 260) { doc.addPage(); y = 20 }

      // Bullet dot in brand kleur
      doc.setFillColor(...brandRgb)
      doc.circle(ml + 5, y - 1, 1, 'F')

      // Beschrijving (bold) + details (normaal)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(9)
      doc.setTextColor(30, 30, 30)
      doc.text(item.description, ml + 10, y)

      if (item.details) {
        y += 4
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(8)
        doc.setTextColor(100, 100, 100)
        const detailLines = doc.splitTextToSize(item.details, cw - 10)
        doc.text(detailLines, ml + 10, y)
        y += (detailLines.length - 1) * 3.5
      }
      y += 6
    }
    y += 4
  }

  // ── Prijsoverzicht ─────────────────────────────────────────────
  if (y > 230) { doc.addPage(); y = 20 }
  y += 4

  doc.setFont('InstrumentSerif', 'normal')
  doc.setFontSize(14)
  doc.setTextColor(...brandRgb)
  doc.text('Prijsoverzicht', ml, y)
  y += 8

  // Pricing items
  if (pricingSection) {
    for (const item of pricingSection.items) {
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(9)
      doc.setTextColor(60, 60, 60)
      doc.text(item.description, ml, y)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(30, 30, 30)
      doc.text(euro(item.quantity * item.unitPrice), rx, y, { align: 'right' })
      y += 6
    }
  }

  // Divider
  const tx = ml + cw - 70
  doc.setDrawColor(220, 220, 220)
  doc.line(tx, y, rx, y)
  y += 5

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(100, 100, 100)
  doc.text('Subtotaal', tx, y)
  doc.setTextColor(30, 30, 30)
  doc.text(euro(offerte.subtotal), rx, y, { align: 'right' })
  y += 6
  doc.setTextColor(100, 100, 100)
  doc.text(`BTW ${offerte.btwPercentage}%`, tx, y)
  doc.setTextColor(30, 30, 30)
  doc.text(euro(offerte.btwAmount), rx, y, { align: 'right' })
  y += 3
  doc.setDrawColor(...brandRgb)
  doc.line(tx, y, rx, y)
  y += 6

  // Totaal met brand achtergrond
  doc.setFillColor(...brandLight)
  doc.roundedRect(tx - 4, y - 5, rx - tx + 8, 12, 2, 2, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.setTextColor(...brandRgb)
  doc.text('Totaal incl. btw', tx, y + 1)
  doc.text(euro(offerte.total), rx, y + 1, { align: 'right' })

  // Aanbetaling
  y += 14
  doc.setFillColor(...brandRgb)
  doc.roundedRect(tx - 4, y - 5, rx - tx + 8, 14, 2, 2, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(255, 255, 255)
  doc.text('Aanbetaling (50%)', tx, y)
  doc.setFontSize(11)
  doc.text(euro(offerte.total / 2), rx, y, { align: 'right' })
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)
  doc.text(`Restant bij oplevering: ${euro(offerte.total / 2)}`, tx, y + 5)

  // Betaallink
  if (offerte.paymentUrl) {
    y += 14
    const linkText = `Betaal aanbetaling: ${offerte.paymentUrl}`
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    doc.setTextColor(...brandRgb)
    doc.textWithLink(linkText, ml, y, { url: offerte.paymentUrl })
    doc.setDrawColor(...brandRgb)
    doc.line(ml, y + 1, ml + doc.getTextWidth(linkText), y + 1)
  }

  // ── Terms ────────────────────────────────────────────────────────
  const termsOrNotes = offerte.termsText || offerte.notes
  if (termsOrNotes) {
    y += 18
    if (y > 250) { doc.addPage(); y = 20 }

    // Voorwaarden header
    doc.setFillColor(...brandRgb)
    doc.roundedRect(ml, y - 4, cw, 9, 2, 2, 'F')
    doc.setFont('InstrumentSerif', 'normal')
    doc.setFontSize(12)
    doc.setTextColor(255, 255, 255)
    doc.text('Voorwaarden & Opmerkingen', ml + 5, y + 1.5)
    y += 10

    // Bullet-point lijst van voorwaarden
    const termLines = termsOrNotes.split('\n').filter((l: string) => l.trim())
    for (const line of termLines) {
      if (y > 270) { doc.addPage(); y = 20 }
      const cleanLine = line.replace(/^[-•]\s*/, '')
      doc.setFillColor(...brandRgb)
      doc.circle(ml + 5, y - 1, 0.8, 'F')
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8)
      doc.setTextColor(60, 60, 60)
      const wrapped = doc.splitTextToSize(cleanLine, cw - 10)
      doc.text(wrapped, ml + 10, y)
      y += wrapped.length * 3.5 + 2
    }
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

export function downloadOffertePdf(offerte: Offerte, company: Company) {
  const doc = generateOffertePdf(offerte, company)
  const filename = `${offerte.number}.pdf`
  doc.save(filename)
}
