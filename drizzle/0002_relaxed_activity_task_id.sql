PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_task_activity` (
	`id` text PRIMARY KEY NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`project_id` text,
	`task_id` text,
	`action` text NOT NULL,
	`message` text NOT NULL,
	`meta` text DEFAULT '{}' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_task_activity` (
	`id`,
	`entity_type`,
	`entity_id`,
	`project_id`,
	`task_id`,
	`action`,
	`message`,
	`meta`,
	`created_at`
)
SELECT
	`id`,
	`entity_type`,
	`entity_id`,
	`project_id`,
	`task_id`,
	`action`,
	`message`,
	`meta`,
	`created_at`
FROM `task_activity`;
--> statement-breakpoint
DROP TABLE `task_activity`;
--> statement-breakpoint
ALTER TABLE `__new_task_activity` RENAME TO `task_activity`;
--> statement-breakpoint
PRAGMA foreign_keys=ON;
