ALTER TABLE projects ADD COLUMN IF NOT EXISTS owner_user_id TEXT NOT NULL DEFAULT '';
--> statement-breakpoint
UPDATE projects AS p
SET owner_user_id = matched.owner_user_id
FROM (
  SELECT DISTINCT ON (p2.id) p2.id AS project_id, u.id AS owner_user_id
  FROM projects p2
  JOIN team_members tm ON tm.team_id = p2.team_id
  JOIN users u ON u.id = tm.user_id
  WHERE p2.owner_user_id = ''
    AND (u.display_name = p2.owner OR u.username = p2.owner)
  ORDER BY p2.id, CASE WHEN u.display_name = p2.owner THEN 0 ELSE 1 END, u.username ASC
) AS matched
WHERE p.id = matched.project_id
  AND p.owner_user_id = '';
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS projects_owner_user_id_idx ON projects (owner_user_id);
