'use client'

import jsPDF from 'jspdf'
import { Offerte, LineItem } from '../types'
import { Company } from '../types'
import { instrumentSerifBase64 } from './instrumentSerif'

const euro = (n: number) =>
  new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(n)

const parseDate = (d: string) =>
  new Date(d.split('T')[0] + 'T00:00:00').toLocaleDateString('nl-NL')

function hexToRgb(hex: string): [number, number, number] {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  if (!result) return [3, 72, 58]
  return [parseInt(result[1], 16), parseInt(result[2], 16), parseInt(result[3], 16)]
}

function darken(rgb: [number, number, number], f: number): [number, number, number] {
  return [Math.round(rgb[0] * (1 - f)), Math.round(rgb[1] * (1 - f)), Math.round(rgb[2] * (1 - f))]
}

function lighten(rgb: [number, number, number], f: number): [number, number, number] {
  return [
    Math.round(rgb[0] + (255 - rgb[0]) * f),
    Math.round(rgb[1] + (255 - rgb[1]) * f),
    Math.round(rgb[2] + (255 - rgb[2]) * f),
  ]
}

type Section = { title: string; items: LineItem[] }

function renderSection(
  doc: jsPDF,
  section: Section,
  x: number,
  startY: number,
  colW: number,
  brand: [number, number, number],
  brandDark: [number, number, number],
  brandLight: [number, number, number],
): number {
  const PAD_X = 7
  const PAD_TOP = 7
  const PAD_BOT = 7
  const LINE_H = 4.2
  const textW = colW - PAD_X * 2 - 5

  // ── Pass 1: measure content height (no drawing) ───────────────────────
  function processItems(originY: number, draw: boolean): number {
    let y = originY
    const tx = x + PAD_X + 5

    if (section.title) {
      if (draw) {
        doc.setFont('InstrumentSerif', 'normal')
        doc.setFontSize(10.5)
        doc.setTextColor(...brandDark)
        doc.text(section.title, x + PAD_X, y + 4)
      }
      y += 12
    }

    for (const item of section.items) {
      const showDesc = item.description !== section.title

      if (draw) {
        doc.setFillColor(...brand)
        doc.circle(x + PAD_X + 1, y - 0.8, 0.65, 'F')
      }

      if (showDesc && item.details) {
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(8)
        const sep = ' \u2013 '
        const dW = doc.getTextWidth(item.description + sep)
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(8)

        if (dW < textW * 0.6) {
          // Same line: bold desc + gray details
          const rest = doc.splitTextToSize(item.details, textW - dW)
          if (draw) {
            doc.setFont('helvetica', 'bold')
            doc.setFontSize(8)
            doc.setTextColor(30, 30, 30)
            doc.text(item.description + sep, tx, y)
            doc.setFont('helvetica', 'normal')
            doc.setTextColor(100, 100, 100)
            doc.text(rest[0], tx + dW, y)
            if (rest.length > 1) doc.text(rest.slice(1), tx + 4, y + LINE_H)
          }
          y += Math.max(1, rest.length) * LINE_H + 1
        } else {
          // Two lines
          doc.setFont('helvetica', 'normal')
          doc.setFontSize(7.5)
          const rest = doc.splitTextToSize(item.details, textW)
          if (draw) {
            doc.setFont('helvetica', 'bold')
            doc.setFontSize(8)
            doc.setTextColor(30, 30, 30)
            doc.text(item.description, tx, y)
            doc.setFont('helvetica', 'normal')
            doc.setFontSize(7.5)
            doc.setTextColor(100, 100, 100)
            doc.text(rest, tx + 2, y + LINE_H)
          }
          y += LINE_H + rest.length * LINE_H + 1
        }
      } else if (showDesc) {
        if (draw) {
          doc.setFont('helvetica', 'bold')
          doc.setFontSize(8)
          doc.setTextColor(30, 30, 30)
          doc.text(item.description, tx, y)
        }
        y += 5
      } else if (item.details) {
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(7.5)
        const lines = doc.splitTextToSize(item.details, textW)
        if (draw) {
          doc.setTextColor(100, 100, 100)
          doc.text(lines, tx, y)
        }
        y += lines.length * LINE_H + 2
      }
    }
    return y
  }

  // Measure pass
  const endY = processItems(startY + PAD_TOP, false)
  const cardH = endY - startY + PAD_BOT

  // ── Draw card ─────────────────────────────────────────────────────────
  doc.setFillColor(...brandLight)
  doc.roundedRect(x, startY, colW, cardH, 3, 3, 'F')
  const bord = brandLight.map(c => Math.max(0, c - 22)) as [number, number, number]
  doc.setDrawColor(...bord)
  doc.setLineWidth(0.25)
  doc.roundedRect(x, startY, colW, cardH, 3, 3, 'S')
  doc.setLineWidth(0.1)

  // Render pass
  processItems(startY + PAD_TOP, true)

  return startY + cardH
}

export function generateOffertePdf(offerte: Offerte, company: Company) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const pw = 210, ml = 18, mr = pw - 18, cw = pw - 36
  let y = 0

  const brand = hexToRgb(company.color)
  const brandDark = darken(brand, 0.3)
  const brandLight = lighten(brand, 0.88)
  const brandMid = lighten(brand, 0.6)
  const brandMuted = lighten(brand, 0.45)

  const depositPct = offerte.depositPercentage ?? 50
  const depositAmount = offerte.total * (depositPct / 100)
  const remainingAmount = offerte.total - depositAmount

  doc.addFileToVFS('InstrumentSerif-Regular.ttf', instrumentSerifBase64)
  doc.addFont('InstrumentSerif-Regular.ttf', 'InstrumentSerif', 'normal')

  // ── Header ───────────────────────────────────────────────────────────
  doc.setFillColor(...brand)
  doc.rect(0, 0, pw, 36, 'F')

  // Logo links (als beschikbaar), anders tekst
  if (company.logoBase64) {
    doc.addImage(company.logoBase64, 'PNG', ml, 7, 22, 22)
    // "OFFERTE" naast het logo
    doc.setFont('InstrumentSerif', 'normal')
    doc.setFontSize(22)
    doc.setTextColor(255, 255, 255)
    doc.text('OFFERTE', ml + 26, 22)
  } else {
    doc.setFont('InstrumentSerif', 'normal')
    doc.setFontSize(26)
    doc.setTextColor(255, 255, 255)
    doc.text('OFFERTE', ml, 22)
  }

  // Bedrijfsinfo rechts
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(255, 255, 255)
  doc.text(company.name, mr, 13, { align: 'right' })
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)
  doc.setTextColor(...brandMid)
  doc.text(company.address, mr, 19, { align: 'right' })
  doc.text(`${company.email}  |  ${company.phone}`, mr, 24, { align: 'right' })
  doc.setTextColor(...brandMuted)
  doc.text(`KVK: ${company.kvk}  |  BTW: ${company.btw}`, mr, 29, { align: 'right' })

  // ── Meta balk ────────────────────────────────────────────────────────
  doc.setFillColor(...brandDark)
  doc.rect(0, 36, pw, 14, 'F')

  const metas = [
    { label: 'OFFERTENUMMER', value: offerte.number },
    { label: 'DATUM', value: parseDate(offerte.date) },
    { label: 'GELDIG TOT', value: parseDate(offerte.validUntil) },
  ]
  metas.forEach((m, i) => {
    const mx = ml + i * 58
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(6)
    doc.setTextColor(...brandMuted)
    doc.text(m.label, mx, 41)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.setTextColor(255, 255, 255)
    doc.text(m.value, mx, 47)
  })

  y = 58

  // ── Klantgegevens ────────────────────────────────────────────────────
  doc.setFillColor(247, 247, 246)
  doc.roundedRect(ml, y, cw, 18, 3, 3, 'F')

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(6)
  doc.setTextColor(170, 170, 170)
  doc.text('KLANT', ml + 5, y + 5)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10.5)
  doc.setTextColor(25, 25, 25)
  doc.text(offerte.client.name, ml + 5, y + 11)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)
  doc.setTextColor(110, 110, 110)
  if (offerte.client.contactPerson) doc.text(`t.a.v. ${offerte.client.contactPerson}`, ml + 5, y + 15.5)
  if (offerte.client.email) doc.text(offerte.client.email, mr - 4, y + 11, { align: 'right' })
  if (offerte.client.phone) doc.text(offerte.client.phone, mr - 4, y + 15.5, { align: 'right' })

  y += 25

  // ── Intro tekst ──────────────────────────────────────────────────────
  if (offerte.introText) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8.5)
    doc.setTextColor(75, 75, 75)
    const lines = doc.splitTextToSize(offerte.introText, cw)
    doc.text(lines, ml, y)
    y += lines.length * 4 + 6
  }

  // ── Diensten ─────────────────────────────────────────────────────────
  const allSections: Section[] = []
  for (const item of offerte.items) {
    const title = item.sectionTitle || ''
    const last = allSections[allSections.length - 1]
    if (last && last.title === title) last.items.push(item)
    else allSections.push({ title, items: [item] })
  }
  const serviceSections = allSections.filter(s => s.title.toLowerCase() !== 'prijsoverzicht')
  const pricingSection = allSections.find(s => s.title.toLowerCase() === 'prijsoverzicht')

  const gap = 7
  const colW2 = (cw - gap) / 2

  if (serviceSections.length >= 2) {
    // Render in pairs of 2 columns
    for (let i = 0; i < serviceSections.length; i += 2) {
      const left = serviceSections[i]
      const right = serviceSections[i + 1]
      const rowStartY = y
      const leftEndY = renderSection(doc, left, ml, rowStartY, right ? colW2 : cw, brand, brandDark, brandLight)
      const rightEndY = right
        ? renderSection(doc, right, ml + colW2 + gap, rowStartY, colW2, brand, brandDark, brandLight)
        : rowStartY
      y = Math.max(leftEndY, rightEndY) + gap
    }
  } else {
    for (const section of serviceSections) {
      y = renderSection(doc, section, ml, y, cw, brand, brandDark, brandLight)
      y += gap
    }
  }

  // ── Prijsoverzicht ───────────────────────────────────────────────────
  // Lichte achtergrond over volledige breedte
  const priceStartY = y
  // Tabel rechterkant
  const tx = mr - 72

  // Optionele section items (prijsoverzicht sectie)
  if (pricingSection) {
    for (const item of pricingSection.items) {
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8.5)
      doc.setTextColor(70, 70, 70)
      doc.text(item.description, ml, y)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(30, 30, 30)
      doc.text(euro(item.quantity * item.unitPrice), mr, y, { align: 'right' })
      y += 5.5
    }
    y += 2
  }

  // Lijn boven subtotaal
  doc.setDrawColor(225, 225, 225)
  doc.line(tx, y, mr, y)
  y += 5

  // Subtotaal
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  doc.setTextColor(110, 110, 110)
  doc.text('Subtotaal', tx, y)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(40, 40, 40)
  doc.text(euro(offerte.subtotal), mr, y, { align: 'right' })
  y += 5.5

  // BTW
  doc.setTextColor(110, 110, 110)
  doc.text(`BTW ${offerte.btwPercentage}%`, tx, y)
  doc.setTextColor(40, 40, 40)
  doc.text(euro(offerte.btwAmount), mr, y, { align: 'right' })
  y += 4

  // Dubbele lijn boven totaal
  doc.setDrawColor(...brand)
  doc.setLineWidth(0.4)
  doc.line(tx, y, mr, y)
  doc.setLineWidth(0.1)
  y += 6

  // Totaal box
  doc.setFillColor(...brandLight)
  doc.roundedRect(tx - 4, y - 4.5, mr - tx + 7, 12, 2, 2, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11.5)
  doc.setTextColor(...brandDark)
  doc.text('Totaal incl. btw', tx, y + 2.5)
  doc.text(euro(offerte.total), mr, y + 2.5, { align: 'right' })
  y += 14

  void priceStartY // suppress unused warning

  // ── Voorwaarden ──────────────────────────────────────────────────────
  const termsOrNotes = offerte.termsText || offerte.notes
  if (termsOrNotes) {
    y += 4

    // Sectieheader
    doc.setFillColor(...brand)
    doc.roundedRect(ml, y - 3, cw, 9, 2, 2, 'F')
    doc.setFont('InstrumentSerif', 'normal')
    doc.setFontSize(11)
    doc.setTextColor(255, 255, 255)
    doc.text('Voorwaarden & Opmerkingen', ml + 5, y + 2.5)
    y += 12

    const lines = termsOrNotes.split('\n').filter((l: string) => l.trim())
    for (const line of lines) {
      const clean = line.replace(/^[-•]\s*/, '')
      doc.setFillColor(...brand)
      doc.circle(ml + 3.5, y - 1.2, 0.7, 'F')
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(7.5)
      doc.setTextColor(65, 65, 65)
      const wrapped = doc.splitTextToSize(clean, cw - 9)
      doc.text(wrapped, ml + 8, y)
      y += wrapped.length * 3.4 + 1.5
    }
    y += 4
  }

  // ── Aanbetaling onderaan ─────────────────────────────────────────────
  // Volledige brede aanbetaling-box
  const abH = 20
  doc.setFillColor(...brand)
  doc.roundedRect(ml, y, cw, abH, 3, 3, 'F')

  // Links: aanbetaling label + restant
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(255, 255, 255)
  doc.text(`Aanbetaling (${depositPct}%)`, ml + 6, y + 8)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)
  doc.setTextColor(...brandMuted)
  doc.text(`Restant (${100 - depositPct}%): ${euro(remainingAmount)}`, ml + 6, y + 14)

  // Rechts: bedrag groot
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.setTextColor(255, 255, 255)
  doc.text(euro(depositAmount), mr - 6, y + 12, { align: 'right' })

  y += abH + 5

  // Betaalknop
  if (offerte.paymentUrl) {
    const btnLabel = `Betaal aanbetaling: ${euro(depositAmount)}`
    const btnW = 100
    const btnH = 10
    const btnX = ml + (cw - btnW) / 2
    doc.setFillColor(22, 163, 74) // donkergroen
    doc.roundedRect(btnX, y, btnW, btnH, 2.5, 2.5, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8.5)
    doc.setTextColor(255, 255, 255)
    doc.textWithLink(btnLabel, btnX + btnW / 2, y + 6.5, { url: offerte.paymentUrl, align: 'center' })
    y += btnH + 4
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7)
    doc.setTextColor(150, 150, 150)
    doc.text('Veilig betalen via iDEAL', ml + cw / 2, y, { align: 'center' })
    y += 5
  }

  // ── Footer ───────────────────────────────────────────────────────────
  const fy = 284
  doc.setDrawColor(215, 215, 215)
  doc.line(ml, fy, mr, fy)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)
  doc.setTextColor(165, 165, 165)
  doc.text(
    `${company.name}  ·  ${company.email}  ·  KVK: ${company.kvk}  ·  IBAN: ${company.iban}`,
    pw / 2, fy + 4.5, { align: 'center' }
  )

  return doc
}

export async function saveOffertePdf(offerte: Offerte, company: Company): Promise<'folder' | 'download'> {
  const { savePdfToFolder } = await import('./folderStorage')
  const doc = generateOffertePdf(offerte, company)
  const filename = `${offerte.number}.pdf`

  try {
    const blob = doc.output('blob')
    const savedToFolder = await savePdfToFolder(blob, filename)
    if (savedToFolder) return 'folder'
  } catch {
    // File System Access API niet beschikbaar
  }

  doc.save(filename)
  return 'download'
}

/** @deprecated Gebruik saveOffertePdf() in plaats hiervan */
export function downloadOffertePdf(offerte: Offerte, company: Company) {
  const doc = generateOffertePdf(offerte, company)
  doc.save(`${offerte.number}.pdf`)
}
