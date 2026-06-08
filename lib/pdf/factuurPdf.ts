'use client'

import jsPDF from 'jspdf'
import { Factuur, LineItem } from '../types'
import { Company } from '../types'
import { instrumentSerifBase64 } from './instrumentSerif'

const euro = (n: number) =>
  new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(n)

const formatDate = (d: string) =>
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

export function generateFactuurPdf(factuur: Factuur, company: Company): jsPDF {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })

  const PW = 210
  const ML = 18
  const MR = PW - 18
  const CW = PW - 36
  const FOOTER_Y = 284
  const SAFE_BOTTOM = 268

  let y = 0

  const brand    = hexToRgb(company.color)
  const brandDark  = darken(brand, 0.3)
  const brandLight = lighten(brand, 0.88)
  const brandMid   = lighten(brand, 0.6)
  const brandMuted = lighten(brand, 0.45)

  doc.addFileToVFS('InstrumentSerif-Regular.ttf', instrumentSerifBase64)
  doc.addFont('InstrumentSerif-Regular.ttf', 'InstrumentSerif', 'normal')

  // ── Header ───────────────────────────────────────────────────────────────
  doc.setFillColor(...brand)
  doc.rect(0, 0, PW, 36, 'F')

  if (company.logoBase64) {
    doc.addImage(company.logoBase64, 'PNG', ML, 7, 22, 22)
    doc.setFont('InstrumentSerif', 'normal')
    doc.setFontSize(22)
    doc.setTextColor(255, 255, 255)
    doc.text('FACTUUR', ML + 26, 22)
  } else {
    doc.setFont('InstrumentSerif', 'normal')
    doc.setFontSize(26)
    doc.setTextColor(255, 255, 255)
    doc.text('FACTUUR', ML, 22)
  }

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(255, 255, 255)
  doc.text(company.name, MR, 13, { align: 'right' })
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)
  doc.setTextColor(...brandMid)
  doc.text(company.address, MR, 19, { align: 'right' })
  doc.text(`${company.email}  |  ${company.phone}`, MR, 24, { align: 'right' })
  doc.setTextColor(...brandMuted)
  doc.text(`KVK: ${company.kvk}  |  BTW: ${company.btw}`, MR, 29, { align: 'right' })

  // ── Meta balk ────────────────────────────────────────────────────────────
  doc.setFillColor(...brandDark)
  doc.rect(0, 36, PW, 14, 'F')

  const metas = [
    { label: 'FACTUURNUMMER', value: factuur.number },
    { label: 'DATUM',         value: formatDate(factuur.date) },
    { label: 'VERVALDATUM',   value: formatDate(factuur.dueDate) },
  ]
  metas.forEach((m, i) => {
    const mx = ML + i * 58
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

  // ── Klantkaart ───────────────────────────────────────────────────────────
  doc.setFillColor(247, 247, 246)
  doc.roundedRect(ML, y, CW, 18, 3, 3, 'F')

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(6)
  doc.setTextColor(170, 170, 170)
  doc.text('KLANT', ML + 5, y + 5)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10.5)
  doc.setTextColor(25, 25, 25)
  doc.text(factuur.client.name, ML + 5, y + 11)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)
  doc.setTextColor(110, 110, 110)
  if (factuur.client.contactPerson)
    doc.text(`t.a.v. ${factuur.client.contactPerson}`, ML + 5, y + 15.5)
  if (factuur.client.email)
    doc.text(factuur.client.email, MR - 4, y + 11, { align: 'right' })
  if (factuur.client.phone)
    doc.text(factuur.client.phone, MR - 4, y + 15.5, { align: 'right' })

  y += 25

  // ── Tabel ────────────────────────────────────────────────────────────────
  // Kolom-rechterposities
  const COL_TOTAL = MR         // 192
  const COL_PRICE = MR - 32    // 160
  const COL_QTY   = MR - 62    // 130
  const DESC_W    = COL_QTY - ML - 8

  // Tabelkoptekst
  doc.setFillColor(...brandDark)
  doc.rect(ML, y, CW, 8, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(6.5)
  doc.setTextColor(255, 255, 255)
  doc.text('OMSCHRIJVING',    ML + 3,     y + 5.2)
  doc.text('AANTAL',          COL_QTY,    y + 5.2, { align: 'right' })
  doc.text('PRIJS EXCL. BTW', COL_PRICE,  y + 5.2, { align: 'right' })
  doc.text('TOTAAL',          COL_TOTAL,  y + 5.2, { align: 'right' })
  y += 8

  // Groepeer regels per sectie
  const sections: { title: string; items: LineItem[] }[] = []
  for (const item of factuur.items) {
    const title = item.sectionTitle ?? ''
    const last = sections[sections.length - 1]
    if (last && last.title === title) last.items.push(item)
    else sections.push({ title, items: [item] })
  }

  let altRow = false

  function ensureSpace(needed: number) {
    if (y + needed > SAFE_BOTTOM) {
      doc.addPage()
      y = 20
    }
  }

  for (const section of sections) {
    // Sectieheader
    if (section.title) {
      ensureSpace(7)
      doc.setFillColor(...brandLight)
      doc.rect(ML, y, CW, 6, 'F')
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(7)
      doc.setTextColor(...brandDark)
      doc.text(section.title.toUpperCase(), ML + 3, y + 4.2)
      y += 6
      altRow = false
    }

    for (const item of section.items) {
      // Meet de benodigde rij-hoogte
      doc.setFontSize(8)
      const descLines: string[] = doc.splitTextToSize(item.description, DESC_W)
      let detailLines: string[] = []
      if (item.details) {
        doc.setFontSize(7)
        detailLines = doc.splitTextToSize(item.details, DESC_W)
      }
      const itemH = Math.max(9, descLines.length * 4.2 + detailLines.length * 3.6 + 4)

      ensureSpace(itemH)

      // Alternerende achtergrond
      if (altRow) {
        doc.setFillColor(249, 249, 248)
        doc.rect(ML, y, CW, itemH, 'F')
      }
      altRow = !altRow

      const midY = y + itemH / 2 + 1.5

      // Omschrijving
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(8)
      doc.setTextColor(30, 30, 30)
      doc.text(descLines, ML + 3, y + 5)

      if (detailLines.length > 0) {
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(7)
        doc.setTextColor(130, 130, 130)
        doc.text(detailLines, ML + 3, y + 5 + descLines.length * 4.2)
      }

      // Aantal / prijs / totaal
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8)
      doc.setTextColor(80, 80, 80)
      doc.text(String(item.quantity), COL_QTY, midY, { align: 'right' })
      doc.text(euro(item.unitPrice),  COL_PRICE, midY, { align: 'right' })
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(30, 30, 30)
      doc.text(euro(item.quantity * item.unitPrice), COL_TOTAL, midY, { align: 'right' })

      y += itemH
    }
  }

  // Tabelonderrand
  doc.setDrawColor(...brandDark)
  doc.setLineWidth(0.3)
  doc.line(ML, y, MR, y)
  doc.setLineWidth(0.1)
  y += 7

  // ── Totalen ──────────────────────────────────────────────────────────────
  ensureSpace(32)

  const TX = MR - 72

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  doc.setTextColor(90, 90, 90)
  doc.text('Subtotaal excl. BTW', TX, y)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(30, 30, 30)
  doc.text(euro(factuur.subtotal), MR, y, { align: 'right' })
  y += 5.5

  const btwLabel = factuur.btwPercentage === 0 ? 'BTW 0% (verlegd)' : `BTW ${factuur.btwPercentage}%`
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(90, 90, 90)
  doc.text(btwLabel, TX, y)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(30, 30, 30)
  doc.text(euro(factuur.btwAmount), MR, y, { align: 'right' })
  y += 4.5

  // Totaalbox
  doc.setFillColor(...brandLight)
  doc.roundedRect(TX - 4, y - 1, 78, 11, 2, 2, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10.5)
  doc.setTextColor(...brandDark)
  doc.text('Totaal incl. BTW', TX, y + 7)
  doc.text(euro(factuur.total), MR, y + 7, { align: 'right' })
  y += 18

  // ── Betaalinfo ───────────────────────────────────────────────────────────
  ensureSpace(26)

  doc.setFillColor(...brandLight)
  doc.roundedRect(ML, y, CW, 22, 3, 3, 'F')

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8.5)
  doc.setTextColor(...brandDark)
  doc.text('Betalingsinformatie', ML + 6, y + 7)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)
  doc.setTextColor(70, 70, 70)
  const dueStr = formatDate(factuur.dueDate)
  doc.text(
    `Gelieve ${euro(factuur.total)} te voldoen voor ${dueStr} via:`,
    ML + 6, y + 13,
  )

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(...brandDark)
  doc.text(`IBAN: ${company.iban}`, ML + 6, y + 18.5)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)
  doc.setTextColor(70, 70, 70)
  doc.text(
    `t.n.v. ${company.name}  |  o.v.v. ${factuur.number}`,
    ML + 6, y + 23.5,
  )

  y += 30

  // iDEAL betaalknop (als betaallink beschikbaar)
  if (factuur.molliePaymentUrl) {
    ensureSpace(16)
    const btnLabel = 'Betaal direct via iDEAL'
    const btnW = 80
    const btnH = 10
    const btnX = ML + (CW - btnW) / 2
    doc.setFillColor(22, 163, 74)
    doc.roundedRect(btnX, y, btnW, btnH, 2.5, 2.5, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8.5)
    doc.setTextColor(255, 255, 255)
    doc.textWithLink(btnLabel, btnX + btnW / 2, y + 6.5, {
      url: factuur.molliePaymentUrl,
      align: 'center',
    })
    y += btnH + 4
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7)
    doc.setTextColor(150, 150, 150)
    doc.text('Veilig betalen via iDEAL', ML + CW / 2, y, { align: 'center' })
    y += 5
  }

  // ── Notities ─────────────────────────────────────────────────────────────
  if (factuur.notes) {
    ensureSpace(20)
    y += 4
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7.5)
    doc.setTextColor(...brandDark)
    doc.text('NOTITIES', ML, y)
    y += 5
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.5)
    doc.setTextColor(70, 70, 70)
    const noteLines: string[] = doc.splitTextToSize(factuur.notes, CW)
    doc.text(noteLines, ML, y)
    y += noteLines.length * 4 + 4
  }

  // ── Footer (elke pagina) ──────────────────────────────────────────────────
  const totalPages = doc.getNumberOfPages()
  for (let pg = 1; pg <= totalPages; pg++) {
    doc.setPage(pg)
    doc.setDrawColor(215, 215, 215)
    doc.setLineWidth(0.3)
    doc.line(ML, FOOTER_Y, MR, FOOTER_Y)
    doc.setLineWidth(0.1)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(6.5)
    doc.setTextColor(165, 165, 165)
    doc.text(
      `${company.name}  ·  ${company.email}  ·  KVK: ${company.kvk}  ·  BTW: ${company.btw}  ·  IBAN: ${company.iban}`,
      PW / 2, FOOTER_Y + 4.5, { align: 'center' },
    )
    doc.text(factuur.number, MR, FOOTER_Y + 4.5, { align: 'right' })
  }

  return doc
}

export async function saveFactuurPdf(
  factuur: Factuur,
  company: Company,
): Promise<'folder' | 'download'> {
  const { saveFactuurPdfToFolder } = await import('./folderStorage')
  const doc = generateFactuurPdf(factuur, company)

  const safeClient = factuur.client.name
    .replace(/[^a-zA-Z0-9\s]/g, '')
    .trim()
    .replace(/\s+/g, '_')
    .slice(0, 30)
  const filename = `${factuur.number}_${safeClient}.pdf`

  try {
    const blob = doc.output('blob')
    const savedToFolder = await saveFactuurPdfToFolder(blob, filename)
    if (savedToFolder) return 'folder'
  } catch {
    // File System Access API niet beschikbaar
  }

  doc.save(filename)
  return 'download'
}
