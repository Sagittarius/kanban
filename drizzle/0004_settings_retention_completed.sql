ALTER TABLE `tasks` ADD `completed_at` text;
--> statement-breakpoint
UPDATE `tasks`
SET `completed_at` = `updated_at`
WHERE `status` = 'done' AND `completed_at` IS NULL;
--> statement-breakpoint
ALTER TABLE `system_parameters` ADD `parameter_group` text DEFAULT '基础' NOT NULL;
--> statement-breakpoint
ALTER TABLE `system_parameters` ADD `unit` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `system_parameters` ADD `min_value` integer;
--> statement-breakpoint
ALTER TABLE `system_parameters` ADD `max_value` integer;
--> statement-breakpoint
ALTER TABLE `system_parameters` ADD `order_index` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
UPDATE `system_parameters`
SET
  `label` = '临期天数',
  `value_type` = 'number',
  `parameter_group` = '任务',
  `unit` = '天',
  `min_value` = 0,
  `max_value` = 30,
  `order_index` = 10
WHERE `key` = 'due_soon_days';
--> statement-breakpoint
INSERT OR IGNORE INTO `system_parameters` (
  `key`,
  `value`,
  `label`,
  `value_type`,
  `parameter_group`,
  `unit`,
  `min_value`,
  `max_value`,
  `order_index`,
  `updated_at`
)
VALUES (
  'activity_retention_days',
  '180',
  '活动保留天数',
  'number',
  '活动记录',
  '天',
  1,
  3650,
  20,
  CURRENT_TIMESTAMP
);
