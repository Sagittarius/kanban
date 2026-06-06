import { sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const projects = sqliteTable("projects", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  owner: text("owner").notNull(),
  color: text("color").notNull(),
  health: text("health").notNull().default("normal"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const tasks = sqliteTable("tasks", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  status: text("status").notNull().default("backlog"),
  priority: text("priority").notNull().default("medium"),
  owner: text("owner").notNull().default("未分配"),
  startDate: text("start_date").notNull().default(""),
  dueDate: text("due_date").notNull().default(""),
  estimate: integer("estimate").notNull().default(1),
  progress: integer("progress").notNull().default(0),
  blockers: integer("blockers").notNull().default(0),
  tags: text("tags").notNull().default("[]"),
  orderIndex: integer("order_index").notNull().default(0),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const taskActivity = sqliteTable("task_activity", {
  id: text("id").primaryKey(),
  taskId: text("task_id").notNull(),
  message: text("message").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});
