-- Lumpers: fees we pay at a shipper/receiver while a load is on the road.
-- One row per lumper receipt, hanging from the order. The load's value (orders.rate)
-- is NOT touched. Truck and cycle are never copied here: they come from the order
-- (join), so a lumper follows its order when it is reassigned or carried over.
--
-- paid = false -> we paid the lumper and it was not reimbursed yet: it counts as an
--                 expense of the truck's cycle.
-- paid = true  -> reimbursed (the broker paid it with the load): it stops counting.
create table if not exists order_lumpers (
  id uuid default gen_random_uuid() primary key,
  order_id uuid references orders(id) on delete cascade not null,
  amount numeric(12,2) not null default 0,
  vendor text,
  receipt_number text,
  date date,
  city text,
  notes text,
  receipt_path text,            -- photo/PDF in Storage (bucket order-docs, prefix receipts/)
  paid boolean not null default false,
  paid_at timestamptz,
  created_by_email text,
  created_by_name text,
  created_at timestamptz default now()
);

create index if not exists order_lumpers_order_id_idx on order_lumpers(order_id);

alter table order_lumpers enable row level security;
drop policy if exists "Allow all on order_lumpers" on order_lumpers;
create policy "Allow all on order_lumpers" on order_lumpers for all using (true) with check (true);
