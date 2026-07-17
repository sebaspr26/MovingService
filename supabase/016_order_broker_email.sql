-- Add broker_email to orders (per-order contact email from RC, independent of broker record)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS broker_email text;
