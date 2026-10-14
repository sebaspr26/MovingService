-- Préstamos: money is sent in any amount, so one commission payment can be
-- sent in several parts ($500 in, $100 sent, $400 stays in caja). The rule
-- "a payment can be marked sent only once" from 040 goes away.
drop index if exists caja_movements_payment_once_idx;
