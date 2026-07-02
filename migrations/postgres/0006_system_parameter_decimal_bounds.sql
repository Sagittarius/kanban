ALTER TABLE system_parameters ALTER COLUMN min_value TYPE NUMERIC(8,2) USING min_value::NUMERIC;
--> statement-breakpoint
ALTER TABLE system_parameters ALTER COLUMN max_value TYPE NUMERIC(8,2) USING max_value::NUMERIC;
