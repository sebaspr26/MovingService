-- Audit log was missing company_id entirely, so every company's history was
-- shown mixed together regardless of who was viewing. Add the column and
-- backfill existing rows from the truck/cycle each entry belongs to.
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES company_settings(id);
CREATE INDEX IF NOT EXISTS idx_audit_log_company ON audit_log(company_id);

-- Backfill: truck entries -> trucks.company_id directly
UPDATE audit_log a
SET company_id = t.company_id
FROM trucks t
WHERE a.entity_type = 'truck' AND a.entity_id = t.id AND a.company_id IS NULL;

-- Backfill: cycle entries -> via the cycle's truck -> trucks.company_id
UPDATE audit_log a
SET company_id = t.company_id
FROM cycles c
JOIN trucks t ON t.id = c.truck_id
WHERE a.entity_type = 'cycle' AND a.entity_id = c.id AND a.company_id IS NULL;

-- Deleted trucks can't be backfilled (no live truck row to join to, and
-- truck numbers aren't unique across companies so guessing would risk
-- misattributing an entry to the wrong company). Those rows are left with
-- company_id = NULL and simply won't show in any company's Auditoria view.
