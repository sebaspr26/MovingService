-- Partners (socios) per truck
create table if not exists partners (
  id uuid default gen_random_uuid() primary key,
  truck_id uuid references trucks(id) on delete cascade not null,
  name text not null,
  percentage numeric(5,2) not null default 0,
  invested numeric(10,2) default 0,
  created_at timestamptz default now()
);

-- Cash box (caja) - tracks balance per truck per period
create table if not exists cashbox (
  id uuid default gen_random_uuid() primary key,
  truck_id uuid references trucks(id) on delete cascade not null,
  period_start date not null,
  period_end date not null,
  previous_balance numeric(10,2) default 0,
  created_at timestamptz default now(),
  unique(truck_id, period_start, period_end)
);

-- RLS
alter table partners enable row level security;
alter table cashbox enable row level security;

create policy "Allow all on partners" on partners for all using (true) with check (true);
create policy "Allow all on cashbox" on cashbox for all using (true) with check (true);
