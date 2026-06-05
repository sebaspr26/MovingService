-- ETG Moving Services - Database Schema
-- Run this in Supabase SQL Editor

-- Trucks
create table if not exists trucks (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  number text not null,
  created_at timestamptz default now()
);

-- Orders / Loads
create table if not exists orders (
  id uuid default gen_random_uuid() primary key,
  truck_id uuid references trucks(id) on delete cascade not null,
  order_number text not null,
  pu_date date,
  pu_city text,
  do_date date,
  do_city text,
  miles numeric(10,2) default 0,
  rate numeric(10,2) default 0,
  period_start date not null,
  period_end date not null,
  created_at timestamptz default now()
);

-- Diesel
create table if not exists diesel (
  id uuid default gen_random_uuid() primary key,
  truck_id uuid references trucks(id) on delete cascade not null,
  invoice_number text,
  date date not null,
  city text,
  gallons numeric(10,2) default 0,
  value numeric(10,2) default 0,
  period_start date not null,
  period_end date not null,
  created_at timestamptz default now()
);

-- Expenses
create table if not exists expenses (
  id uuid default gen_random_uuid() primary key,
  truck_id uuid references trucks(id) on delete cascade not null,
  category text,
  invoice_number text,
  description text,
  amount numeric(10,2) default 0,
  date date not null,
  period_start date not null,
  period_end date not null,
  created_at timestamptz default now()
);

-- Accounting
create table if not exists accounting (
  id uuid default gen_random_uuid() primary key,
  truck_id uuid references trucks(id) on delete cascade not null,
  description text,
  reference text,
  debit numeric(10,2) default 0,
  credit numeric(10,2) default 0,
  period_start date not null,
  period_end date not null,
  created_at timestamptz default now()
);

-- Enable Row Level Security (open for now, tighten later with auth)
alter table trucks enable row level security;
alter table orders enable row level security;
alter table diesel enable row level security;
alter table expenses enable row level security;
alter table accounting enable row level security;

-- Allow all operations (open policy - add auth restrictions later)
create policy "Allow all on trucks" on trucks for all using (true) with check (true);
create policy "Allow all on orders" on orders for all using (true) with check (true);
create policy "Allow all on diesel" on diesel for all using (true) with check (true);
create policy "Allow all on expenses" on expenses for all using (true) with check (true);
create policy "Allow all on accounting" on accounting for all using (true) with check (true);
