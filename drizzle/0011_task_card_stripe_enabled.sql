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
) VALUES (
  'task_card_stripe_enabled',
  'true',
  '任务卡片色条',
  'boolean',
  '看板',
  '',
  NULL,
  NULL,
  28,
  datetime('now')
);
