CREATE TABLE `system_parameters` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text DEFAULT '' NOT NULL,
	`label` text NOT NULL,
	`value_type` text DEFAULT 'text' NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
INSERT INTO `system_parameters` (`key`, `value`, `label`, `value_type`, `updated_at`)
VALUES ('due_soon_days', '2', '临期天数', 'number', CURRENT_TIMESTAMP);
