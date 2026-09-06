-- Add dispatcher_paid flag to orders for LEASE trucks
-- Marks when the driver's portion has been paid out (deducts from cycle balance)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS dispatcher_paid boolean DEFAULT false;
