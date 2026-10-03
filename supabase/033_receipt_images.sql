-- Expense receipt images. The scanner used to read the photo and discard it;
-- now the file is kept in Storage (bucket order-docs, prefix receipts/) and
-- every row created from it points to it. Several rows can share the same path
-- when one photo held several receipts / items.
ALTER TABLE expenses       ADD COLUMN IF NOT EXISTS receipt_path text;
ALTER TABLE diesel         ADD COLUMN IF NOT EXISTS receipt_path text;
ALTER TABLE def            ADD COLUMN IF NOT EXISTS receipt_path text;
-- Kept when an expense is transferred to the owner (LIS trucks)
ALTER TABLE owner_expenses ADD COLUMN IF NOT EXISTS receipt_path text;
