-- Extend audit_log with the actor's identity so entries show who did what.
-- Previously only device/IP info was captured, which doesn't identify the user.
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS user_id uuid;
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS user_email text;
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS user_name text;

CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_entity ON audit_log(entity_type, entity_id);
