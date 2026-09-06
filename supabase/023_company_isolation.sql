-- Add company_id to orders and drivers for multi-company isolation

ALTER TABLE orders ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES company_settings(id) ON DELETE SET NULL;
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES company_settings(id) ON DELETE SET NULL;

-- Link existing data to the first (oldest) company so nothing is lost
UPDATE orders SET company_id = (SELECT id FROM company_settings ORDER BY created_at ASC LIMIT 1) WHERE company_id IS NULL;
UPDATE drivers SET company_id = (SELECT id FROM company_settings ORDER BY created_at ASC LIMIT 1) WHERE company_id IS NULL;

-- Index for fast filtering
CREATE INDEX IF NOT EXISTS orders_company_id_idx ON orders(company_id);
CREATE INDEX IF NOT EXISTS drivers_company_id_idx ON drivers(company_id);
