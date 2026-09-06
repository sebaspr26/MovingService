-- Add VIN number text field to trucks
ALTER TABLE trucks ADD COLUMN IF NOT EXISTS vin_number text;
