CREATE TABLE IF NOT EXISTS `audit_logs` (
  `id` text PRIMARY KEY NOT NULL,
  `actor_user_id` text DEFAULT '' NOT NULL,
  `actor_username` text DEFAULT '' NOT NULL,
  `actor_role` text DEFAULT '' NOT NULL,
  `action` text NOT NULL,
  `resource_type` text DEFAULT 'system' NOT NULL,
  `resource_id` text DEFAULT '' NOT NULL,
  `board_id` text DEFAULT '' NOT NULL,
  `result` text DEFAULT 'success' NOT NULL,
  `message` text DEFAULT '' NOT NULL,
  `ip_address` text DEFAULT '' NOT NULL,
  `user_agent` text DEFAULT '' NOT NULL,
  `request_id` text DEFAULT '' NOT NULL,
  `metadata` text DEFAULT '{}' NOT NULL,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `audit_logs_created_at_idx` ON `audit_logs` (`created_at`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `audit_logs_actor_user_id_idx` ON `audit_logs` (`actor_user_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `audit_logs_action_idx` ON `audit_logs` (`action`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `audit_logs_board_id_idx` ON `audit_logs` (`board_id`);
