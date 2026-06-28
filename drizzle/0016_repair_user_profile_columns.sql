ALTER TABLE `users` ADD `display_name` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `users` ADD `avatar_key` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `users` ADD `timezone` text DEFAULT 'Asia/Shanghai' NOT NULL;
--> statement-breakpoint
ALTER TABLE `users` ADD `phone` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `users` ADD `job_title` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `users` ADD `tech_stacks` text DEFAULT '[]' NOT NULL;
--> statement-breakpoint
UPDATE `users` SET `display_name` = '' WHERE `display_name` IS NULL;
--> statement-breakpoint
UPDATE `users` SET `avatar_key` = '' WHERE `avatar_key` IS NULL;
--> statement-breakpoint
UPDATE `users` SET `timezone` = 'Asia/Shanghai' WHERE `timezone` IS NULL OR `timezone` = '';
--> statement-breakpoint
UPDATE `users` SET `phone` = '' WHERE `phone` IS NULL;
--> statement-breakpoint
UPDATE `users` SET `tech_stacks` = '[]' WHERE `tech_stacks` IS NULL OR `tech_stacks` = '';
--> statement-breakpoint
UPDATE `users` SET `job_title` = 'project_manager' WHERE `role` = 'project_manager' AND (`job_title` IS NULL OR `job_title` = '');
--> statement-breakpoint
UPDATE `users` SET `job_title` = 'development_manager' WHERE `role` = 'development_manager' AND (`job_title` IS NULL OR `job_title` = '');
--> statement-breakpoint
UPDATE `users` SET `job_title` = 'developer' WHERE `role` = 'team_member' AND (`job_title` IS NULL OR `job_title` = '');
