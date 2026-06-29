-- Order Documents - RC, BOL, POD uploads
-- Run this in Supabase SQL Editor

-- 1. Documents metadata table
create table if not exists order_documents (
  id uuid default gen_random_uuid() primary key,
  order_id uuid references orders(id) on delete cascade not null,
  doc_type text not null check (doc_type in ('RC', 'BOL', 'POD')),
  file_name text not null,
  file_path text not null,
  file_size integer default 0,
  mime_type text,
  created_at timestamptz default now()
);

alter table order_documents enable row level security;
create policy "Allow all on order_documents" on order_documents for all using (true) with check (true);

-- 2. Create storage bucket for order documents
insert into storage.buckets (id, name, public) values ('order-docs', 'order-docs', true)
on conflict (id) do nothing;

-- 3. Storage policies (allow all for now)
create policy "Allow public read on order-docs" on storage.objects
  for select using (bucket_id = 'order-docs');

create policy "Allow public insert on order-docs" on storage.objects
  for insert with check (bucket_id = 'order-docs');

create policy "Allow public delete on order-docs" on storage.objects
  for delete using (bucket_id = 'order-docs');
