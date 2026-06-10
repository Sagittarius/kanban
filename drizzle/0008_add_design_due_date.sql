-- 添加设计截止日期字段（兼容旧数据库升级）
ALTER TABLE `tasks` ADD `design_due_date` text DEFAULT '' NOT NULL;
