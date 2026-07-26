-- Audit log for tracking destructive actions
CREATE TABLE IF NOT EXISTS audit_log (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  action text NOT NULL,           -- 'delete_truck', etc.
  entity_type text NOT NULL,      -- 'truck', 'order', etc.
  entity_id uuid,
  entity_name text,               -- nombre del truck/order eliminado
  user_agent text,
  ip_address text,
  extra_info jsonb,               -- cualquier dato adicional (truck_number, etc.)
  created_at timestamptz DEFAULT now()
);

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all on audit_log" ON audit_log FOR ALL USING (true) WITH CHECK (true);
