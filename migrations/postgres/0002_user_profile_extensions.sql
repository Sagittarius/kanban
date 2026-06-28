ALTER TABLE users ADD COLUMN IF NOT EXISTS job_title TEXT NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE users ADD COLUMN IF NOT EXISTS tech_stacks TEXT NOT NULL DEFAULT '[]';
--> statement-breakpoint
UPDATE users SET job_title = 'project_manager' WHERE role = 'project_manager' AND COALESCE(job_title, '') = '';
--> statement-breakpoint
UPDATE users SET job_title = 'development_manager' WHERE role = 'development_manager' AND COALESCE(job_title, '') = '';
--> statement-breakpoint
UPDATE users SET job_title = 'developer' WHERE role = 'team_member' AND COALESCE(job_title, '') = '';
