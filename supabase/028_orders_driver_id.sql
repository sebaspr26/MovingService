-- Link orders to a real driver record instead of only a copied name string.
-- driver_name stays (kept for display and as a fallback match), but driver_id
-- is now the authoritative connection so a later driver rename never
-- disconnects existing orders from payment calculations.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS driver_id uuid REFERENCES drivers(id);
CREATE INDEX IF NOT EXISTS idx_orders_driver_id ON orders(driver_id);
