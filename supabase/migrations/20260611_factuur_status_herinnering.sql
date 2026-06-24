-- Nieuwe factuurstatus "herinnering-verzonden" voor facturen die zijn opgevolgd
-- met een betaalherinnering. Gedraagt zich in alle berekeningen als openstaand.
ALTER TABLE facturen DROP CONSTRAINT IF EXISTS facturen_status_check;
ALTER TABLE facturen ADD CONSTRAINT facturen_status_check
  CHECK (status IN ('concept', 'verzonden', 'herinnering-verzonden', 'betaald', 'te-laat', 'geannuleerd'));
