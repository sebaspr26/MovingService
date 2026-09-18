-- Links an expense row that was auto-generated from a dispatcher/driver payment
-- back to that payment, so deleting the payment can cascade-delete the expense(s)
-- it created (a dispatcher payment can span multiple trucks -> multiple rows).
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS source_payment_type text; -- 'dispatcher' | 'driver'
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS source_payment_id uuid;
CREATE INDEX IF NOT EXISTS idx_expenses_source_payment ON expenses(source_payment_id);
