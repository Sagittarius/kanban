import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { getDb, getStorageMode } from "@/db";
import { activityLog, projects, subtasks, systemParameters, tasks } from "@/db/schema";
import {
  columnsFromSettings,
  defaultSystemParameters,
  defaultSystemSettings,
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
  type SystemParameter,
  type SystemSettings,
} from "@/lib/board-data";

type TaskRow = typeof tasks.$inferSelect;
type ProjectRow = typeof projects.$inferSelect;
type SubtaskRow = typeof subtasks.$inferSelect;
type ActivityRow = typeof activityLog.$inferSelect;
type SystemParameterRow = typeof systemParameters.$inferSelect;

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
  tester?: unknown;
  testDueDate?: unknown;
  designDueDate?: unknown;
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
  tester: unknown;
  startDate: unknown;
  testDueDate: unknown;
  designDueDate: unknown;
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

export type UpdateSystemSettingsInput = Partial<{
  dueSoonDays: unknown;
  activityRetentionDays: unknown;
  parameters: unknown;
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
    tester: row.tester,
    startDate: row.startDate,
    testDueDate: row.testDueDate,
    designDueDate: row.designDueDate,
    dueDate: row.dueDate,
    estimate: row.estimate,
    progress: row.progress,
    blockers: row.blockers,
    blockedReason: row.blockedReason,
    tags: parseTags(row.tags),
    subtasks: taskSubtasks,
    orderIndex: row.orderIndex,
    deletedAt: row.deletedAt,
    completedAt: row.completedAt,
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

function rowToSystemParameter(row: SystemParameterRow): SystemParameter {
  return {
    key: row.key,
    value: row.value,
    label: row.label,
    valueType:
      row.valueType === "number" || row.valueType === "boolean"
        ? row.valueType
        : "text",
    group: row.group,
    unit: row.unit,
    minValue: row.minValue,
    maxValue: row.maxValue,
    orderIndex: row.orderIndex,
    updatedAt: row.updatedAt,
  };
}

function settingsFromRows(rows: SystemParameterRow[]): SystemSettings {
  const parameters = rows.map(rowToSystemParameter);
  const dueSoonValue =
    parameters.find((parameter) => parameter.key === "due_soon_days")?.value ??
    String(defaultSystemSettings.dueSoonDays);
  const activityRetentionValue =
    parameters.find((parameter) => parameter.key === "activity_retention_days")?.value ??
    String(defaultSystemSettings.activityRetentionDays);

  return {
    dueSoonDays: asNumber(dueSoonValue, defaultSystemSettings.dueSoonDays, 0, 30),
    activityRetentionDays: asNumber(
      activityRetentionValue,
      defaultSystemSettings.activityRetentionDays,
      1,
      3650
    ),
    parameters,
  };
}

function statusLabel(status: BoardStatus, settings: SystemSettings = defaultSystemSettings) {
  return columnsFromSettings(settings).find((column) => column.id === status)?.title ?? status;
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
  const db = await getDb();
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
  await getDb();
}

async function ensureSystemParameters() {
  const db = await getDb();
  const now = nowIso();

  for (const parameter of defaultSystemParameters) {
    const [existing] = await db
      .select({ key: systemParameters.key })
      .from(systemParameters)
      .where(eq(systemParameters.key, parameter.key));

    if (existing) {
      await db
        .update(systemParameters)
        .set({
          label: parameter.label,
          valueType: parameter.valueType,
          group: parameter.group,
          unit: parameter.unit,
          minValue: parameter.minValue,
          maxValue: parameter.maxValue,
          orderIndex: parameter.orderIndex,
        })
        .where(eq(systemParameters.key, parameter.key));
      continue;
    }

    await db.insert(systemParameters).values({
      key: parameter.key,
      value: parameter.value,
      label: parameter.label,
      valueType: parameter.valueType,
      group: parameter.group,
      unit: parameter.unit,
      minValue: parameter.minValue,
      maxValue: parameter.maxValue,
      orderIndex: parameter.orderIndex,
      updatedAt: now,
    });
  }
}

async function nextProjectOrderIndex() {
  const db = await getDb();
  const rows = await db.select({ orderIndex: projects.orderIndex }).from(projects);
  return rows.reduce((max, row) => Math.max(max, row.orderIndex), 0) + 10;
}

async function nextTaskOrderIndex(status: BoardStatus, projectId?: string) {
  const db = await getDb();
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
  const db = await getDb();
  const rows = await db
    .select({ orderIndex: subtasks.orderIndex })
    .from(subtasks)
    .where(eq(subtasks.taskId, taskId));
  return rows.reduce((max, row) => Math.max(max, row.orderIndex), 0) + 10;
}

async function recalculateTaskProgress(taskId: string) {
  const db = await getDb();
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

let lastActivityCleanupAt = 0;

async function cleanupExpiredActivity(settings: SystemSettings) {
  const now = Date.now();
  if (now - lastActivityCleanupAt < 60 * 60 * 1000) {
    return;
  }

  lastActivityCleanupAt = now;
  const retentionDays = asNumber(
    settings.activityRetentionDays,
    defaultSystemSettings.activityRetentionDays,
    1,
    3650
  );
  const cutoffIso = new Date(now - retentionDays * 86400000).toISOString();
  const db = await getDb();
  await db.delete(activityLog).where(sql`${activityLog.createdAt} < ${cutoffIso}`);
}

export async function getBoard(): Promise<BoardData> {
  await ensureSeeded();
  await ensureSystemParameters();

  const db = await getDb();
  const [projectRows, taskRows, subtaskRows, parameterRows] = await Promise.all([
    db.select().from(projects).orderBy(asc(projects.status), asc(projects.orderIndex)),
    db
      .select()
      .from(tasks)
      .where(isNull(tasks.deletedAt))
      .orderBy(asc(tasks.status), asc(tasks.orderIndex), desc(tasks.updatedAt)),
    db.select().from(subtasks).orderBy(asc(subtasks.orderIndex)),
    db.select().from(systemParameters).orderBy(asc(systemParameters.orderIndex), asc(systemParameters.key)),
  ]);
  const settings = settingsFromRows(parameterRows);
  await cleanupExpiredActivity(settings);
  const activityRows = await db.select().from(activityLog).orderBy(desc(activityLog.createdAt)).limit(80);

  const subtasksByTask = new Map<string, Subtask[]>();
  for (const row of subtaskRows) {
    const item = rowToSubtask(row);
    const existing = subtasksByTask.get(item.taskId) ?? [];
    existing.push(item);
    subtasksByTask.set(item.taskId, existing);
  }

  return {
    columns: columnsFromSettings(settings),
    projects: projectRows.map(rowToProject),
    tasks: taskRows.map((row) => rowToTask(row, subtasksByTask.get(row.id) ?? [])),
    activity: activityRows.map(rowToActivity),
    settings,
    storageMode: getStorageMode(),
  };
}

export async function getSystemSettings(): Promise<SystemSettings> {
  await ensureSeeded();
  await ensureSystemParameters();

  const db = await getDb();
  const rows = await db.select().from(systemParameters).orderBy(asc(systemParameters.orderIndex), asc(systemParameters.key));
  return settingsFromRows(rows);
}

export async function updateSystemSettings(
  input: UpdateSystemSettingsInput
): Promise<SystemSettings> {
  await ensureSeeded();
  await ensureSystemParameters();

  const db = await getDb();
  const current = await getSystemSettings();
  const defaultsByKey = new Map(defaultSystemParameters.map((parameter) => [parameter.key, parameter]));
  const currentByKey = new Map(current.parameters.map((parameter) => [parameter.key, parameter]));
  const requested = new Map<string, unknown>();

  if (input.dueSoonDays !== undefined) {
    requested.set("due_soon_days", input.dueSoonDays);
  }
  if (input.activityRetentionDays !== undefined) {
    requested.set("activity_retention_days", input.activityRetentionDays);
  }
  if (Array.isArray(input.parameters)) {
    for (const item of input.parameters) {
      if (!item || typeof item !== "object") {
        continue;
      }
      const raw = item as Record<string, unknown>;
      const key = typeof raw.key === "string" ? raw.key : "";
      if (!defaultsByKey.has(key)) {
        continue;
      }
      requested.set(key, raw.value);
    }
  }

  if (requested.size === 0) {
    return current;
  }

  const now = nowIso();

  for (const [key, rawValue] of requested.entries()) {
    const parameter = defaultsByKey.get(key);
    const currentParameter = currentByKey.get(key);
    if (!parameter || !currentParameter) {
      continue;
    }

    const nextValue =
      parameter.valueType === "number"
        ? (() => {
            const fallbackNumber = Number(currentParameter.value);
            return String(
              asNumber(
                rawValue,
                Number.isFinite(fallbackNumber) ? fallbackNumber : Number(parameter.value),
                parameter.minValue ?? 0,
                parameter.maxValue ?? 100000
              )
            );
          })()
        : parameter.valueType === "boolean"
          ? String(rawValue === true || rawValue === "true")
          : optionalText(rawValue, currentParameter.value);

    await db
      .update(systemParameters)
      .set({ value: nextValue, updatedAt: now })
      .where(eq(systemParameters.key, key));

    if (nextValue !== currentParameter.value) {
      await recordActivity({
        entityType: "board",
        entityId: "settings",
        action: "settings.update",
        message: `更新系统参数「${parameter.label}」为 ${nextValue}。`,
        meta: { key, before: currentParameter.value, after: nextValue },
      });
    }
  }

  return getSystemSettings();
}

export async function createProject(input: CreateProjectInput): Promise<Project> {
  await ensureSeeded();

  const db = await getDb();
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

  const db = await getDb();
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

  const db = await getDb();
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

  const db = await getDb();
  const now = nowIso();
  const status: BoardStatus = "backlog";
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
    tester: optionalText(input.tester, ""),
    startDate: "",
    testDueDate: optionalText(input.testDueDate, ""),
    designDueDate: optionalText(input.designDueDate, ""),
    dueDate: optionalText(input.dueDate, ""),
    estimate: 1,
    progress: 0,
    blockers: 0,
    blockedReason: "",
    tags: normalizeTags(input.tags, []),
    orderIndex: await nextTaskOrderIndex(status, projectId),
    deletedAt: null,
    completedAt: null,
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

  const db = await getDb();
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
  const completedAt =
    nextStatus === "done"
      ? current.status === "done"
        ? current.completedAt
        : now
      : null;
  const patch = {
    title: asText(input.title, current.title),
    description: optionalText(input.description, current.description),
    projectId: asText(input.projectId, current.projectId),
    status: nextStatus,
    priority: nextPriority,
    owner: asText(input.owner, current.owner),
    tester: optionalText(input.tester, current.tester),
    startDate: optionalText(input.startDate, current.startDate),
    testDueDate: optionalText(input.testDueDate, current.testDueDate),
    designDueDate: optionalText(input.designDueDate, current.designDueDate),
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
    completedAt,
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
    tester: patch.tester !== current.tester,
    startDate: patch.startDate !== current.startDate,
    testDueDate: patch.testDueDate !== current.testDueDate,
    designDueDate: patch.designDueDate !== current.designDueDate,
    dueDate: patch.dueDate !== current.dueDate,
    estimate: patch.estimate !== current.estimate,
    progress: patch.progress !== current.progress,
    blockers: patch.blockers !== current.blockers,
    blockedReason: patch.blockedReason !== current.blockedReason,
    tags: JSON.stringify(tags) !== JSON.stringify(current.tags),
  })
    .filter(([, changed]) => changed)
    .map(([field]) => field);

  if (changedFields.length > 0) {
    const settings = await getSystemSettings();
    await recordActivity({
      entityType: "task",
      entityId: id,
      projectId: patch.projectId,
      taskId: id,
      action: nextStatus !== current.status ? "task.status" : "task.update",
      message:
        nextStatus !== current.status
          ? `移动任务「${patch.title}」：${statusLabel(current.status, settings)} → ${statusLabel(nextStatus, settings)}。`
          : `更新任务「${patch.title}」。`,
      meta: { changedFields, beforeStatus: current.status, afterStatus: nextStatus },
    });
  }

  const [updated] = await db.select().from(tasks).where(eq(tasks.id, id));
  const updatedSubtasks = (
    await db.select().from(subtasks).where(eq(subtasks.taskId, id))
  ).map(rowToSubtask);
  return rowToTask(updated, updatedSubtasks);
}

export async function deleteTask(id: string): Promise<{ id: string }> {
  await ensureSeeded();

  const db = await getDb();
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

  const db = await getDb();
  const ids = normalized.map((item) => item.id);
  const existingRows = await db.select().from(tasks).where(inArray(tasks.id, ids));
  const existingById = new Map(existingRows.map((row) => [row.id, row]));
  const now = nowIso();

  for (const item of normalized) {
    const existing = existingById.get(item.id);
    const existingStatus = existing ? normalizeBoardStatus(existing.status) : item.status;
    const completedAt =
      item.status === "done"
        ? existingStatus === "done"
          ? existing?.completedAt ?? now
          : now
        : null;

    await db
      .update(tasks)
      .set({ status: item.status, orderIndex: item.orderIndex, completedAt, updatedAt: now })
      .where(eq(tasks.id, item.id));
  }

  const statusChanged = normalized.filter((item) => {
    const existing = existingById.get(item.id);
    return existing && normalizeBoardStatus(existing.status) !== item.status;
  });

  const settings = statusChanged.length > 0 ? await getSystemSettings() : defaultSystemSettings;
  for (const item of statusChanged) {
    const existing = existingById.get(item.id);
    if (!existing) {
      continue;
    }
    const beforeStatus = normalizeBoardStatus(existing.status);
    await recordActivity({
      entityType: "task",
      entityId: item.id,
      projectId: existing.projectId,
      taskId: item.id,
      action: "task.move",
      message: `移动任务「${existing.title}」：${statusLabel(beforeStatus, settings)} → ${statusLabel(item.status, settings)}。`,
      meta: { beforeStatus, afterStatus: item.status },
    });
  }

  return { ok: true };
}

export async function createSubtask(
  taskId: string,
  input: CreateSubtaskInput
): Promise<Subtask> {
  await ensureSeeded();

  const db = await getDb();
  const [task] = await db.select().from(tasks).where(eq(tasks.id, taskId));
  if (!task || task.deletedAt) {
    throw new Error("Task not found");
  }

  const now = nowIso();
  const subtask = {
    id: crypto.randomUUID(),
    taskId,
    title: asText(input.title, "新拆解项"),
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
    message: `为「${task.title}」添加任务拆解「${subtask.title}」。`,
  });

  return subtask;
}

export async function updateSubtask(
  taskId: string,
  subtaskId: string,
  input: UpdateSubtaskInput
): Promise<Subtask> {
  await ensureSeeded();

  const db = await getDb();
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
        ? `${patch.done ? "完成" : "取消完成"}任务拆解「${patch.title}」。`
        : `更新任务拆解「${patch.title}」。`,
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

  const db = await getDb();
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
    message: `删除任务拆解「${existing.title}」。`,
  });

  return { id: subtaskId };
}
