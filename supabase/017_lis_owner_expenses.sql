-- LIS trucks: owned by a third party, track owner expenses separately
ALTER TABLE trucks ADD COLUMN IF NOT EXISTS is_lis BOOLEAN DEFAULT false;
ALTER TABLE trucks ADD COLUMN IF NOT EXISTS owner_name TEXT;

-- Owner expenses table (same structure as expenses)
CREATE TABLE IF NOT EXISTS owner_expenses (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  truck_id uuid REFERENCES trucks(id),
  cycle_id uuid REFERENCES cycles(id),
  category text,
  invoice_number text,
  description text,
  amount numeric,
  date date,
  period_start date,
  period_end date,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE owner_expenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "open" ON owner_expenses FOR ALL USING (true) WITH CHECK (true);
