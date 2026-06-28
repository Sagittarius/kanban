ALTER TABLE `users` ADD `job_title` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `users` ADD `tech_stacks` text DEFAULT '[]' NOT NULL;
--> statement-breakpoint
UPDATE `users` SET `job_title` = 'project_manager' WHERE `role` = 'project_manager' AND (`job_title` IS NULL OR `job_title` = '');
--> statement-breakpoint
UPDATE `users` SET `job_title` = 'development_manager' WHERE `role` = 'development_manager' AND (`job_title` IS NULL OR `job_title` = '');
--> statement-breakpoint
UPDATE `users` SET `job_title` = 'developer' WHERE `role` = 'team_member' AND (`job_title` IS NULL OR `job_title` = '');
