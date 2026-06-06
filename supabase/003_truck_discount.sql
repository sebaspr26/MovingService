-- Add discount_percent column to trucks (default 13%)
alter table trucks add column if not exists discount_percent numeric(5,2) default 13;
