-- Driver Pay + Enhanced Stops
-- Run this in Supabase SQL Editor

-- 1. Enhanced stops: add location_name, ref_number
alter table order_stops add column if not exists location_name text;
alter table order_stops add column if not exists ref_number text;

-- 2. Driver pay items table
create table if not exists driver_pay_items (
  id uuid default gen_random_uuid() primary key,
  order_id uuid references orders(id) on delete cascade not null,
  pay_item text not null default 'Linehaul',
  units_type text default 'Flat',
  units numeric(10,2) default 1,
  rate numeric(10,2) default 0,
  total numeric(10,2) default 0,
  created_at timestamptz default now()
);

alter table driver_pay_items enable row level security;
create policy "Allow all on driver_pay_items" on driver_pay_items for all using (true) with check (true);

-- 3. Add driver_name and settlement fields to orders
alter table orders add column if not exists driver_name text;
alter table orders add column if not exists driver_pay_total numeric(10,2) default 0;
alter table orders add column if not exists commodity text;
alter table orders add column if not exists weight numeric(10,2) default 0;
alter table orders add column if not exists special_instructions text;
