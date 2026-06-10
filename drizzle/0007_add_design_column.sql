INSERT OR IGNORE INTO system_parameters (key, value, label, value_type, parameter_group, unit, min_value, max_value, order_index, updated_at)
VALUES ('column_design_name', '设计中', '第2阶段名称', 'text', '看板阶段', '', NULL, NULL, 35, CURRENT_TIMESTAMP);
--> statement-breakpoint
UPDATE system_parameters SET label = '第3阶段名称' WHERE key = 'column_dev_name';
--> statement-breakpoint
UPDATE system_parameters SET label = '第4阶段名称' WHERE key = 'column_test_name';
--> statement-breakpoint
UPDATE system_parameters SET label = '第5阶段名称' WHERE key = 'column_done_name';
