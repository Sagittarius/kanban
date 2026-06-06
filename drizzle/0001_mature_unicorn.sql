CREATE TABLE `subtasks` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`title` text NOT NULL,
	`done` integer DEFAULT false NOT NULL,
	`order_index` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
ALTER TABLE `task_activity` ADD `entity_type` text DEFAULT 'task' NOT NULL;--> statement-breakpoint
ALTER TABLE `task_activity` ADD `entity_id` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `task_activity` ADD `project_id` text;--> statement-breakpoint
ALTER TABLE `task_activity` ADD `action` text DEFAULT 'legacy' NOT NULL;--> statement-breakpoint
ALTER TABLE `task_activity` ADD `meta` text DEFAULT '{}' NOT NULL;--> statement-breakpoint
UPDATE `task_activity` SET `entity_id` = `task_id` WHERE `entity_id` = '';--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
ALTER TABLE `projects` ADD `description` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `projects` ADD `status` text DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE `projects` ADD `summary` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `projects` ADD `archived_at` text;--> statement-breakpoint
ALTER TABLE `projects` ADD `order_index` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `tasks` ADD `blocked_reason` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `tasks` ADD `deleted_at` text;
