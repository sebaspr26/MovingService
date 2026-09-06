-- Add company_id to brokers for multi-company isolation
ALTER TABLE brokers ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES company_settings(id) ON DELETE SET NULL;

-- Link existing brokers to the first (oldest) company
UPDATE brokers SET company_id = (SELECT id FROM company_settings ORDER BY created_at ASC LIMIT 1) WHERE company_id IS NULL;

CREATE INDEX IF NOT EXISTS brokers_company_id_idx ON brokers(company_id);
