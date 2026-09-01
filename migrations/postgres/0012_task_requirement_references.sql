ALTER TABLE tasks ADD COLUMN IF NOT EXISTS requirement_item TEXT NOT NULL DEFAULT '';
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS sub_item TEXT NOT NULL DEFAULT '';

COMMENT ON COLUMN tasks.requirement_item IS '需求项编号';
COMMENT ON COLUMN tasks.sub_item IS '子条目编号';
