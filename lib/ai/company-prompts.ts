import { CompanyId } from '@/lib/types'

export interface CompanyAIContext {
  description: string
  services: string[]
  pricingGuidelines: string
  tone: string
}

export const COMPANY_AI_CONTEXT: Record<CompanyId, CompanyAIContext> = {
  tde: {
    description: 'The Daley Edit is een creatief bureau gespecialiseerd in content creatie, social media management en visuele branding voor premium merken.',
    services: [
      'Social media management (Instagram, TikTok, LinkedIn)',
      'Content creatie (fotografie, videografie, reels)',
      'Branding & visuele identiteit',
      'Copywriting & contentplanning',
      'Influencer marketing',
      'E-mail marketing campagnes',
    ],
    pricingGuidelines: 'Uurtarief rond €75-€95. Social media management pakketten vanaf €500/maand. Content shoots vanaf €350. Branding trajecten vanaf €1.500.',
    tone: 'Professioneel maar warm en persoonlijk. Creatief en enthousiast over het project.',
  },
  wgb: {
    description: 'We Grow Brands is een digitaal marketingbureau dat merken helpt groeien door middel van websites, webshops, online marketing en branding.',
    services: [
      'Website ontwerp & ontwikkeling',
      'Webshop / e-commerce (Shopify, WooCommerce)',
      'SEO (zoekmachineoptimalisatie)',
      'Google Ads & online advertenties',
      'Social media marketing',
      'Branding & huisstijl',
      'Logo ontwerp',
      'Grafisch ontwerp (drukwerk, flyers, visitekaartjes)',
    ],
    pricingGuidelines: 'Websites vanaf €1.200. Webshops vanaf €1.800. Logo ontwerp vanaf €450. Huisstijl trajecten vanaf €800. SEO pakketten vanaf €350/maand. Google Ads management vanaf €300/maand.',
    tone: 'Zakelijk maar toegankelijk. Resultaatgericht, duidelijk over wat de klant kan verwachten.',
  },
  daleyphotography: {
    description: 'Daley Photography is een fotografiebedrijf voor zakelijke en creatieve shoots, waaronder branding fotografie, productfotografie en content shoots.',
    services: [
      'Branding fotografie voor ondernemers en merken',
      'Productfotografie (e-commerce, packshots, detailshots)',
      'Content shoot voor social media',
      'Portretfotografie (zakelijk/personal brand)',
      'Event fotografie',
      'Nabewerking / kleurcorrectie',
      'Selectie en oplevering voor web/social media',
    ],
    pricingGuidelines: 'Fotoshoots vanaf €250-€450. Branding shoots vanaf €450-€1.200. Productfotografie per product of setprijs afhankelijk van aantallen. Uurtarief indicatie €65-€95 exclusief btw.',
    tone: 'Creatief en professioneel. Duidelijk over deliverables, aantal beelden, gebruiksrechten en planning.',
  },
  bleijenberg: {
    description: 'Bleijenberg is een vakkundig bouw- en renovatiebedrijf gespecialiseerd in woningrenovaties, verbouwingen en onderhoud.',
    services: [
      'Woningrenovatie (keuken, badkamer, woonkamer)',
      'Aanbouw & uitbouw',
      'Dakwerk & isolatie',
      'Schilderwerk (binnen & buiten)',
      'Tegelwerk',
      'Loodgieterwerk',
      'Timmerwerkzaamheden',
      'Algemeen onderhoud',
    ],
    pricingGuidelines: 'Uurtarief rond €45-€55 excl. materiaal. Badkamerrenovatie €5.000-€15.000. Keukenplaatsing vanaf €2.500 (excl. keuken). Schilderwerk per m² €15-€25.',
    tone: 'Nuchter en vakkundig. Duidelijke omschrijvingen van werkzaamheden en materialen.',
  },
  montung: {
    description: 'Montung is een montage- en installatiebedrijf gespecialiseerd in het monteren van keukens, meubels, en overige interieurprojecten.',
    services: [
      'Keuken montage',
      'Meubelmontage (IKEA, Leolux, etc.)',
      'Inbouwkasten op maat',
      'Vloeren leggen (laminaat, PVC, parket)',
      'Deur- en kozijnmontage',
      'Zonwering & raamdecoratie montage',
      'Algemene montagewerkzaamheden',
    ],
    pricingGuidelines: 'Uurtarief rond €40-€50. Keukenmontage vanaf €600. IKEA keuken montage vanaf €400. Vloeren leggen per m² €15-€20. Meubelmontage per stuk €50-€150.',
    tone: 'Praktisch en to-the-point. Duidelijke opsomming van werkzaamheden met realistische prijzen.',
  },
}
