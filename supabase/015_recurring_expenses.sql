-- Recurring expenses per truck (simplified: name, amount, day of month)
DROP TABLE IF EXISTS recurring_expenses;

CREATE TABLE recurring_expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  truck_id uuid NOT NULL REFERENCES trucks(id) ON DELETE CASCADE,
  description text NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  day_of_month integer NOT NULL CHECK (day_of_month BETWEEN 1 AND 31),
  active boolean DEFAULT true,
  last_applied_month text, -- e.g. '2026-07' to track if already applied this month
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_recurring_expenses_truck ON recurring_expenses(truck_id);

-- RLS
ALTER TABLE recurring_expenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "recurring_expenses_all" ON recurring_expenses FOR ALL USING (true) WITH CHECK (true);
