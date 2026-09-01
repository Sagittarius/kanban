CREATE INDEX IF NOT EXISTS users_username_lower_idx ON users (lower(username));
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS boards_updated_at_idx ON boards (updated_at, created_at);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS projects_board_status_order_idx ON projects (board_id, status, order_index);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS projects_team_status_name_idx ON projects (team_id, status, name);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS tasks_project_deleted_status_order_idx ON tasks (project_id, deleted_at, status, order_index, updated_at);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS tasks_project_deleted_updated_idx ON tasks (project_id, deleted_at, updated_at);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS subtasks_task_order_idx ON subtasks (task_id, order_index);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS task_activity_board_created_idx ON task_activity (board_id, created_at DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS audit_logs_actor_created_idx ON audit_logs (actor_user_id, created_at DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS audit_logs_board_created_idx ON audit_logs (board_id, created_at DESC);
