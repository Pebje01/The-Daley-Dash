import { Offerte } from './types'
import { getCompany } from './companies'

const AHASEND_BASE = 'https://api.ahasend.com/v2/accounts'

// Per bedrijf: account ID, secret key en afzenderadres
const AHASEND_CONFIG: Record<string, { accountId: string; secretKey: string; from: string; replyTo?: string } | undefined> = {
  tde: {
    accountId: process.env.AHASEND_TDE_ACCOUNT_ID ?? '',
    secretKey: process.env.AHASEND_TDE_SECRET_KEY ?? '',
    from: process.env.AHASEND_TDE_FROM ?? 'hello@thedaleyedit.nl',
  },
  wgb: {
    accountId: process.env.AHASEND_WGB_ACCOUNT_ID ?? '',
    secretKey: process.env.AHASEND_WGB_SECRET_KEY ?? '',
    from: process.env.AHASEND_WGB_FROM ?? 'hello@wegrowbrands.online',
  },
  daleyphotography: {
    accountId: process.env.AHASEND_TDE_ACCOUNT_ID ?? '',
    secretKey: process.env.AHASEND_TDE_SECRET_KEY ?? '',
    from: process.env.AHASEND_TDE_FROM ?? 'hello@thedaleyedit.nl',
    replyTo: 'hello@daleyphotography.nl',
  },
}

async function sendViaAhasend({
  companyId,
  toEmail,
  toName,
  subject,
  html,
}: {
  companyId: string
  toEmail: string
  toName?: string
  subject: string
  html: string
}) {
  const config = AHASEND_CONFIG[companyId] ?? AHASEND_CONFIG['tde']!
  const company = getCompany(companyId as any)

  if (!config.accountId || !config.secretKey) {
    throw new Error(`Ahasend niet geconfigureerd voor ${companyId}. Vul AHASEND_${companyId.toUpperCase()}_SECRET_KEY in .env.local in.`)
  }

  const res = await fetch(`${AHASEND_BASE}/${config.accountId}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.secretKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: { email: config.from, name: company.name },
      recipients: [{ email: toEmail, ...(toName ? { name: toName } : {}) }],
      subject,
      html_content: html,
      ...(config.replyTo ? { reply_to: { email: config.replyTo } } : {}),
    }),
  })

  if (!res.ok) {
    const err = await res.text().catch(() => res.statusText)
    throw new Error(`Ahasend fout (${res.status}): ${err}`)
  }
}

/**
 * Betaalherinnering voor verlopen factuur
 */
export async function sendFactuurHerinnering({
  toEmail,
  toName,
  factuurNumber,
  amount,
  dueDate,
  companyId,
}: {
  toEmail: string
  toName: string
  factuurNumber: string
  amount: number
  dueDate: string
  companyId: string
}) {
  const company = getCompany(companyId as any)
  const euro = new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(amount)
  const dueDateFormatted = new Date(dueDate).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })
  const aanhef = toName ? `Beste ${toName},` : 'Beste,'

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; padding: 32px 24px; color: #1a1a2e;">

      <p style="font-size: 15px; line-height: 1.6; margin-bottom: 16px;">${aanhef}</p>

      <p style="font-size: 15px; line-height: 1.6; margin-bottom: 16px;">
        Ik stuur je een vriendelijke herinnering voor de onderstaande factuur. Misschien is het er even bij ingeschoten, dat kan natuurlijk gebeuren!
      </p>

      <div style="background: #f7f7fb; border-left: 4px solid ${company.color}; border-radius: 4px; padding: 20px 24px; margin: 24px 0;">
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="padding: 6px 0; color: #666; font-size: 14px; width: 140px;">Factuurnummer</td>
            <td style="padding: 6px 0; font-weight: 600; font-size: 14px;">${factuurNumber}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #666; font-size: 14px;">Openstaand bedrag</td>
            <td style="padding: 6px 0; font-weight: 700; font-size: 16px; color: ${company.color};">${euro}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #666; font-size: 14px;">Vervaldatum</td>
            <td style="padding: 6px 0; font-size: 14px; color: #c0392b;">${dueDateFormatted}</td>
          </tr>
        </table>
      </div>

      <p style="font-size: 15px; line-height: 1.6; margin-bottom: 16px;">
        Kun je zorgen dat de betaling zo spoedig mogelijk wordt overgemaakt? Heb je al betaald of heb je vragen over de factuur? Laat het me dan gerust weten, dan kijken we het samen na.
      </p>

      <p style="font-size: 15px; line-height: 1.6; margin-top: 32px;">
        Met vriendelijke groet,<br/>
        <strong>${company.name}</strong><br/>
        <a href="mailto:${company.email}" style="color: ${company.color}; text-decoration: none;">${company.email}</a><br/>
        ${company.phone}
      </p>

      <hr style="border: none; border-top: 1px solid #e5e5e5; margin: 32px 0 16px;" />
      <p style="font-size: 11px; color: #999; line-height: 1.5; margin: 0;">
        Let op: dit is een geautomatiseerde factuurherinnering. Heb je de factuur al voldaan? Dan kun je deze mail negeren. Excuses voor het ongemak als de berichten elkaar hebben gekruist.
      </p>
    </div>
  `

  await sendViaAhasend({
    companyId,
    toEmail,
    toName,
    subject: `Herinnering: factuur ${factuurNumber} | ${company.name}`,
    html,
  })
}

/**
 * Offerte-link naar klant (nog via Ahasend, was Resend)
 */
export async function sendOfferteToClient(offerte: Offerte, baseUrl: string) {
  const company = getCompany(offerte.companyId)
  const offerteUrl = `${baseUrl}/offerte/${offerte.slug}`

  await sendViaAhasend({
    companyId: offerte.companyId,
    toEmail: offerte.client.email!,
    toName: offerte.client.contactPerson || offerte.client.name,
    subject: `Offerte ${offerte.number} | ${company.name}`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; padding: 32px 24px;">
        <h2 style="color: ${company.color}; margin-bottom: 8px;">${company.name}</h2>
        <p>Beste ${offerte.client.contactPerson || offerte.client.name},</p>
        <p>Hierbij ontvangt u de offerte <strong>${offerte.number}</strong> van ${company.name}.</p>
        <p>U kunt de offerte online bekijken, downloaden als PDF en digitaal goedkeuren via onderstaande link:</p>
        <div style="background: #f5f5f5; border-radius: 8px; padding: 20px; margin: 24px 0;">
          <p style="margin: 0;"><strong>Link:</strong> <a href="${offerteUrl}" style="color: ${company.color};">${offerteUrl}</a></p>
        </div>
        <p>De offerte is geldig tot <strong>${new Date(offerte.validUntil).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })}</strong>.</p>
        <p>Heeft u vragen? Neem gerust contact met ons op.</p>
        <p style="margin-top: 32px;">Met vriendelijke groet,<br/><strong>${company.name}</strong><br/>${company.email}<br/>${company.phone}</p>
      </div>
    `,
  })
}

/**
 * Offerte goedkeuring notificatie naar Daley
 */
export async function sendOfferteApprovalNotification(
  offerte: Offerte,
  approvedByName: string,
  approvedByEmail: string
) {
  const company = getCompany(offerte.companyId)
  const notificationEmail = process.env.OFFERTE_NOTIFICATION_EMAIL
  if (!notificationEmail) return

  const euro = new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(offerte.total)

  await sendViaAhasend({
    companyId: offerte.companyId,
    toEmail: notificationEmail,
    subject: `Offerte ${offerte.number} goedgekeurd door ${approvedByName}`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; padding: 32px 24px;">
        <h2 style="color: #16a34a;">Offerte goedgekeurd</h2>
        <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
          <tr><td style="padding: 8px 0; color: #666;">Offerte</td><td style="padding: 8px 0; font-weight: bold;">${offerte.number}</td></tr>
          <tr><td style="padding: 8px 0; color: #666;">Bedrijf</td><td style="padding: 8px 0;">${company.name}</td></tr>
          <tr><td style="padding: 8px 0; color: #666;">Klant</td><td style="padding: 8px 0;">${offerte.client.name}</td></tr>
          <tr><td style="padding: 8px 0; color: #666;">Bedrag</td><td style="padding: 8px 0; font-weight: bold;">${euro}</td></tr>
          <tr><td style="padding: 8px 0; color: #666;">Goedgekeurd door</td><td style="padding: 8px 0;">${approvedByName} (${approvedByEmail})</td></tr>
          <tr><td style="padding: 8px 0; color: #666;">Datum</td><td style="padding: 8px 0;">${new Date().toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</td></tr>
        </table>
      </div>
    `,
  })
}
