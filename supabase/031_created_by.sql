-- Tracks who added an order or expense, for the "Agregado por" column in TruckView.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS created_by_email text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS created_by_name text;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS created_by_email text;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS created_by_name text;
