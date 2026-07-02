-- Prevent multiple open cycles per truck
-- Partial unique index: only one row with closed=false per truck_id
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_active_cycle
  ON cycles (truck_id)
  WHERE closed = false;
