-- Company settings table (replaces localStorage)
CREATE TABLE IF NOT EXISTS company_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_info jsonb DEFAULT '{}',
  billing_info jsonb DEFAULT '{}',
  remit_info jsonb DEFAULT '{}',
  logo_path text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Single row — insert default if empty
INSERT INTO company_settings (company_info, billing_info, remit_info)
VALUES ('{}', '{}', '{}')
ON CONFLICT DO NOTHING;

-- RLS
ALTER TABLE company_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "company_settings_all" ON company_settings FOR ALL USING (true) WITH CHECK (true);
