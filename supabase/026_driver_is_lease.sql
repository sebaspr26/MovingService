-- Marcar conductor como lease (independiente del rol en Auth)
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS is_lease boolean NOT NULL DEFAULT false;
