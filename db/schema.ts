import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const users = sqliteTable(
  "users",
  {
    id: text("id").primaryKey(),
    username: text("username").notNull(),
    passwordHash: text("password_hash").notNull(),
    role: text("role").notNull().default("team_member"),
    displayName: text("display_name").notNull().default(""),
    avatarKey: text("avatar_key").notNull().default(""),
    timezone: text("timezone").notNull().default("Asia/Shanghai"),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    usernameIdx: uniqueIndex("users_username_unique").on(table.username),
  })
);

export const boards = sqliteTable(
  "boards",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    ownerUserId: text("owner_user_id").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    ownerIdx: index("boards_owner_user_id_idx").on(table.ownerUserId),
  })
);

export const boardMembers = sqliteTable(
  "board_members",
  {
    boardId: text("board_id").notNull(),
    userId: text("user_id").notNull(),
    role: text("role").notNull().default("viewer"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    pk: uniqueIndex("board_members_board_user_unique").on(table.boardId, table.userId),
    userIdx: index("board_members_user_id_idx").on(table.userId),
  })
);

export const teams = sqliteTable(
  "teams",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    ownerUserId: text("owner_user_id").notNull(),
    color: text("color").notNull().default("#0f766e"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    ownerIdx: index("teams_owner_user_id_idx").on(table.ownerUserId),
  })
);

export const teamMembers = sqliteTable(
  "team_members",
  {
    teamId: text("team_id").notNull(),
    userId: text("user_id").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    pk: uniqueIndex("team_members_team_user_unique").on(table.teamId, table.userId),
    userIdx: index("team_members_user_id_idx").on(table.userId),
  })
);

export const boardTeams = sqliteTable(
  "board_teams",
  {
    boardId: text("board_id").notNull(),
    teamId: text("team_id").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    pk: uniqueIndex("board_teams_board_team_unique").on(table.boardId, table.teamId),
    teamIdx: index("board_teams_team_id_idx").on(table.teamId),
  })
);

export const projects = sqliteTable("projects", {
  id: text("id").primaryKey(),
  boardId: text("board_id").notNull().default("default-board"),
  teamId: text("team_id").notNull().default(""),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  owner: text("owner").notNull(),
  color: text("color").notNull(),
  health: text("health").notNull().default("normal"),
  status: text("status").notNull().default("active"),
  summary: text("summary").notNull().default(""),
  archivedAt: text("archived_at"),
  orderIndex: integer("order_index").notNull().default(0),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => ({
  boardIdx: index("projects_board_id_idx").on(table.boardId),
}));

export const tasks = sqliteTable("tasks", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  status: text("status").notNull().default("backlog"),
  priority: text("priority").notNull().default("medium"),
  ownerUserId: text("owner_user_id").notNull().default(""),
  owner: text("owner").notNull().default("未分配"),
  testerUserId: text("tester_user_id").notNull().default(""),
  tester: text("tester").notNull().default(""),
  startDate: text("start_date").notNull().default(""),
  testDueDate: text("test_due_date").notNull().default(""),
  designDueDate: text("design_due_date").notNull().default(""),
  dueDate: text("due_date").notNull().default(""),
  estimate: integer("estimate").notNull().default(1),
  progress: integer("progress").notNull().default(0),
  blockers: integer("blockers").notNull().default(0),
  blockedReason: text("blocked_reason").notNull().default(""),
  tags: text("tags").notNull().default("[]"),
  orderIndex: integer("order_index").notNull().default(0),
  deletedAt: text("deleted_at"),
  completedAt: text("completed_at"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const subtasks = sqliteTable("subtasks", {
  id: text("id").primaryKey(),
  taskId: text("task_id").notNull(),
  title: text("title").notNull(),
  done: integer("done", { mode: "boolean" }).notNull().default(false),
  orderIndex: integer("order_index").notNull().default(0),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const activityLog = sqliteTable("task_activity", {
  id: text("id").primaryKey(),
  boardId: text("board_id").notNull().default("default-board"),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  projectId: text("project_id"),
  taskId: text("task_id"),
  action: text("action").notNull(),
  message: text("message").notNull(),
  meta: text("meta").notNull().default("{}"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => ({
  boardIdx: index("task_activity_board_id_idx").on(table.boardId),
}));

export const systemParameters = sqliteTable("system_parameters", {
  key: text("key").primaryKey(),
  value: text("value").notNull().default(""),
  label: text("label").notNull(),
  valueType: text("value_type").notNull().default("text"),
  group: text("parameter_group").notNull().default("基础"),
  unit: text("unit").notNull().default(""),
  minValue: integer("min_value"),
  maxValue: integer("max_value"),
  orderIndex: integer("order_index").notNull().default(0),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});
