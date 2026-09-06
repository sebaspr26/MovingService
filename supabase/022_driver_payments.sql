-- Driver payment records (non-LIS drivers only)
CREATE TABLE IF NOT EXISTS driver_payments (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  driver_id uuid REFERENCES drivers(id) ON DELETE CASCADE,
  driver_name text NOT NULL,
  driver_email text,
  truck_id uuid REFERENCES trucks(id) ON DELETE SET NULL,
  pay_mode text NOT NULL CHECK (pay_mode IN ('flat_rate', 'percentage', 'per_mile')),
  pay_rate numeric NOT NULL DEFAULT 0,  -- $ for flat_rate, % for percentage, cents/mile for per_mile
  gross_revenue numeric NOT NULL DEFAULT 0,
  total_miles numeric NOT NULL DEFAULT 0,
  payout numeric NOT NULL DEFAULT 0,
  pay_date date NOT NULL DEFAULT CURRENT_DATE,
  period_start date,
  period_end date,
  order_ids uuid[] DEFAULT '{}',
  payment_number integer NOT NULL DEFAULT 1,
  notes text,
  email_sent_at timestamptz,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE driver_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "open" ON driver_payments FOR ALL USING (true) WITH CHECK (true);
