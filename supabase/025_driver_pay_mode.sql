-- Modo de pago por conductor (se configura desde Perfiles, no desde el modal de pago)
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS pay_mode text CHECK (pay_mode IN ('flat_rate', 'percentage', 'per_mile'));
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS pay_rate numeric NOT NULL DEFAULT 0;
