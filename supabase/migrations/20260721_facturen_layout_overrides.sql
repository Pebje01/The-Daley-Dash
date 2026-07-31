-- Voegt `layout_overrides` toe aan facturen: de bewaarde blok-posities (in mm) van
-- de sleepbare factuur-editor. NULL betekent dat een factuur nog geen aangepaste
-- indeling heeft en dus in de standaard flow-layout gerenderd wordt (huidig gedrag,
-- geen visuele wijziging voor bestaande facturen).
--
-- Vorm: een object per blok-sleutel met de top-offset in mm, bijvoorbeeld
-- { "header": 0, "klant": 45, "tabel": 90, "betaling": 230, "footer": 278 }.
-- De blok-sleutels verschillen per bedrijfstemplate (zie lib/pdf/factuurTemplate.mjs
-- en lib/pdf/wgbFactuurHtml.ts).
alter table public.facturen
  add column if not exists layout_overrides jsonb;
