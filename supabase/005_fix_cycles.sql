-- ============================================
-- Fix cycles based on actual Excel data
-- ============================================

-- Step 1: Delete all migrated cashbox cycles (they were wrong — all marked open)
DELETE FROM cycles;

-- Step 2: Insert correct cycles for Truck 109
-- Cycle 1: 26 Feb - 01 April (closed, cuadre_caja=3000, previous_balance=0)
INSERT INTO cycles (truck_id, start_date, end_date, previous_balance, cuadre_caja, closed, closed_at)
SELECT id, '2026-02-26', '2026-04-01', 0, 3000, true, now()
FROM trucks WHERE number = '109';

-- Cycle 2: 07 April - 04 May (closed, cuadre_caja=2200, previous_balance=3000)
INSERT INTO cycles (truck_id, start_date, end_date, previous_balance, cuadre_caja, closed, closed_at)
SELECT id, '2026-04-07', '2026-05-04', 3000, 2200, true, now()
FROM trucks WHERE number = '109';

-- Cycle 3: 13 May - open (active, previous_balance=2200)
INSERT INTO cycles (truck_id, start_date, end_date, previous_balance, cuadre_caja, closed)
SELECT id, '2026-05-13', null, 2200, 0, false
FROM trucks WHERE number = '109';

-- Step 3: Insert cycle for Truck 106 (May, open)
INSERT INTO cycles (truck_id, start_date, end_date, previous_balance, cuadre_caja, closed)
SELECT id, '2026-05-22', null, 0, 0, false
FROM trucks WHERE number = '106';

-- Step 4: Insert cycle for Truck 108 (May, open)
INSERT INTO cycles (truck_id, start_date, end_date, previous_balance, cuadre_caja, closed)
SELECT id, '2026-05-22', null, 0, 0, false
FROM trucks WHERE number = '108';

-- Verify
SELECT t.name, t.number, c.start_date, c.end_date, c.previous_balance, c.cuadre_caja, c.closed
FROM cycles c JOIN trucks t ON t.id = c.truck_id
ORDER BY t.number, c.start_date;
