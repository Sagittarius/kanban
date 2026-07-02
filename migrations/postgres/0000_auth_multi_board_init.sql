CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',
  display_name TEXT NOT NULL DEFAULT '',
  avatar_key TEXT NOT NULL DEFAULT '',
  timezone TEXT NOT NULL DEFAULT 'Asia/Shanghai',
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS boards (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  owner_user_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS boards_owner_user_id_idx ON boards (owner_user_id);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS board_members (
  board_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'viewer',
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (board_id, user_id)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS board_members_user_id_idx ON board_members (user_id);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  board_id TEXT NOT NULL DEFAULT 'default-board',
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  owner TEXT NOT NULL,
  color TEXT NOT NULL,
  health TEXT NOT NULL DEFAULT 'normal',
  status TEXT NOT NULL DEFAULT 'active',
  summary TEXT NOT NULL DEFAULT '',
  archived_at TEXT,
  order_index INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS projects_board_id_idx ON projects (board_id);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'backlog',
  priority TEXT NOT NULL DEFAULT 'medium',
  owner TEXT NOT NULL DEFAULT '未分配',
  tester TEXT NOT NULL DEFAULT '',
  start_date TEXT NOT NULL DEFAULT '',
  test_due_date TEXT NOT NULL DEFAULT '',
  design_due_date TEXT NOT NULL DEFAULT '',
  due_date TEXT NOT NULL DEFAULT '',
  estimate INTEGER NOT NULL DEFAULT 1,
  progress INTEGER NOT NULL DEFAULT 0,
  blockers INTEGER NOT NULL DEFAULT 0,
  blocked_reason TEXT NOT NULL DEFAULT '',
  tags TEXT NOT NULL DEFAULT '[]',
  order_index INTEGER NOT NULL DEFAULT 0,
  deleted_at TEXT,
  completed_at TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS tasks_project_id_idx ON tasks (project_id);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS subtasks (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  title TEXT NOT NULL,
  done INTEGER NOT NULL DEFAULT 0,
  order_index INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS subtasks_task_id_idx ON subtasks (task_id);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS task_activity (
  id TEXT PRIMARY KEY,
  board_id TEXT NOT NULL DEFAULT 'default-board',
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  project_id TEXT,
  task_id TEXT,
  action TEXT NOT NULL,
  message TEXT NOT NULL,
  meta TEXT NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS task_activity_board_id_idx ON task_activity (board_id);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS system_parameters (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT '',
  label TEXT NOT NULL,
  value_type TEXT NOT NULL DEFAULT 'text',
  parameter_group TEXT NOT NULL DEFAULT '基础',
  unit TEXT NOT NULL DEFAULT '',
  min_value NUMERIC(8,2),
  max_value NUMERIC(8,2),
  order_index INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
