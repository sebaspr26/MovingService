-- Marks an order that was moved into its current cycle from a previously closed
-- cycle (still unpaid at close time), so it can be tracked separately via the
-- "Ciclo Anterior" filter in TruckView instead of blending into the new cycle's weeks.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS carried_over boolean DEFAULT false;
