ALTER TABLE tasks ADD COLUMN IF NOT EXISTS design_completed_at TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS dev_completed_at TEXT;

COMMENT ON COLUMN tasks.design_completed_at IS '设计阶段完成时间';
COMMENT ON COLUMN tasks.dev_completed_at IS '开发阶段完成时间';
