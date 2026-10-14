-- Préstamos (only Dacrisam). Every dispatcher/admin has a "caja": what the
-- company owes them.
--   + their commission payments (dispatcher_payments, from Pago Dispatchers)
--   - each payment the super admin marks as sent ............ kind 'payout'
--   - loans the user asks for (can leave the caja negative) .. kind 'loan'
--   + money the user hands the company outside the app ...... kind 'deposit'
-- Loans and deposits wait as 'pending' until the super admin approves or
-- rejects them; a payout is created already approved (the super admin is
-- the one marking it sent). Rejected rows stay in the history.
create table if not exists caja_movements (
  id uuid default gen_random_uuid() primary key,
  company_id uuid references company_settings(id) on delete cascade not null,
  user_email text not null,               -- lower case, the dispatcher/admin
  user_name text,
  kind text not null check (kind in ('payout', 'loan', 'deposit')),
  amount numeric(12, 2) not null check (amount > 0),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  dispatcher_payment_id uuid references dispatcher_payments(id) on delete cascade,
  note text,
  requested_by_email text,
  requested_by_name text,
  decided_by_email text,
  decided_by_name text,
  decided_at timestamptz,
  created_at timestamptz default now()
);

create index if not exists caja_movements_company_user_idx on caja_movements(company_id, user_email);
-- A dispatcher payment can be marked sent only once
create unique index if not exists caja_movements_payment_once_idx
  on caja_movements(dispatcher_payment_id) where dispatcher_payment_id is not null and status <> 'rejected';

alter table caja_movements enable row level security;
drop policy if exists "Allow all on caja_movements" on caja_movements;
create policy "Allow all on caja_movements" on caja_movements for all using (true) with check (true);

-- The section exists only for Dacrisam transport LLC
update company_settings
  set features = coalesce(features, '{}'::jsonb) || '{"prestamos": true}'::jsonb
  where id = 'b6041373-ba44-4b0f-adb9-1873a8c438d0';
