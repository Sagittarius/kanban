ALTER TABLE audit_logs
  ADD COLUMN IF NOT EXISTS actor_display_name TEXT NOT NULL DEFAULT '';

COMMENT ON COLUMN audit_logs.actor_display_name IS '操作人显示姓名';
