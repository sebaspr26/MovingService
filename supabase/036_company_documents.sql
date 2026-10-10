-- Company Documents (Compania > Company Documents). The screen used to keep the
-- uploaded files only in the browser's memory, so everything vanished on reload.
-- Files go to Storage (bucket company-docs, prefix company/<company_id>/) and one
-- row per file here, scoped to the company (company_settings.id).
create table if not exists company_documents (
  id uuid default gen_random_uuid() primary key,
  company_id uuid references company_settings(id) on delete cascade not null,
  name text not null,
  file_name text not null,
  file_path text not null,
  file_size integer default 0,
  mime_type text,
  created_by_email text,
  created_by_name text,
  created_at timestamptz default now()
);

create index if not exists company_documents_company_id_idx on company_documents(company_id);

alter table company_documents enable row level security;
drop policy if exists "Allow all on company_documents" on company_documents;
create policy "Allow all on company_documents" on company_documents for all using (true) with check (true);
