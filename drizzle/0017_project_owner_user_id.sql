ALTER TABLE `projects` ADD `owner_user_id` text DEFAULT '' NOT NULL;
--> statement-breakpoint
UPDATE `projects`
SET `owner_user_id` = COALESCE(
  (
    SELECT `u`.`id`
    FROM `team_members` `tm`
    JOIN `users` `u` ON `u`.`id` = `tm`.`user_id`
    WHERE `tm`.`team_id` = `projects`.`team_id`
      AND `u`.`display_name` = `projects`.`owner`
    ORDER BY `u`.`username` ASC
    LIMIT 1
  ),
  `owner_user_id`
)
WHERE `owner_user_id` = '';
--> statement-breakpoint
UPDATE `projects`
SET `owner_user_id` = COALESCE(
  (
    SELECT `u`.`id`
    FROM `team_members` `tm`
    JOIN `users` `u` ON `u`.`id` = `tm`.`user_id`
    WHERE `tm`.`team_id` = `projects`.`team_id`
      AND `u`.`username` = `projects`.`owner`
    ORDER BY `u`.`username` ASC
    LIMIT 1
  ),
  `owner_user_id`
)
WHERE `owner_user_id` = '';
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `projects_owner_user_id_idx` ON `projects` (`owner_user_id`);
