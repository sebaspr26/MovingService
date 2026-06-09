-- DEF (Diesel Exhaust Fluid) table - same structure as diesel
CREATE TABLE IF NOT EXISTS def (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  truck_id UUID REFERENCES trucks(id) NOT NULL,
  invoice_number TEXT,
  date DATE,
  city TEXT,
  gallons NUMERIC,
  value NUMERIC,
  period_start DATE,
  period_end DATE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE def ENABLE ROW LEVEL SECURITY;

-- Open policy (same as other tables - no auth yet)
CREATE POLICY "Allow all on def" ON def FOR ALL USING (true) WITH CHECK (true);
