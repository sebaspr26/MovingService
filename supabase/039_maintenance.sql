-- Maintenance (sidebar "Mantenimiento" + notification bell).
-- Per truck (only trucks with a truck_type): every `interval_miles` it needs
-- service, with an optional early notice at `warn_miles`. The counter is NOT
-- stored: it is start_miles + the loaded miles + deadhead (DH) of the truck's
-- orders that ran since `counting_from`, so it always follows the orders.
create table if not exists truck_maintenance (
  truck_id uuid primary key references trucks(id) on delete cascade,
  interval_miles integer not null check (interval_miles > 0),
  warn_miles integer check (warn_miles is null or warn_miles > 0),   -- first notice (yellow); null = none
  counting_from date not null default current_date,                   -- orders picked up on/after this date count
  start_miles numeric not null default 0,                             -- miles already driven since the last service
  updated_by_name text,
  updated_at timestamptz default now()
);

-- Every service done; registering one restarts the counter (counting_from = serviced_at, start_miles = 0)
create table if not exists maintenance_logs (
  id uuid default gen_random_uuid() primary key,
  truck_id uuid references trucks(id) on delete cascade not null,
  serviced_at date not null,
  miles_at numeric,                  -- counter value when it was serviced
  notes text,
  created_by_email text,
  created_by_name text,
  created_at timestamptz default now()
);
create index if not exists maintenance_logs_truck_idx on maintenance_logs(truck_id, serviced_at desc);

-- Which alerts each user already looked at. An alert is identified by
-- truck | counting_from | start_miles | level, so a new service cycle or going from
-- yellow to red is a new, unread alert.
create table if not exists maintenance_alert_reads (
  user_id uuid not null,
  alert_key text not null,
  read_at timestamptz default now(),
  primary key (user_id, alert_key)
);

alter table truck_maintenance enable row level security;
alter table maintenance_logs enable row level security;
alter table maintenance_alert_reads enable row level security;
drop policy if exists "Allow all on truck_maintenance" on truck_maintenance;
drop policy if exists "Allow all on maintenance_logs" on maintenance_logs;
drop policy if exists "Allow all on maintenance_alert_reads" on maintenance_alert_reads;
create policy "Allow all on truck_maintenance" on truck_maintenance for all using (true) with check (true);
create policy "Allow all on maintenance_logs" on maintenance_logs for all using (true) with check (true);
create policy "Allow all on maintenance_alert_reads" on maintenance_alert_reads for all using (true) with check (true);
