ALTER TABLE users ADD COLUMN IF NOT EXISTS display_name TEXT NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_key TEXT NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE users ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'Asia/Shanghai';
--> statement-breakpoint
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone TEXT NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE users ADD COLUMN IF NOT EXISTS job_title TEXT NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE users ADD COLUMN IF NOT EXISTS tech_stacks TEXT NOT NULL DEFAULT '[]';
--> statement-breakpoint
UPDATE users SET display_name = '' WHERE display_name IS NULL;
--> statement-breakpoint
UPDATE users SET avatar_key = '' WHERE avatar_key IS NULL;
--> statement-breakpoint
UPDATE users SET timezone = 'Asia/Shanghai' WHERE timezone IS NULL OR timezone = '';
--> statement-breakpoint
UPDATE users SET phone = '' WHERE phone IS NULL;
--> statement-breakpoint
UPDATE users SET tech_stacks = '[]' WHERE tech_stacks IS NULL OR tech_stacks = '';
--> statement-breakpoint
UPDATE users SET job_title = 'project_manager' WHERE role = 'project_manager' AND COALESCE(job_title, '') = '';
--> statement-breakpoint
UPDATE users SET job_title = 'development_manager' WHERE role = 'development_manager' AND COALESCE(job_title, '') = '';
--> statement-breakpoint
UPDATE users SET job_title = 'developer' WHERE role = 'team_member' AND COALESCE(job_title, '') = '';
