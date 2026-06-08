CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY NOT NULL,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT DEFAULT 'user' NOT NULL,
  timezone TEXT DEFAULT 'Asia/Shanghai' NOT NULL,
  is_active INTEGER DEFAULT 1 NOT NULL,
  created_at TEXT DEFAULT (CURRENT_TIMESTAMP)::text NOT NULL,
  updated_at TEXT DEFAULT (CURRENT_TIMESTAMP)::text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS boards (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  description TEXT DEFAULT '' NOT NULL,
  owner_user_id TEXT NOT NULL,
  created_at TEXT DEFAULT (CURRENT_TIMESTAMP)::text NOT NULL,
  updated_at TEXT DEFAULT (CURRENT_TIMESTAMP)::text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS board_members (
  board_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT DEFAULT 'viewer' NOT NULL,
  created_at TEXT DEFAULT (CURRENT_TIMESTAMP)::text NOT NULL,
  CONSTRAINT board_members_board_user_unique UNIQUE (board_id, user_id)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY NOT NULL,
  board_id TEXT DEFAULT 'default-board' NOT NULL,
  name TEXT NOT NULL,
  description TEXT DEFAULT '' NOT NULL,
  owner TEXT NOT NULL,
  color TEXT NOT NULL,
  health TEXT DEFAULT 'normal' NOT NULL,
  status TEXT DEFAULT 'active' NOT NULL,
  summary TEXT DEFAULT '' NOT NULL,
  archived_at TEXT,
  order_index INTEGER DEFAULT 0 NOT NULL,
  created_at TEXT DEFAULT (CURRENT_TIMESTAMP)::text NOT NULL,
  updated_at TEXT DEFAULT (CURRENT_TIMESTAMP)::text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY NOT NULL,
  project_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT DEFAULT '' NOT NULL,
  status TEXT DEFAULT 'backlog' NOT NULL,
  priority TEXT DEFAULT 'medium' NOT NULL,
  owner TEXT DEFAULT '未分配' NOT NULL,
  start_date TEXT DEFAULT '' NOT NULL,
  test_due_date TEXT DEFAULT '' NOT NULL,
  due_date TEXT DEFAULT '' NOT NULL,
  estimate INTEGER DEFAULT 1 NOT NULL,
  progress INTEGER DEFAULT 0 NOT NULL,
  blockers INTEGER DEFAULT 0 NOT NULL,
  blocked_reason TEXT DEFAULT '' NOT NULL,
  tags TEXT DEFAULT '[]' NOT NULL,
  order_index INTEGER DEFAULT 0 NOT NULL,
  deleted_at TEXT,
  completed_at TEXT,
  created_at TEXT DEFAULT (CURRENT_TIMESTAMP)::text NOT NULL,
  updated_at TEXT DEFAULT (CURRENT_TIMESTAMP)::text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS subtasks (
  id TEXT PRIMARY KEY NOT NULL,
  task_id TEXT NOT NULL,
  title TEXT NOT NULL,
  done INTEGER DEFAULT 0 NOT NULL,
  order_index INTEGER DEFAULT 0 NOT NULL,
  created_at TEXT DEFAULT (CURRENT_TIMESTAMP)::text NOT NULL,
  updated_at TEXT DEFAULT (CURRENT_TIMESTAMP)::text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS task_activity (
  id TEXT PRIMARY KEY NOT NULL,
  board_id TEXT DEFAULT 'default-board' NOT NULL,
  entity_type TEXT DEFAULT 'task' NOT NULL,
  entity_id TEXT DEFAULT '' NOT NULL,
  project_id TEXT,
  task_id TEXT,
  action TEXT DEFAULT 'legacy' NOT NULL,
  message TEXT NOT NULL,
  meta TEXT DEFAULT '{}' NOT NULL,
  created_at TEXT DEFAULT (CURRENT_TIMESTAMP)::text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS system_parameters (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT DEFAULT '' NOT NULL,
  label TEXT NOT NULL,
  value_type TEXT DEFAULT 'text' NOT NULL,
  parameter_group TEXT DEFAULT '基础' NOT NULL,
  unit TEXT DEFAULT '' NOT NULL,
  min_value INTEGER,
  max_value INTEGER,
  order_index INTEGER DEFAULT 0 NOT NULL,
  updated_at TEXT DEFAULT (CURRENT_TIMESTAMP)::text NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS projects_board_id_idx ON projects (board_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS tasks_project_id_idx ON tasks (project_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS task_activity_board_id_idx ON task_activity (board_id);
