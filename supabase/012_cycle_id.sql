-- Migration: Add cycle_id FK to orders, diesel, def, expenses, accounting
-- This decouples records from date ranges and links them directly to cycles

-- Add cycle_id column to each table
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cycle_id UUID REFERENCES cycles(id) ON DELETE SET NULL;
ALTER TABLE diesel ADD COLUMN IF NOT EXISTS cycle_id UUID REFERENCES cycles(id) ON DELETE SET NULL;
ALTER TABLE def ADD COLUMN IF NOT EXISTS cycle_id UUID REFERENCES cycles(id) ON DELETE SET NULL;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS cycle_id UUID REFERENCES cycles(id) ON DELETE SET NULL;
ALTER TABLE accounting ADD COLUMN IF NOT EXISTS cycle_id UUID REFERENCES cycles(id) ON DELETE SET NULL;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_orders_cycle_id ON orders(cycle_id);
CREATE INDEX IF NOT EXISTS idx_diesel_cycle_id ON diesel(cycle_id);
CREATE INDEX IF NOT EXISTS idx_def_cycle_id ON def(cycle_id);
CREATE INDEX IF NOT EXISTS idx_expenses_cycle_id ON expenses(cycle_id);
CREATE INDEX IF NOT EXISTS idx_accounting_cycle_id ON accounting(cycle_id);

-- Migrate existing data: match records to cycles by truck_id + date range
UPDATE orders o SET cycle_id = c.id
FROM cycles c
WHERE o.truck_id = c.truck_id
  AND o.cycle_id IS NULL
  AND o.pu_date >= c.start_date
  AND (c.end_date IS NULL OR o.pu_date <= c.end_date);

UPDATE diesel d SET cycle_id = c.id
FROM cycles c
WHERE d.truck_id = c.truck_id
  AND d.cycle_id IS NULL
  AND d.date >= c.start_date
  AND (c.end_date IS NULL OR d.date <= c.end_date);

UPDATE def d SET cycle_id = c.id
FROM cycles c
WHERE d.truck_id = c.truck_id
  AND d.cycle_id IS NULL
  AND d.date >= c.start_date
  AND (c.end_date IS NULL OR d.date <= c.end_date);

UPDATE expenses e SET cycle_id = c.id
FROM cycles c
WHERE e.truck_id = c.truck_id
  AND e.cycle_id IS NULL
  AND e.date >= c.start_date
  AND (c.end_date IS NULL OR e.date <= c.end_date);

UPDATE accounting a SET cycle_id = c.id
FROM cycles c
WHERE a.truck_id = c.truck_id
  AND a.cycle_id IS NULL
  AND a.date >= c.start_date
  AND (c.end_date IS NULL OR a.date <= c.end_date);
