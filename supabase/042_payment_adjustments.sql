-- Ajustes (+ / −) en los pagos a dispatchers y conductores: deudas que se le
-- descuentan del settlement o ingresos extra que se le suman.
--   adjustments = [{ "type": "deduct" | "add", "description": "Deuda préstamo", "amount": 100 }]
-- `payout` sigue siendo lo que se le paga a la persona (ya con los ajustes).
-- Los ajustes NO cambian el gasto del camión (Pago Chofer / Pago Dispatcher):
-- ese sigue siendo lo que ganó por las cargas.
-- Correr a mano en el SQL editor de Supabase. Antes de eso la app funciona igual,
-- solo que no deja guardar un pago con ajustes.
alter table dispatcher_payments add column if not exists adjustments jsonb not null default '[]'::jsonb;
alter table driver_payments add column if not exists adjustments jsonb not null default '[]'::jsonb;
