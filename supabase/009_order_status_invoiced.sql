-- Add 'invoiced' status + make truck_id optional
-- Run this in Supabase SQL Editor

-- 1. Make truck_id nullable (orders can be created without a truck = 'booked')
alter table orders alter column truck_id drop not null;

-- 2. Migrate existing delivered orders to invoiced (they're all old/closed cycle orders with paid=true)
update orders set status = 'invoiced' where status = 'delivered' and paid = true;
