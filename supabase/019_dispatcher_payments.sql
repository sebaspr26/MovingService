-- Dispatcher payment records
CREATE TABLE IF NOT EXISTS dispatcher_payments (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  dispatcher_email text NOT NULL,
  dispatcher_name text,
  gross_revenue numeric NOT NULL DEFAULT 0,
  commission_pct numeric NOT NULL DEFAULT 0,
  payout numeric NOT NULL DEFAULT 0,
  pay_date date NOT NULL DEFAULT CURRENT_DATE,
  period_start date,
  period_end date,
  order_ids uuid[] DEFAULT '{}',
  payment_number integer NOT NULL DEFAULT 1,
  notes text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE dispatcher_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "open" ON dispatcher_payments FOR ALL USING (true) WITH CHECK (true);
