import { GoogleGenerativeAI } from '@google/generative-ai'
import { CompanyId } from '@/lib/types'
import { COMPANY_AI_CONTEXT } from './company-prompts'

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)

export interface AIOfferteResult {
  introText: string
  sections: {
    title: string
    items: {
      description: string
      details?: string
      quantity: number
      unitPrice: number
    }[]
  }[]
  termsText: string
  btwPercentage: number
}

interface GenerateOfferteParams {
  companyId: CompanyId
  clientName: string
  contactPerson?: string
  prompt: string
}

export async function generateOfferteWithAI({
  companyId,
  clientName,
  contactPerson,
  prompt,
}: GenerateOfferteParams): Promise<AIOfferteResult> {
  const context = COMPANY_AI_CONTEXT[companyId]

  const systemInstruction = `Je bent een offerte-assistent voor ${context.description}

Diensten die dit bedrijf aanbiedt:
${context.services.map(s => `- ${s}`).join('\n')}

Prijsindicaties:
${context.pricingGuidelines}

Stijl: ${context.tone}

Je taak: genereer een professionele offerte op basis van de beschrijving van de gebruiker.

REGELS:
- Schrijf in het Nederlands
- Gebruik realistische, marktconforme prijzen op basis van de prijsindicaties
- Groepeer items logisch in secties
- Elke sectie moet een duidelijke titel hebben
- Geef bij elk item een heldere omschrijving
- Gebruik het "details" veld voor aanvullende specificaties (optioneel)
- De introductietekst moet gericht zijn aan de klant: "${clientName}"${contactPerson ? ` (t.a.v. ${contactPerson})` : ''}
- Sluit af met passende voorwaarden (betalingstermijn, geldigheid, etc.)
- BTW percentage is standaard 21, gebruik 9 voor voedsel-gerelateerd, 0 voor vrijgesteld

Antwoord UITSLUITEND met een JSON object in dit exacte formaat (geen markdown, geen toelichting):
{
  "introText": "string - introductietekst voor de offerte",
  "sections": [
    {
      "title": "string - sectietitel",
      "items": [
        {
          "description": "string - omschrijving van het item",
          "details": "string | undefined - extra details",
          "quantity": "number - aantal",
          "unitPrice": "number - prijs per stuk in euro"
        }
      ]
    }
  ],
  "termsText": "string - voorwaarden en opmerkingen",
  "btwPercentage": "number - 0, 9, of 21"
}`

  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    systemInstruction,
    generationConfig: {
      responseMimeType: 'application/json',
    },
  })

  const result = await model.generateContent(prompt)
  const response = result.response
  const text = response.text()

  if (!text) {
    throw new Error('Geen tekst ontvangen van AI')
  }

  // Parse JSON - strip possible markdown code fences (safety net)
  let jsonStr = text.trim()
  if (jsonStr.startsWith('```')) {
    jsonStr = jsonStr.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')
  }

  const parsed = JSON.parse(jsonStr)

  // Validate and sanitize
  const offerte: AIOfferteResult = {
    introText: typeof parsed.introText === 'string' ? parsed.introText : '',
    sections: Array.isArray(parsed.sections)
      ? parsed.sections.map((s: any) => ({
          title: typeof s.title === 'string' ? s.title : 'Sectie',
          items: Array.isArray(s.items)
            ? s.items.map((item: any) => ({
                description: typeof item.description === 'string' ? item.description : '',
                details: typeof item.details === 'string' ? item.details : undefined,
                quantity: typeof item.quantity === 'number' && item.quantity > 0 ? item.quantity : 1,
                unitPrice: typeof item.unitPrice === 'number' && item.unitPrice >= 0 ? item.unitPrice : 0,
              }))
            : [],
        }))
      : [],
    termsText: typeof parsed.termsText === 'string' ? parsed.termsText : '',
    btwPercentage: [0, 9, 21].includes(parsed.btwPercentage) ? parsed.btwPercentage : 21,
  }

  // Ensure at least one section with one item
  if (offerte.sections.length === 0) {
    offerte.sections = [{ title: 'Diensten', items: [{ description: 'Nader te specificeren', quantity: 1, unitPrice: 0 }] }]
  }

  return offerte
}
