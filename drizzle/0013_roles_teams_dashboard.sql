UPDATE `users` SET `role` = 'team_member' WHERE `role` = 'user';
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `teams` (
  `id` text PRIMARY KEY NOT NULL,
  `name` text NOT NULL,
  `description` text DEFAULT '' NOT NULL,
  `owner_user_id` text NOT NULL,
  `color` text DEFAULT '#0f766e' NOT NULL,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `teams_owner_user_id_idx` ON `teams` (`owner_user_id`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `team_members` (
  `team_id` text NOT NULL,
  `user_id` text NOT NULL,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `team_members_team_user_unique` ON `team_members` (`team_id`, `user_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `team_members_user_id_idx` ON `team_members` (`user_id`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `board_teams` (
  `board_id` text NOT NULL,
  `team_id` text NOT NULL,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `board_teams_board_team_unique` ON `board_teams` (`board_id`, `team_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `board_teams_team_id_idx` ON `board_teams` (`team_id`);
--> statement-breakpoint
ALTER TABLE `projects` ADD `team_id` text DEFAULT '' NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `projects_team_id_idx` ON `projects` (`team_id`);
--> statement-breakpoint
ALTER TABLE `tasks` ADD `owner_user_id` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `tasks` ADD `tester_user_id` text DEFAULT '' NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `tasks_owner_user_id_idx` ON `tasks` (`owner_user_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `tasks_tester_user_id_idx` ON `tasks` (`tester_user_id`);
