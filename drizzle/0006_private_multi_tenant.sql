PRAGMA foreign_keys=OFF;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `users` (
  `id` text PRIMARY KEY NOT NULL,
  `username` text NOT NULL,
  `password_hash` text NOT NULL,
  `role` text DEFAULT 'user' NOT NULL,
  `timezone` text DEFAULT 'Asia/Shanghai' NOT NULL,
  `is_active` integer DEFAULT true NOT NULL,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `users_username_unique` ON `users` (`username`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `boards` (
  `id` text PRIMARY KEY NOT NULL,
  `name` text NOT NULL,
  `description` text DEFAULT '' NOT NULL,
  `owner_user_id` text NOT NULL,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `board_members` (
  `board_id` text NOT NULL,
  `user_id` text NOT NULL,
  `role` text DEFAULT 'viewer' NOT NULL,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `board_members_board_user_unique` ON `board_members` (`board_id`, `user_id`);
--> statement-breakpoint
ALTER TABLE `projects` ADD `board_id` text DEFAULT 'default-board' NOT NULL;
--> statement-breakpoint
ALTER TABLE `task_activity` ADD `board_id` text DEFAULT 'default-board' NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `projects_board_id_idx` ON `projects` (`board_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `tasks_project_id_idx` ON `tasks` (`project_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `task_activity_board_id_idx` ON `task_activity` (`board_id`);
--> statement-breakpoint
PRAGMA foreign_keys=ON;
