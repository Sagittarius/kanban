ALTER TABLE tasks ADD COLUMN design_completed_at TEXT;
ALTER TABLE tasks ADD COLUMN dev_completed_at TEXT;

INSERT OR REPLACE INTO schema_comments (table_name,column_name,comment_type,comment,updated_at) VALUES
('tasks', 'design_completed_at', 'column', '设计阶段完成时间', CURRENT_TIMESTAMP),
('tasks', 'dev_completed_at', 'column', '开发阶段完成时间', CURRENT_TIMESTAMP);
