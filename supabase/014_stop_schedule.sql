-- Add time_end and schedule_type to order_stops
ALTER TABLE order_stops ADD COLUMN IF NOT EXISTS time_end TEXT;
ALTER TABLE order_stops ADD COLUMN IF NOT EXISTS schedule_type TEXT DEFAULT 'range';
-- schedule_type: 'appointment' (same start/end time = cita) or 'range' (different times = rango)
