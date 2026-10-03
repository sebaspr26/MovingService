-- IFTA (International Fuel Tax Agreement) — everything the module needs, in one go.

-- 1) Per-company feature switches (Configuración > Módulos). { "ifta": true } turns
--    the IFTA report on for that company. JSONB so future modules don't need a migration.
ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS features jsonb NOT NULL DEFAULT '{}'::jsonb;

-- 2) Which trucks are IFTA-qualified (only the dry vans; box trucks don't file).
ALTER TABLE trucks ADD COLUMN IF NOT EXISTS ifta boolean NOT NULL DEFAULT false;

-- 3) Miles per state of each order, from the HERE truck route (there is no ELD/GPS).
--    { "loaded": { "VA": 120.4, "NC": 80.1 }, "empty": { "NC": 35.2 } } — empty = deadhead.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS state_miles jsonb;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS state_miles_at timestamptz;

-- 4) Quarters already filed with the state (the "Filed" badge), with the numbers
--    as they were filed so later edits don't silently change a filed quarter.
CREATE TABLE IF NOT EXISTS ifta_filings (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES company_settings(id),
  year int NOT NULL,
  quarter int NOT NULL CHECK (quarter BETWEEN 1 AND 4),
  status text NOT NULL DEFAULT 'filed',
  totals jsonb,
  filed_at timestamptz DEFAULT now(),
  filed_by text,
  created_at timestamptz DEFAULT now(),
  UNIQUE (company_id, year, quarter)
);
ALTER TABLE ifta_filings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "open" ON ifta_filings FOR ALL USING (true) WITH CHECK (true);
