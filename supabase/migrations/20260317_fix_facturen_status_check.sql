-- Fix status check constraint: oude Nederlandse waarden → nieuwe Engelse waarden
ALTER TABLE facturen DROP CONSTRAINT IF EXISTS facturen_status_check;
ALTER TABLE facturen ADD CONSTRAINT facturen_status_check 
  CHECK (status IN ('concept', 'verzonden', 'betaald', 'te-laat', 'geannuleerd'));
