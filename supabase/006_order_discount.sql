-- Add discount_percent column to orders so each order stores its own discount at creation time
alter table orders add column if not exists discount_percent numeric(5,2);
