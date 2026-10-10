-- Dispatcher unions (Pago Dispatchers). The super admin joins two or more
-- dispatchers into a named union; administrators only see the union (combined
-- loads and payments, nobody can tell who did which load). Paying a union still
-- creates one ordinary dispatcher_payments row PER dispatcher (their own loads at
-- their own commission %), so each one keeps his own settlement/invoice. Those
-- rows share `union_group` (one union payment) and point to the union.
create table if not exists dispatcher_unions (
  id uuid default gen_random_uuid() primary key,
  company_id uuid references company_settings(id) on delete cascade not null,
  name text not null,
  members text[] not null default '{}',   -- dispatcher emails, lower case
  created_at timestamptz default now()
);

create index if not exists dispatcher_unions_company_id_idx on dispatcher_unions(company_id);

alter table dispatcher_unions enable row level security;
drop policy if exists "Allow all on dispatcher_unions" on dispatcher_unions;
create policy "Allow all on dispatcher_unions" on dispatcher_unions for all using (true) with check (true);

alter table dispatcher_payments add column if not exists union_id uuid references dispatcher_unions(id) on delete set null;
alter table dispatcher_payments add column if not exists union_group uuid;
create index if not exists dispatcher_payments_union_group_idx on dispatcher_payments(union_group);
