-- Track when settlement email was sent
ALTER TABLE dispatcher_payments ADD COLUMN IF NOT EXISTS email_sent_at timestamptz;
