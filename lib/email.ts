import { Resend } from 'resend'
import { Offerte } from './types'
import { getCompany } from './companies'

function getResend() {
  return new Resend(process.env.RESEND_API_KEY)
}

/**
 * Send offerte link to client
 */
export async function sendOfferteToClient(offerte: Offerte, baseUrl: string) {
  const company = getCompany(offerte.companyId)
  const offerteUrl = `${baseUrl}/offerte/${offerte.slug}`

  const { error } = await getResend().emails.send({
    from: `${company.name} <onboarding@resend.dev>`,
    to: offerte.client.email!,
    subject: `Offerte ${offerte.number} — ${company.name}`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; padding: 32px 24px;">
        <h2 style="color: ${company.color}; margin-bottom: 8px;">${company.name}</h2>
        <p>Beste ${offerte.client.contactPerson || offerte.client.name},</p>
        <p>Hierbij ontvangt u de offerte <strong>${offerte.number}</strong> van ${company.name}.</p>
        <p>U kunt de offerte online bekijken, downloaden als PDF, en digitaal goedkeuren via onderstaande link:</p>
        <div style="background: #f5f5f5; border-radius: 8px; padding: 20px; margin: 24px 0;">
          <p style="margin: 0;"><strong>Link:</strong> <a href="${offerteUrl}" style="color: ${company.color};">${offerteUrl}</a></p>
        </div>
        <p>De offerte is geldig tot <strong>${new Date(offerte.validUntil).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })}</strong>.</p>
        <p>Heeft u vragen? Neem gerust contact met ons op.</p>
        <p style="margin-top: 32px;">Met vriendelijke groet,<br/><strong>${company.name}</strong><br/>${company.email}<br/>${company.phone}</p>
      </div>
    `,
  })

  if (error) throw error
}

/**
 * Send approval notification to admin
 */
export async function sendOfferteApprovalNotification(
  offerte: Offerte,
  approvedByName: string,
  approvedByEmail: string
) {
  const company = getCompany(offerte.companyId)
  const notificationEmail = process.env.OFFERTE_NOTIFICATION_EMAIL

  if (!notificationEmail) {
    console.warn('OFFERTE_NOTIFICATION_EMAIL not set, skipping notification')
    return
  }

  const euro = new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(offerte.total)

  const { error } = await getResend().emails.send({
    from: `Offerte Systeem <onboarding@resend.dev>`,
    to: notificationEmail,
    subject: `✓ Offerte ${offerte.number} goedgekeurd door ${approvedByName}`,
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

  if (error) throw error
}
