-- Orders Module - Parte 1: Brokers, Order Stops, Status
-- Run this in Supabase SQL Editor

-- 1. Brokers table
create table if not exists brokers (
  id uuid default gen_random_uuid() primary key,
  type text not null default 'broker' check (type in ('broker', 'customer')),
  name text not null,
  mc_number text,
  dot_number text,
  ref_number text,
  address text,
  phone text,
  email text,
  created_at timestamptz default now()
);

alter table brokers enable row level security;
create policy "Allow all on brokers" on brokers for all using (true) with check (true);

-- 2. New columns on orders
alter table orders add column if not exists status text default 'booked';
alter table orders add column if not exists broker_id uuid references brokers(id);
alter table orders add column if not exists equipment_type text;
alter table orders add column if not exists load_type text;
alter table orders add column if not exists dispatcher text;
alter table orders add column if not exists invoice_notes text;
alter table orders add column if not exists dead_miles numeric(10,2) default 0;
alter table orders add column if not exists ref_number text;

-- 3. Order stops table
create table if not exists order_stops (
  id uuid default gen_random_uuid() primary key,
  order_id uuid references orders(id) on delete cascade not null,
  type text not null default 'pickup' check (type in ('pickup', 'delivery', 'stop')),
  address text,
  city text,
  state text,
  date date,
  time text,
  sequence integer default 0,
  notes text,
  created_at timestamptz default now()
);

alter table order_stops enable row level security;
create policy "Allow all on order_stops" on order_stops for all using (true) with check (true);

-- 4. Migrate existing data: paid orders → delivered, unpaid → booked
update orders set status = 'delivered' where paid = true and (status is null or status = 'booked');
update orders set status = 'booked' where (paid = false or paid is null) and (status is null or status = 'booked');
