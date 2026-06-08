ALTER TABLE uren_klanten
  ADD COLUMN IF NOT EXISTS contactpersoon text,
  ADD COLUMN IF NOT EXISTS adres         text,
  ADD COLUMN IF NOT EXISTS postcode      text,
  ADD COLUMN IF NOT EXISTS stad          text,
  ADD COLUMN IF NOT EXISTS klantnummer   text,
  ADD COLUMN IF NOT EXISTS email         text;
