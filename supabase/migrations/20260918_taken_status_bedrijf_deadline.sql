-- Status, bedrijf en deadline voor de to-do list (/taken), zoals Daley het in
-- Notion had: een tabel met Taak, Prioriteit, Status, Bedrijf en Deadline.
--
-- Status kent hier alleen de open standen. Afgerond blijft de kolom `done`,
-- want daar leunen de Vandaag-kolom en de dashboardstrook al op. Leeg telt als
-- niet gestart.

alter table taken
  add column if not exists status text
    check (status in ('niet_gestart', 'bezig')),
  add column if not exists bedrijf text
    check (bedrijf in ('tde', 'wgb', 'daleyphotography')),
  add column if not exists deadline date;
