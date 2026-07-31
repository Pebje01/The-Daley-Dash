-- Losse projecten konden al een aantal en een stukprijs hebben in de UI en in de
-- API, maar die kolommen bestonden niet in de database. Elke update met een
-- aantal of prijs liep daardoor stuk ("column uren_projecten.aantal does not
-- exist") en wat je op je scherm zag was alleen lokale state: na verversen stond
-- het bedrag er weer als voorheen.
--
-- Beide kolommen zijn optioneel. Oude regels houden alleen hun `bedrag`, en de
-- code valt daar netjes op terug (aantal ?? 1, prijs ?? bedrag).
ALTER TABLE uren_projecten
  ADD COLUMN IF NOT EXISTS aantal NUMERIC(10, 2),
  ADD COLUMN IF NOT EXISTS prijs  NUMERIC(10, 2);

COMMENT ON COLUMN uren_projecten.aantal IS 'Aantal eenheden; leeg betekent 1';
COMMENT ON COLUMN uren_projecten.prijs  IS 'Prijs per eenheid ex btw; leeg betekent gelijk aan bedrag';
