import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { activityLog, projects, subtasks, tasks } from "@/db/schema";
import {
  boardColumns,
  createSeedBoard,
  isPriority,
  isProjectHealth,
  isProjectStatus,
  normalizeBoardStatus,
  type ActivityLog,
  type BoardData,
  type BoardStatus,
  type BoardTask,
  type Priority,
  type Project,
  type ProjectHealth,
  type ProjectStatus,
  type Subtask,
} from "@/lib/board-data";

type TaskRow = typeof tasks.$inferSelect;
type ProjectRow = typeof projects.$inferSelect;
type SubtaskRow = typeof subtasks.$inferSelect;
type ActivityRow = typeof activityLog.$inferSelect;

export type CreateProjectInput = {
  name?: unknown;
  description?: unknown;
  owner?: unknown;
  color?: unknown;
  health?: unknown;
};

export type UpdateProjectInput = Partial<{
  name: unknown;
  description: unknown;
  owner: unknown;
  color: unknown;
  health: unknown;
  status: unknown;
  summary: unknown;
}>;

export type CreateTaskInput = {
  title?: unknown;
  description?: unknown;
  projectId?: unknown;
  status?: unknown;
  priority?: unknown;
  owner?: unknown;
  dueDate?: unknown;
  tags?: unknown;
};

export type UpdateTaskInput = Partial<{
  title: unknown;
  description: unknown;
  projectId: unknown;
  status: unknown;
  priority: unknown;
  owner: unknown;
  startDate: unknown;
  dueDate: unknown;
  estimate: unknown;
  progress: unknown;
  blockers: unknown;
  blockedReason: unknown;
  tags: unknown;
}>;

export type ReorderTaskInput = {
  updates?: unknown;
};

export type CreateSubtaskInput = {
  title?: unknown;
};

export type UpdateSubtaskInput = Partial<{
  title: unknown;
  done: unknown;
}>;

function nowIso() {
  return new Date().toISOString();
}

function asText(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function optionalText(value: unknown, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

function asNumber(value: unknown, fallback: number, min: number, max: number) {
  const numberValue = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numberValue)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, Math.round(numberValue)));
}

function parseJsonObject(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function parseTags(value: string): string[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((tag): tag is string => typeof tag === "string")
      : [];
  } catch {
    return [];
  }
}

function normalizeTags(value: unknown, fallback: string[]) {
  const rawTags =
    typeof value === "string"
      ? value.split(/[,\s，、]+/)
      : Array.isArray(value)
        ? value
        : fallback;

  return rawTags
    .filter((tag): tag is string => typeof tag === "string")
    .map((tag) => tag.trim())
    .filter(Boolean)
    .filter((tag, index, list) => list.indexOf(tag) === index)
    .slice(0, 8);
}

function rowToProject(row: ProjectRow): Project {
  const health: ProjectHealth = isProjectHealth(row.health)
    ? row.health
    : "normal";
  const status: ProjectStatus = isProjectStatus(row.status)
    ? row.status
    : "active";

  return {
    id: row.id,
    name: row.name,
    description: row.description,
    owner: row.owner,
    color: row.color,
    health,
    status,
    summary: row.summary,
    archivedAt: row.archivedAt,
    orderIndex: row.orderIndex,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function rowToSubtask(row: SubtaskRow): Subtask {
  return {
    id: row.id,
    taskId: row.taskId,
    title: row.title,
    done: row.done,
    orderIndex: row.orderIndex,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function rowToTask(row: TaskRow, taskSubtasks: Subtask[]): BoardTask {
  const priority: Priority = isPriority(row.priority) ? row.priority : "medium";

  return {
    id: row.id,
    projectId: row.projectId,
    title: row.title,
    description: row.description,
    status: normalizeBoardStatus(row.status),
    priority,
    owner: row.owner,
    startDate: row.startDate,
    dueDate: row.dueDate,
    estimate: row.estimate,
    progress: row.progress,
    blockers: row.blockers,
    blockedReason: row.blockedReason,
    tags: parseTags(row.tags),
    subtasks: taskSubtasks,
    orderIndex: row.orderIndex,
    deletedAt: row.deletedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function rowToActivity(row: ActivityRow): ActivityLog {
  return {
    id: row.id,
    entityType:
      row.entityType === "project" ||
      row.entityType === "task" ||
      row.entityType === "subtask" ||
      row.entityType === "board"
        ? row.entityType
        : "board",
    entityId: row.entityId,
    projectId: row.projectId,
    taskId: row.taskId,
    action: row.action,
    message: row.message,
    meta: parseJsonObject(row.meta),
    createdAt: row.createdAt,
  };
}

async function recordActivity(input: {
  entityType: ActivityLog["entityType"];
  entityId: string;
  projectId?: string | null;
  taskId?: string | null;
  action: string;
  message: string;
  meta?: Record<string, unknown>;
}) {
  const db = getDb();
  await db.insert(activityLog).values({
    id: crypto.randomUUID(),
    entityType: input.entityType,
    entityId: input.entityId,
    projectId: input.projectId ?? null,
    taskId: input.taskId ?? null,
    action: input.action,
    message: input.message,
    meta: JSON.stringify(input.meta ?? {}),
    createdAt: nowIso(),
  });
}

async function ensureSeeded() {
  const db = getDb();
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(projects);

  if (Number(count) > 0) {
    return;
  }

  const seed = createSeedBoard();
  await db.insert(projects).values(seed.projects);
  await db.insert(tasks).values(
    seed.tasks.map((task) => {
      const taskRow = {
        ...task,
        tags: JSON.stringify(task.tags),
      } as Omit<BoardTask, "subtasks" | "tags"> & {
        subtasks?: Subtask[];
        tags: string;
      };
      delete taskRow.subtasks;
      return taskRow;
    })
  );
  const seedSubtasks = seed.tasks.flatMap((task) => task.subtasks);
  if (seedSubtasks.length > 0) {
    await db.insert(subtasks).values(seedSubtasks);
  }
  await db.insert(activityLog).values(
    seed.activity.map((item) => ({
      ...item,
      meta: JSON.stringify(item.meta),
    }))
  );
}

async function nextProjectOrderIndex() {
  const db = getDb();
  const rows = await db.select({ orderIndex: projects.orderIndex }).from(projects);
  return rows.reduce((max, row) => Math.max(max, row.orderIndex), 0) + 10;
}

async function nextTaskOrderIndex(status: BoardStatus, projectId?: string) {
  const db = getDb();
  const rows = await db
    .select({ orderIndex: tasks.orderIndex })
    .from(tasks)
    .where(
      projectId
        ? and(eq(tasks.status, status), eq(tasks.projectId, projectId), isNull(tasks.deletedAt))
        : and(eq(tasks.status, status), isNull(tasks.deletedAt))
    );
  return rows.reduce((max, row) => Math.max(max, row.orderIndex), 0) + 10;
}

async function nextSubtaskOrderIndex(taskId: string) {
  const db = getDb();
  const rows = await db
    .select({ orderIndex: subtasks.orderIndex })
    .from(subtasks)
    .where(eq(subtasks.taskId, taskId));
  return rows.reduce((max, row) => Math.max(max, row.orderIndex), 0) + 10;
}

async function recalculateTaskProgress(taskId: string) {
  const db = getDb();
  const rows = await db
    .select()
    .from(subtasks)
    .where(eq(subtasks.taskId, taskId))
    .orderBy(asc(subtasks.orderIndex));

  if (rows.length === 0) {
    return null;
  }

  const done = rows.filter((row) => row.done).length;
  const progress = Math.round((done / rows.length) * 100);
  await db
    .update(tasks)
    .set({ progress, updatedAt: nowIso() })
    .where(eq(tasks.id, taskId));
  return progress;
}

export async function getBoard(): Promise<BoardData> {
  await ensureSeeded();

  const db = getDb();
  const [projectRows, taskRows, subtaskRows, activityRows] = await Promise.all([
    db.select().from(projects).orderBy(asc(projects.status), asc(projects.orderIndex)),
    db
      .select()
      .from(tasks)
      .where(isNull(tasks.deletedAt))
      .orderBy(asc(tasks.status), asc(tasks.orderIndex), desc(tasks.updatedAt)),
    db.select().from(subtasks).orderBy(asc(subtasks.orderIndex)),
    db.select().from(activityLog).orderBy(desc(activityLog.createdAt)).limit(80),
  ]);

  const subtasksByTask = new Map<string, Subtask[]>();
  for (const row of subtaskRows) {
    const item = rowToSubtask(row);
    const existing = subtasksByTask.get(item.taskId) ?? [];
    existing.push(item);
    subtasksByTask.set(item.taskId, existing);
  }

  return {
    columns: boardColumns,
    projects: projectRows.map(rowToProject),
    tasks: taskRows.map((row) => rowToTask(row, subtasksByTask.get(row.id) ?? [])),
    activity: activityRows.map(rowToActivity),
    storageMode: "d1",
  };
}

export async function createProject(input: CreateProjectInput): Promise<Project> {
  await ensureSeeded();

  const db = getDb();
  const now = nowIso();
  const project = {
    id: crypto.randomUUID(),
    name: asText(input.name, "未命名项目"),
    description: optionalText(input.description, ""),
    owner: asText(input.owner, "未分配"),
    color: asText(input.color, "#1f6f68"),
    health: isProjectHealth(input.health) ? input.health : "normal",
    status: "active" as const,
    summary: "",
    archivedAt: null,
    orderIndex: await nextProjectOrderIndex(),
    createdAt: now,
    updatedAt: now,
  };

  await db.insert(projects).values(project);
  await recordActivity({
    entityType: "project",
    entityId: project.id,
    projectId: project.id,
    action: "project.create",
    message: `创建项目「${project.name}」。`,
  });

  return project;
}

export async function updateProject(
  id: string,
  input: UpdateProjectInput
): Promise<Project> {
  await ensureSeeded();

  const db = getDb();
  const [existing] = await db.select().from(projects).where(eq(projects.id, id));
  if (!existing) {
    throw new Error("Project not found");
  }

  const current = rowToProject(existing);
  const nextStatus = isProjectStatus(input.status) ? input.status : current.status;
  const archivedAt =
    nextStatus === "archived" && current.status !== "archived"
      ? nowIso()
      : nextStatus === "active"
        ? null
        : current.archivedAt;
  const patch = {
    name: asText(input.name, current.name),
    description: optionalText(input.description, current.description),
    owner: asText(input.owner, current.owner),
    color: asText(input.color, current.color),
    health: isProjectHealth(input.health) ? input.health : current.health,
    status: nextStatus,
    summary: optionalText(input.summary, current.summary),
    archivedAt,
    updatedAt: nowIso(),
  };

  await db.update(projects).set(patch).where(eq(projects.id, id));
  await recordActivity({
    entityType: "project",
    entityId: id,
    projectId: id,
    action:
      nextStatus !== current.status
        ? nextStatus === "archived"
          ? "project.archive"
          : "project.restore"
        : "project.update",
    message:
      nextStatus !== current.status
        ? `${nextStatus === "archived" ? "归档" : "恢复"}项目「${patch.name}」。`
        : `更新项目「${patch.name}」。`,
    meta: { before: current.status, after: nextStatus },
  });

  const [updated] = await db.select().from(projects).where(eq(projects.id, id));
  return rowToProject(updated);
}

export async function deleteProject(id: string): Promise<{ id: string }> {
  await ensureSeeded();

  const db = getDb();
  const [existing] = await db.select().from(projects).where(eq(projects.id, id));
  if (!existing) {
    throw new Error("Project not found");
  }

  const now = nowIso();
  await db.update(tasks).set({ deletedAt: now, updatedAt: now }).where(eq(tasks.projectId, id));
  await db.delete(projects).where(eq(projects.id, id));
  await recordActivity({
    entityType: "project",
    entityId: id,
    projectId: id,
    action: "project.delete",
    message: `删除项目「${existing.name}」及其任务。`,
  });

  return { id };
}

export async function createTask(input: CreateTaskInput): Promise<BoardTask> {
  await ensureSeeded();

  const db = getDb();
  const now = nowIso();
  const status = normalizeBoardStatus(input.status);
  const priority: Priority = isPriority(input.priority)
    ? input.priority
    : "medium";
  const projectId = asText(input.projectId, "core-platform");
  const task = {
    id: crypto.randomUUID(),
    projectId,
    title: asText(input.title, "未命名任务"),
    description: optionalText(input.description, ""),
    status,
    priority,
    owner: asText(input.owner, "未分配"),
    startDate: "",
    dueDate: optionalText(input.dueDate, ""),
    estimate: 1,
    progress: 0,
    blockers: 0,
    blockedReason: "",
    tags: normalizeTags(input.tags, []),
    orderIndex: await nextTaskOrderIndex(status, projectId),
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
  };

  await db.insert(tasks).values({
    ...task,
    tags: JSON.stringify(task.tags),
  });
  await recordActivity({
    entityType: "task",
    entityId: task.id,
    projectId,
    taskId: task.id,
    action: "task.create",
    message: `创建任务「${task.title}」。`,
    meta: { status },
  });

  return { ...task, subtasks: [] };
}

export async function updateTask(
  id: string,
  input: UpdateTaskInput
): Promise<BoardTask> {
  await ensureSeeded();

  const db = getDb();
  const [existing] = await db.select().from(tasks).where(eq(tasks.id, id));
  if (!existing || existing.deletedAt) {
    throw new Error("Task not found");
  }

  const existingSubtasks = (
    await db.select().from(subtasks).where(eq(subtasks.taskId, id))
  ).map(rowToSubtask);
  const current = rowToTask(existing, existingSubtasks);
  const nextStatus =
    input.status === undefined ? current.status : normalizeBoardStatus(input.status);
  const nextPriority = isPriority(input.priority) ? input.priority : current.priority;
  const tags = normalizeTags(input.tags, current.tags);
  const now = nowIso();
  const patch = {
    title: asText(input.title, current.title),
    description: optionalText(input.description, current.description),
    projectId: asText(input.projectId, current.projectId),
    status: nextStatus,
    priority: nextPriority,
    owner: asText(input.owner, current.owner),
    startDate: optionalText(input.startDate, current.startDate),
    dueDate: optionalText(input.dueDate, current.dueDate),
    estimate: asNumber(input.estimate, current.estimate, 1, 99),
    progress: asNumber(input.progress, current.progress, 0, 100),
    blockers: asNumber(input.blockers, current.blockers, 0, 99),
    blockedReason: optionalText(input.blockedReason, current.blockedReason),
    tags: JSON.stringify(tags),
    orderIndex:
      nextStatus !== current.status
        ? await nextTaskOrderIndex(nextStatus, current.projectId)
        : current.orderIndex,
    updatedAt: now,
  };

  await db.update(tasks).set(patch).where(eq(tasks.id, id));
  const changedFields = Object.entries({
    title: patch.title !== current.title,
    description: patch.description !== current.description,
    projectId: patch.projectId !== current.projectId,
    status: patch.status !== current.status,
    priority: patch.priority !== current.priority,
    owner: patch.owner !== current.owner,
    dueDate: patch.dueDate !== current.dueDate,
    blockers: patch.blockers !== current.blockers,
    tags: JSON.stringify(tags) !== JSON.stringify(current.tags),
  })
    .filter(([, changed]) => changed)
    .map(([field]) => field);

  await recordActivity({
    entityType: "task",
    entityId: id,
    projectId: patch.projectId,
    taskId: id,
    action: nextStatus !== current.status ? "task.status" : "task.update",
    message:
      nextStatus !== current.status
        ? `「${patch.title}」移动到${boardColumns.find((column) => column.id === nextStatus)?.title}。`
        : `更新任务「${patch.title}」。`,
    meta: { changedFields, beforeStatus: current.status, afterStatus: nextStatus },
  });

  const [updated] = await db.select().from(tasks).where(eq(tasks.id, id));
  const updatedSubtasks = (
    await db.select().from(subtasks).where(eq(subtasks.taskId, id))
  ).map(rowToSubtask);
  return rowToTask(updated, updatedSubtasks);
}

export async function deleteTask(id: string): Promise<{ id: string }> {
  await ensureSeeded();

  const db = getDb();
  const [existing] = await db.select().from(tasks).where(eq(tasks.id, id));
  if (!existing || existing.deletedAt) {
    throw new Error("Task not found");
  }

  const now = nowIso();
  await db.update(tasks).set({ deletedAt: now, updatedAt: now }).where(eq(tasks.id, id));
  await recordActivity({
    entityType: "task",
    entityId: id,
    projectId: existing.projectId,
    taskId: id,
    action: "task.delete",
    message: `删除任务「${existing.title}」。`,
  });

  return { id };
}

export async function reorderTasks(input: ReorderTaskInput): Promise<{ ok: true }> {
  await ensureSeeded();

  const updates = Array.isArray(input.updates) ? input.updates : [];
  const normalized = updates
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }
      const raw = item as Record<string, unknown>;
      const id = asText(raw.id, "");
      if (!id) {
        return null;
      }
      return {
        id,
        status: normalizeBoardStatus(raw.status),
        orderIndex: asNumber(raw.orderIndex, 0, 0, 100000),
      };
    })
    .filter((item): item is { id: string; status: BoardStatus; orderIndex: number } => Boolean(item));

  if (normalized.length === 0) {
    return { ok: true };
  }

  const db = getDb();
  const ids = normalized.map((item) => item.id);
  const existingRows = await db.select().from(tasks).where(inArray(tasks.id, ids));
  const existingById = new Map(existingRows.map((row) => [row.id, row]));
  const now = nowIso();

  for (const item of normalized) {
    await db
      .update(tasks)
      .set({ status: item.status, orderIndex: item.orderIndex, updatedAt: now })
      .where(eq(tasks.id, item.id));
  }

  const moved = normalized.filter((item) => {
    const existing = existingById.get(item.id);
    return existing && (existing.status !== item.status || existing.orderIndex !== item.orderIndex);
  });

  if (moved.length > 0) {
    await recordActivity({
      entityType: "board",
      entityId: "board",
      action: "board.reorder",
      message: `更新 ${moved.length} 张任务卡片的位置。`,
      meta: { moved },
    });
  }

  return { ok: true };
}

export async function createSubtask(
  taskId: string,
  input: CreateSubtaskInput
): Promise<Subtask> {
  await ensureSeeded();

  const db = getDb();
  const [task] = await db.select().from(tasks).where(eq(tasks.id, taskId));
  if (!task || task.deletedAt) {
    throw new Error("Task not found");
  }

  const now = nowIso();
  const subtask = {
    id: crypto.randomUUID(),
    taskId,
    title: asText(input.title, "新子步骤"),
    done: false,
    orderIndex: await nextSubtaskOrderIndex(taskId),
    createdAt: now,
    updatedAt: now,
  };

  await db.insert(subtasks).values(subtask);
  await recalculateTaskProgress(taskId);
  await recordActivity({
    entityType: "subtask",
    entityId: subtask.id,
    projectId: task.projectId,
    taskId,
    action: "subtask.create",
    message: `为「${task.title}」添加子步骤「${subtask.title}」。`,
  });

  return subtask;
}

export async function updateSubtask(
  taskId: string,
  subtaskId: string,
  input: UpdateSubtaskInput
): Promise<Subtask> {
  await ensureSeeded();

  const db = getDb();
  const [task] = await db.select().from(tasks).where(eq(tasks.id, taskId));
  const [existing] = await db
    .select()
    .from(subtasks)
    .where(and(eq(subtasks.id, subtaskId), eq(subtasks.taskId, taskId)));

  if (!task || task.deletedAt || !existing) {
    throw new Error("Subtask not found");
  }

  const patch = {
    title: asText(input.title, existing.title),
    done: typeof input.done === "boolean" ? input.done : existing.done,
    updatedAt: nowIso(),
  };

  await db.update(subtasks).set(patch).where(eq(subtasks.id, subtaskId));
  await recalculateTaskProgress(taskId);
  await recordActivity({
    entityType: "subtask",
    entityId: subtaskId,
    projectId: task.projectId,
    taskId,
    action: patch.done !== existing.done ? "subtask.toggle" : "subtask.update",
    message:
      patch.done !== existing.done
        ? `${patch.done ? "完成" : "取消完成"}子步骤「${patch.title}」。`
        : `更新子步骤「${patch.title}」。`,
    meta: { done: patch.done },
  });

  const [updated] = await db.select().from(subtasks).where(eq(subtasks.id, subtaskId));
  return rowToSubtask(updated);
}

export async function deleteSubtask(
  taskId: string,
  subtaskId: string
): Promise<{ id: string }> {
  await ensureSeeded();

  const db = getDb();
  const [task] = await db.select().from(tasks).where(eq(tasks.id, taskId));
  const [existing] = await db
    .select()
    .from(subtasks)
    .where(and(eq(subtasks.id, subtaskId), eq(subtasks.taskId, taskId)));

  if (!task || task.deletedAt || !existing) {
    throw new Error("Subtask not found");
  }

  await db.delete(subtasks).where(eq(subtasks.id, subtaskId));
  await recalculateTaskProgress(taskId);
  await recordActivity({
    entityType: "subtask",
    entityId: subtaskId,
    projectId: task.projectId,
    taskId,
    action: "subtask.delete",
    message: `删除子步骤「${existing.title}」。`,
  });

  return { id: subtaskId };
}
