-- Cycles table: replaces monthly cashbox periods with flexible cycles
create table if not exists cycles (
  id uuid default gen_random_uuid() primary key,
  truck_id uuid references trucks(id) on delete cascade not null,
  start_date date not null,
  end_date date, -- null = active/open cycle
  previous_balance numeric(10,2) default 0,
  cuadre_caja numeric(10,2) default 0,
  closed boolean default false,
  closed_at timestamptz,
  created_at timestamptz default now()
);

-- Add date column to accounting table (for filtering like other tables)
alter table accounting add column if not exists date date;

-- RLS
alter table cycles enable row level security;
create policy "Allow all on cycles" on cycles for all using (true) with check (true);

-- Migrate existing cashbox records to cycles
insert into cycles (truck_id, start_date, end_date, previous_balance, cuadre_caja, closed, created_at)
select
  truck_id,
  period_start as start_date,
  period_end as end_date,
  previous_balance,
  cuadre_caja,
  false as closed,
  created_at
from cashbox
on conflict do nothing;
