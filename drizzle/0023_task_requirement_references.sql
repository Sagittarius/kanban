ALTER TABLE tasks ADD COLUMN requirement_item TEXT NOT NULL DEFAULT '';
ALTER TABLE tasks ADD COLUMN sub_item TEXT NOT NULL DEFAULT '';

INSERT OR REPLACE INTO schema_comments (table_name,column_name,comment_type,comment,updated_at) VALUES
('tasks', 'requirement_item', 'column', '需求项编号', CURRENT_TIMESTAMP),
('tasks', 'sub_item', 'column', '子条目编号', CURRENT_TIMESTAMP);
