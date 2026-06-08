ALTER TABLE facturen ADD COLUMN IF NOT EXISTS exclude_from_revenue boolean DEFAULT false;
