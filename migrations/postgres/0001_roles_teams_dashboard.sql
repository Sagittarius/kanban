UPDATE users SET role = 'team_member' WHERE role = 'user';
--> statement-breakpoint
ALTER TABLE users ALTER COLUMN role SET DEFAULT 'team_member';
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS teams (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  owner_user_id TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#0f766e',
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS teams_owner_user_id_idx ON teams (owner_user_id);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS team_members (
  team_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (team_id, user_id)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS team_members_user_id_idx ON team_members (user_id);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS board_teams (
  board_id TEXT NOT NULL,
  team_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (board_id, team_id)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS board_teams_team_id_idx ON board_teams (team_id);
--> statement-breakpoint
ALTER TABLE projects ADD COLUMN IF NOT EXISTS team_id TEXT NOT NULL DEFAULT '';
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS projects_team_id_idx ON projects (team_id);
--> statement-breakpoint
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS owner_user_id TEXT NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS tester_user_id TEXT NOT NULL DEFAULT '';
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS tasks_owner_user_id_idx ON tasks (owner_user_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS tasks_tester_user_id_idx ON tasks (tester_user_id);
