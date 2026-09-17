/**
 * Nepdata voor de TESTVERSIE van de Dash.
 *
 * Alles is verzonnen: bedrijven, namen, adressen, KVK-nummers. Mailadressen
 * eindigen op .example, een domein dat nooit kan bestaan, zodat er zelfs bij
 * een fout nooit een echte inbox geraakt wordt.
 *
 * Datums worden gerekend vanaf `vandaag`, zodat de testversie er altijd
 * actueel uitziet: een factuur die te laat is blijft te laat, en er staan
 * altijd open uren van deze maand klaar om te factureren.
 *
 * Gebruikt door scripts/seed-testdata.mjs en POST /api/test/reset.
 */

/** Tabellen die leeggemaakt worden, kinderen vóór ouders. */
const TABELLEN_LEEG = [
  'factuur_line_items',
  'betalingen',
  'facturen_prullenbak',
  'facturen',
  'offerte_approvals',
  'line_items',
  'offertes',
  'uren',
  'uren_projecten',
  'uren_klanten',
  'abonnementen',
  'taken',
  'crm_activiteiten',
  'clickup_crm_records',
  'crm_dash_tags',
]

const KLANTEN = [
  { naam: 'Bakkerij Van der Zee', company: 'tde', contact: 'Marieke van der Zee', adres: 'Zeestraat 12', postcode: '4381 AB', stad: 'Vlissingen', kvk: '71234501', tarief: 85, nr: 'BVZ001', tel: '0118 555 012' },
  { naam: 'Hotel De Linde', company: 'tde', contact: 'Joost Hendriks', adres: 'Lindelaan 4', postcode: '6811 KL', stad: 'Arnhem', kvk: '71234502', tarief: 90, nr: 'HDL001', tel: '026 555 0199' },
  { naam: 'Koffiebranderij Kaap', company: 'tde', contact: 'Sanne Kaap', adres: 'Havenkade 88', postcode: '3024 EE', stad: 'Rotterdam', kvk: '71234503', tarief: 85, nr: 'KBK001', tel: '010 555 0144' },
  { naam: 'Studio Noordlicht', company: 'wgb', contact: 'Ruben Noord', adres: 'Oude Gracht 201', postcode: '3511 AR', stad: 'Utrecht', kvk: '71234504', tarief: 95, nr: 'SNL001', tel: '030 555 0177' },
  { naam: 'Fietsverhuur Duinzicht', company: 'wgb', contact: 'Esther Duin', adres: 'Boulevard 7', postcode: '2042 AA', stad: 'Zandvoort', kvk: '71234505', tarief: 95, nr: 'FVD001', tel: '023 555 0123' },
  { naam: 'Reisbureau Verre Kusten', company: 'wgb', contact: 'Thomas de Wit', adres: 'Reisweg 33', postcode: '1017 PH', stad: 'Amsterdam', kvk: '71234506', tarief: 95, nr: 'RVK001', tel: '020 555 0166' },
  { naam: 'Tandartspraktijk Lindenhof', company: 'daleyphotography', contact: 'Dr. Anouk Linden', adres: 'Hofplein 2', postcode: '5211 JK', stad: "'s-Hertogenbosch", kvk: '71234507', tarief: 75, nr: 'TPL001', tel: '073 555 0111' },
  { naam: 'Yogastudio Stilte', company: 'daleyphotography', contact: 'Lotte Stil', adres: 'Kloosterstraat 15', postcode: '8011 VS', stad: 'Zwolle', kvk: '71234508', tarief: 75, nr: 'YSS001', tel: '038 555 0155' },
]

function email(klant) {
  const domein = klant.naam.toLowerCase().replace(/[^a-z]/g, '')
  return `info@${domein}.example`
}

function adresRegel(klant) {
  return `${klant.adres}, ${klant.postcode} ${klant.stad}`
}

/**
 * Vult de testdatabase opnieuw.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase client op het TESTproject
 * @param {{ sjablonen: Record<string, any[]>, vandaag?: Date }} opties
 */
export async function vulTestdata(supabase, { sjablonen, vandaag = new Date() }) {
  const dag = (offset) => {
    const d = new Date(vandaag.getFullYear(), vandaag.getMonth(), vandaag.getDate() + offset)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }
  const stam = (iso) => iso.slice(2).replace(/-/g, '')
  const tijd = (offset) => `${dag(offset)}T12:00:00+02:00`

  async function schrijf(tabel, rijen) {
    if (!rijen.length) return []
    // defaultToNull uit: rijen met verschillende kolommen krijgen dan de standaardwaarde, geen null
    const { data, error } = await supabase.from(tabel).insert(rijen, { defaultToNull: false }).select()
    if (error) throw new Error(`${tabel}: ${error.message}`)
    return data
  }

  // 1. Leegmaken
  for (const tabel of TABELLEN_LEEG) {
    const { error } = await supabase.from(tabel).delete().not('id', 'is', null)
    if (error) throw new Error(`Leegmaken ${tabel}: ${error.message}`)
  }

  // 2. Klanten voor de urenregistratie
  const urenKlanten = await schrijf('uren_klanten', KLANTEN.map((k) => ({
    naam: k.naam,
    company_id: k.company,
    standaard_uurtarief: k.tarief,
    contactpersoon: k.contact,
    adres: k.adres,
    postcode: k.postcode,
    stad: k.stad,
    klantnummer: k.nr,
    email: email(k),
  })))
  const klant = (naam) => KLANTEN.find((k) => k.naam === naam)

  // 3. Offertes
  const offerteNummers = new Map()
  const offertes = [
    { klant: 'Hotel De Linde', offset: -150, status: 'akkoord', titel: 'Nieuwe website Hotel De Linde', regels: [['Website ontwerp en bouw', '• Custom design in huisstijl\n• Pagina\'s: Home, Kamers, Restaurant, Contact\n• Boekingsknop naar bestaand systeem', 1, 3200]] },
    { klant: 'Studio Noordlicht', offset: -120, status: 'akkoord', titel: 'Merkidentiteit Studio Noordlicht', regels: [['Branding', '• Logo en beeldmerk\n• Kleurenpalet en typografie\n• Korte merkgids', 1, 2400]] },
    { klant: 'Reisbureau Verre Kusten', offset: -40, status: 'verstuurd', titel: 'Campagne najaar', regels: [['Contentcampagne najaar', '• 12 posts en 6 stories\n• Fotografie op locatie (1 dag)', 1, 1850]] },
    { klant: 'Koffiebranderij Kaap', offset: -12, status: 'akkoord', titel: 'Productfotografie webshop', regels: [['Productfotografie', '• 40 producten op witte achtergrond\n• 10 sfeerbeelden', 1, 1400]] },
    { klant: 'Yogastudio Stilte', offset: -5, status: 'concept', titel: 'Portretten docenten', regels: [['Portretfotografie', '• 6 docenten, 3 beelden per persoon\n• Nabewerking inbegrepen', 1, 650]] },
    { klant: 'Fietsverhuur Duinzicht', offset: -90, status: 'afgewezen', titel: 'Social media beheer', regels: [['Social media beheer', '• 3 maanden, 8 posts per maand', 3, 450]] },
    { klant: 'Tandartspraktijk Lindenhof', offset: -75, status: 'verlopen', titel: 'Teamfoto en praktijkbeelden', regels: [['Fotografie praktijk', '• Teamfoto\n• 15 beelden van de praktijk', 1, 780]] },
  ]
  for (const o of offertes) {
    const k = klant(o.klant)
    const datum = dag(o.offset)
    const volg = (offerteNummers.get(datum) ?? 0) + 1
    offerteNummers.set(datum, volg)
    const nummer = `OF-${stam(datum)}-${String(volg).padStart(2, '0')}`
    const subtotal = o.regels.reduce((s, r) => s + r[2] * r[3], 0)
    const [rij] = await schrijf('offertes', [{
      number: nummer,
      slug: nummer.toLowerCase(),
      company_id: k.company,
      client_name: k.naam,
      client_contact_person: k.contact,
      client_email: email(k),
      client_phone: k.tel,
      client_address: adresRegel(k),
      client_kvk: k.kvk,
      date: datum,
      valid_until: dag(o.offset + 30),
      status: o.status,
      subtotal,
      btw_percentage: 21,
      btw_amount: +(subtotal * 0.21).toFixed(2),
      total: +(subtotal * 1.21).toFixed(2),
      intro_text: `Hey ${k.contact.split(' ')[0]}, dank je wel voor je aanvraag. Hieronder vind je het voorstel.`,
      approved_at: o.status === 'akkoord' ? tijd(o.offset + 4) : null,
      approved_by_name: o.status === 'akkoord' ? k.contact : null,
      deposit_percentage: 50,
    }])
    o.id = rij.id
    await schrijf('line_items', o.regels.map((r, i) => ({
      offerte_id: rij.id, sort_order: i, description: r[0], details: r[1], quantity: r[2], unit_price: r[3],
    })))
  }

  // 4. Facturen, met uren en betalingen
  const factuurNummers = new Map()
  // Bewust een stuk meer omzet dan Daley zelf draait: de testversie moet er op
  // het eerste gezicht nooit uitzien als haar eigen administratie.
  const facturen = [
    { klant: 'Hotel De Linde', offset: -250, status: 'betaald', betaaldNa: 8, regels: [{ o: 'Fotografie hotelkamers en restaurant', d: '2 dagen op locatie, 60 beelden', a: 1, p: 3850 }] },
    { klant: 'Reisbureau Verre Kusten', offset: -238, status: 'betaald', betaaldNa: 12, regels: [{ o: 'Website redesign', d: 'Nieuw design, 12 pagina\'s, meertalig', a: 1, p: 6400 }] },
    { klant: 'Studio Noordlicht', offset: -226, status: 'betaald', betaaldNa: 7, regels: [{ o: 'Campagne voorjaar', d: 'Concept, beeld en 24 posts', a: 1, p: 4200 }] },
    { klant: 'Koffiebranderij Kaap', offset: -190, status: 'betaald', betaaldNa: 10, regels: [{ o: 'Verpakkingsontwerp', d: '6 smaken, drukklare bestanden', a: 6, p: 650 }] },
    { klant: 'Fietsverhuur Duinzicht', offset: -178, status: 'betaald', betaaldNa: 15, regels: [{ o: 'Webshop verhuur', d: 'Boekingsmodule en betalingen', a: 1, p: 5200 }] },
    { klant: 'Tandartspraktijk Lindenhof', offset: -150, status: 'betaald', betaaldNa: 9, regels: [{ o: 'Huisstijl en website', d: 'Logo, huisstijl en 6 pagina\'s', a: 1, p: 4750 }] },
    { klant: 'Reisbureau Verre Kusten', offset: -125, status: 'betaald', betaaldNa: 6, regels: [{ o: 'Fotoreportage Portugal', d: '5 dagen op locatie, reiskosten apart', a: 5, p: 780 }, { o: 'Reiskosten', d: 'Vlucht en verblijf', a: 1, p: 1150 }] },
    { klant: 'Hotel De Linde', offset: -40, status: 'betaald', betaaldNa: 9, regels: [{ o: 'Contentcampagne zomer', d: 'Fotografie, video en 20 posts', a: 1, p: 3900 }] },
    { klant: 'Yogastudio Stilte', offset: -85, status: 'betaald', betaaldNa: 11, regels: [{ o: 'Website en fotografie', d: 'Nieuwe site met lesrooster en portretten', a: 1, p: 3600 }] },
    { klant: 'Hotel De Linde', offset: -140, status: 'betaald', betaaldNa: 9, offerte: 'Hotel De Linde', regels: [{ o: 'Aanbetaling website (50%)', a: 1, p: 1600 }] },
    { klant: 'Bakkerij Van der Zee', offset: -200, status: 'betaald', betaaldNa: 12, uren: [[-212, 3, 'Ontwerp flyer'], [-208, 2.5, 'Aanpassingen menukaart']] },
    { klant: 'Studio Noordlicht', offset: -110, status: 'betaald', betaaldNa: 6, offerte: 'Studio Noordlicht', regels: [{ o: 'Merkidentiteit', d: 'Logo, kleurenpalet, typografie en merkgids', a: 1, p: 2400 }] },
    { klant: 'Tandartspraktijk Lindenhof', offset: -170, status: 'betaald', betaaldNa: 14, regels: [{ o: 'Fotografie werkzaamheden', d: 'Teamfoto en website-beelden', a: 1, p: 720 }, { o: 'Reiskosten', d: '84 km à € 0,35', a: 84, p: 0.35 }] },
    { klant: 'Koffiebranderij Kaap', offset: -95, status: 'betaald', betaaldNa: 10, uren: [[-110, 4, 'Etiketontwerp nieuwe melange'], [-104, 3, 'Drukproef en correcties']] },
    { klant: 'Fietsverhuur Duinzicht', offset: -70, status: 'betaald', betaaldNa: 20, regels: [{ o: 'Social media beheer juni', a: 1, p: 450 }] },
    { klant: 'Hotel De Linde', offset: -60, status: 'betaald', betaaldNa: 11, offerte: 'Hotel De Linde', regels: [{ o: 'Restant website (50%)', a: 1, p: 1600 }] },
    { klant: 'Reisbureau Verre Kusten', offset: -48, status: 'betaald', betaaldNa: 5, uren: [[-62, 6, 'Contentplanning zomer'], [-55, 5.5, 'Fotoselectie en captions']] },
    { klant: 'Yogastudio Stilte', offset: -44, status: 'te-laat', regels: [{ o: 'Fotografie werkzaamheden', d: 'Sfeerbeelden studio', a: 1, p: 540 }] },
    { klant: 'Bakkerij Van der Zee', offset: -30, status: 'herinnering-verzonden', uren: [[-40, 2, 'Social posts oogstfeest'], [-36, 1.5, 'Aanpassing website openingstijden']] },
    { klant: 'Studio Noordlicht', offset: -8, status: 'verzonden', uren: [[-20, 5, 'Templates social media'], [-15, 4, 'Presentatie merkgids']] },
    // Aanbetaling op een akkoord-offerte: de andere helft staat nog bij 'nog te factureren'
    { klant: 'Koffiebranderij Kaap', offset: -2, status: 'concept', offerte: 'Koffiebranderij Kaap', regels: [{ o: 'Productfotografie', d: 'Aanbetaling 50%', a: 1, p: 700 }] },
  ]
  for (const f of facturen) {
    const k = klant(f.klant)
    const datum = dag(f.offset)
    const volg = (factuurNummers.get(datum) ?? 0) + 1
    factuurNummers.set(datum, volg)
    const nummer = `F-${stam(datum)}-${String(volg).padStart(2, '0')}`
    const regels = f.uren
      ? f.uren.map(([o, u, oms]) => ({ o: oms, datum: dag(o), a: u, p: k.tarief, uur: true }))
      : f.regels
    const subtotal = +regels.reduce((s, r) => s + r.a * r.p, 0).toFixed(2)
    const betaald = f.status === 'betaald'
    const [rij] = await schrijf('facturen', [{
      number: nummer,
      slug: nummer.toLowerCase(),
      company_id: k.company,
      client_name: k.naam,
      client_name_bestand: k.naam,
      client_contact_person: k.contact,
      client_email: email(k),
      client_phone: k.tel,
      client_address: adresRegel(k),
      client_kvk: k.kvk,
      date: datum,
      due_date: dag(f.offset + 14),
      status: f.status,
      subtotal,
      btw_percentage: 21,
      btw_amount: +(subtotal * 0.21).toFixed(2),
      total: +(subtotal * 1.21).toFixed(2),
      paid_at: betaald ? tijd(f.offset + f.betaaldNa) : null,
      offerte_id: f.offerte ? offertes.find((o) => o.klant === f.offerte)?.id ?? null : null,
    }])
    await schrijf('factuur_line_items', regels.map((r, i) => ({
      factuur_id: rij.id,
      sort_order: i,
      description: r.o,
      details: r.d ?? null,
      datum: r.datum ?? null,
      eenheid: r.uur ? 'uur' : null,
      quantity: r.a,
      unit_price: r.p,
    })))
    if (f.uren) {
      await schrijf('uren', f.uren.map(([o, u, oms]) => ({
        company_id: k.company, datum: dag(o), klant: k.naam, uren: u, omschrijving: oms,
        uurtarief: k.tarief, gefactureerd: f.status !== 'concept', factuurnummer: nummer,
      })))
    }
    if (f.status !== 'concept') {
      await schrijf('betalingen', [{
        factuur_id: rij.id,
        company_id: k.company,
        client_name: k.naam,
        client_email: email(k),
        amount: +(subtotal * 1.21).toFixed(2),
        status: betaald ? 'betaald' : 'openstaand',
        method: betaald ? 'overboeking' : null,
        reference: nummer,
        paid_at: betaald ? tijd(f.offset + f.betaaldNa) : null,
      }])
    }
  }

  // 5. Open uren en projecten: dit is wat je nu nog kunt factureren
  const openUren = [
    ['Hotel De Linde', -13, 3, 'Nieuwsbrief september'],
    ['Hotel De Linde', -9, 2.5, 'Arrangementenpagina aangepast'],
    ['Hotel De Linde', -3, 1.5, 'Afstemming wintercampagne'],
    ['Reisbureau Verre Kusten', -11, 4, 'Contentplanning najaar'],
    ['Reisbureau Verre Kusten', -6, 3.5, 'Blog en fotoselectie Portugal'],
    ['Bakkerij Van der Zee', -4, 2, 'Ontwerp kerstbestelformulier'],
    ['Yogastudio Stilte', -7, 3, 'Fotoshoot lessen'],
  ]
  await schrijf('uren', openUren.map(([naam, o, u, oms]) => {
    const k = klant(naam)
    return { company_id: k.company, datum: dag(o), klant: k.naam, uren: u, omschrijving: oms, uurtarief: k.tarief, gefactureerd: false }
  }))
  await schrijf('uren_projecten', [
    { company_id: 'wgb', klant: 'Studio Noordlicht', naam: 'Visitekaartjes', aantal: 1, prijs: 180, bedrag: 180, datum: dag(-10), omschrijving: 'Ontwerp en drukklaar maken', status: 'actief' },
    { company_id: 'tde', klant: 'Koffiebranderij Kaap', naam: 'Webshop banners', aantal: 4, prijs: 65, bedrag: 260, datum: dag(-6), status: 'actief' },
  ])

  // 6. Abonnementen
  await schrijf('abonnementen', [
    { company_id: 'wgb', client_name: 'Fietsverhuur Duinzicht', client_email: email(klant('Fietsverhuur Duinzicht')), description: 'Social media beheer', amount: 450, interval: 'maandelijks', status: 'actief', start_date: dag(-100), next_invoice_date: dag(13) },
    { company_id: 'tde', client_name: 'Hotel De Linde', client_email: email(klant('Hotel De Linde')), description: 'Hosting en onderhoud website', amount: 35, interval: 'maandelijks', status: 'actief', start_date: dag(-58), next_invoice_date: dag(2) },
    { company_id: 'tde', client_name: 'Bakkerij Van der Zee', client_email: email(klant('Bakkerij Van der Zee')), description: 'Websiteonderhoud', amount: 150, interval: 'kwartaal', status: 'actief', start_date: dag(-250), next_invoice_date: dag(20) },
    { company_id: 'wgb', client_name: 'Studio Noordlicht', client_email: email(klant('Studio Noordlicht')), description: 'Contentpakket', amount: 300, interval: 'maandelijks', status: 'gepauzeerd', start_date: dag(-180) },
  ])

  // 7. To-do list
  await schrijf('taken', [
    { title: 'Offerte Yogastudio Stilte afmaken', scheduled_date: dag(0), positie: 1, prioriteit: 'urgent' },
    { title: 'Herinnering Yogastudio nabellen', scheduled_date: dag(0), positie: 2, prioriteit: 'hoog' },
    { title: 'Moodboard wintercampagne Hotel De Linde', scheduled_date: dag(0), positie: 3, prioriteit: 'middel' },
    { title: 'Fotoselectie Koffiebranderij Kaap doorsturen', positie: 4, prioriteit: 'hoog' },
    { title: 'Portfolio bijwerken met Studio Noordlicht', positie: 5, prioriteit: 'laag' },
    { title: 'BTW-aangifte Q3 voorbereiden', positie: 6, prioriteit: 'middel' },
    { title: 'Nieuwe lens uitzoeken', positie: 7 },
    { title: 'Bonnetjes augustus uploaden', scheduled_date: dag(-1), done: true, positie: 8 },
  ])

  // 8. CRM: labels, bedrijven, contacten, leads, prospects, opdrachten
  await schrijf('crm_dash_tags', [
    { naam: 'Horeca', kleur: 'orange', sort_order: 1 },
    { naam: 'Reizen', kleur: 'blue', sort_order: 2 },
    { naam: 'Warm contact', kleur: 'pink', sort_order: 3 },
  ])

  let volgnummer = 0
  const velden = (type, waarden = {}) =>
    (sjablonen[type] || []).map((f) => ({ ...f, value: waarden[f.name] ?? null }))
  const record = (type, data) => ({
    entity_type: type,
    clickup_task_id: `local-test-${++volgnummer}`,
    clickup_list_id: 'local',
    custom_fields: velden(type, data.velden),
    raw: {},
    contact_status: 'open',
    ...Object.fromEntries(Object.entries(data).filter(([k]) => k !== 'velden')),
  })

  await schrijf('clickup_crm_records', [
    ...KLANTEN.slice(0, 5).map((k, i) => record('company', {
      name: k.naam,
      status: i < 3 ? 'lopende samenwerking' : 'open',
      velden: { Klantnummer: k.nr, Website: `https://${k.naam.toLowerCase().replace(/[^a-z]/g, '')}.example` },
    })),
    ...KLANTEN.slice(0, 5).map((k) => record('contact', {
      name: k.contact,
      status: 'Open',
      velden: { 'E-mail': email(k), Telefoon: k.tel },
    })),
    record('lead', { name: 'Camping De Wadden', status: 'nieuwe kans', company_id: 'wgb', volgende_actie: dag(1), ai_status: 'klaar', ai_score: 72, ai_prioriteit: 'hoog', ai_branche: 'horeca', ai_samenvatting: 'Familiecamping met verouderde site en actief op Instagram, net uitgebreid met glamping.', ai_signalen: { plus: ['Nieuwe glampingtenten, dus een aanleiding', 'Actief op social media maar zonder vaste stijl'], min: ['Seizoensbedrijf, budget vooral in het voorjaar'] }, ai_volgende_stap: 'Stuur een kort bericht over de glampinglancering met twee voorbeelden.' }),
    record('lead', { name: 'Brouwerij Het Anker', status: 'benaderd', company_id: 'tde', volgende_actie: dag(0), laatste_contact: tijd(-4), contact_pogingen: 1 }),
    record('lead', { name: 'Kinderopvang Zonnebloem', status: 'in gesprek', company_id: 'tde', volgende_actie: dag(3), laatste_contact: tijd(-2), contact_pogingen: 2 }),
    record('lead', { name: 'Reisbureau Verre Kusten', status: 'offerte uit', company_id: 'wgb', volgende_actie: dag(-1), laatste_contact: tijd(-40), contact_pogingen: 3 }),
    record('lead', { name: 'Tourism Board Azoren', status: 'later opvolgen', company_id: 'wgb', volgende_actie: dag(30), ai_status: 'klaar', ai_score: 52, ai_prioriteit: 'midden', ai_branche: 'toerisme', ai_samenvatting: 'Kleine DMO met Engelstalige marketingafdeling die persreizen organiseert.' }),
    record('lead', { name: 'Kapsalon Knip', status: 'on hold', company_id: 'daleyphotography', contact_status: 'pauze', contact_status_tot: dag(45), contact_status_reden: 'Verbouwing tot november', volgende_actie: dag(45) }),
    record('lead', { name: 'Hotel De Linde', status: 'gewonnen', company_id: 'tde' }),
    record('lead', { name: 'Autobedrijf Snel', status: 'verloren', company_id: 'tde' }),
    record('lead', { name: 'Spamdrukkerij BV', status: 'blacklist', company_id: 'wgb', contact_status: 'blokkade', contact_status_reden: 'Stuurt alleen verkoopmails' }),
    record('ruwe_lead', { name: 'Surfschool Golfslag', status: 'nieuw', company_id: 'wgb', ruwe_website: 'https://surfschoolgolfslag.example', ruwe_contact_email: 'info@surfschoolgolfslag.example', ruwe_contactpersoon: 'Bram Golf', ruwe_telefoon: '0223 555 0101', ruwe_bron: 'Eigen onderzoek', ruwe_fit_reden: 'Nieuwe locatie en geen eigen fotografie op de site', ruwe_prioriteit: 'ster', ai_status: 'klaar', ai_score: 68, ai_prioriteit: 'midden', ai_branche: 'sport' }),
    record('ruwe_lead', { name: 'Bloemist De Tulp', status: 'nieuw', company_id: 'tde', ruwe_website: 'https://bloemistdetulp.example', ruwe_contact_email: 'hallo@bloemistdetulp.example', ruwe_bron: 'Instagram', ruwe_fit_reden: 'Mooie producten, rommelige webshop', ai_status: 'klaar', ai_score: 55, ai_prioriteit: 'midden', ai_branche: 'retail' }),
    record('ruwe_lead', { name: 'Fysiotherapie Beweeg', status: 'nieuw', company_id: 'daleyphotography', ruwe_website: 'https://fysiobeweeg.example', ruwe_bron: 'Netwerkborrel', ai_status: 'klaar', ai_score: 38, ai_prioriteit: 'laag', ai_branche: 'zorg' }),
    record('ruwe_lead', { name: 'Galerie Kunstlicht', status: 'later', company_id: 'tde', ruwe_website: 'https://galeriekunstlicht.example', ruwe_bron: 'Eigen onderzoek', ruwe_fit_reden: 'Opent pas in het voorjaar' }),
    record('assignment', { name: 'Website Hotel De Linde', status: 'afgerond' }),
    record('assignment', { name: 'Contentcampagne najaar Verre Kusten', status: 'nieuwe opdracht' }),
  ])

  return {
    klanten: urenKlanten.length,
    offertes: offertes.length,
    facturen: facturen.length,
  }
}
