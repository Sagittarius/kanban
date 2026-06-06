import { asc, desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { projects, taskActivity, tasks } from "@/db/schema";
import {
  boardColumns,
  createSeedBoard,
  isBoardStatus,
  isPriority,
  type BoardData,
  type BoardStatus,
  type BoardTask,
  type Priority,
  type Project,
  type TaskActivity,
} from "@/lib/board-data";

type TaskRow = typeof tasks.$inferSelect;
type ProjectRow = typeof projects.$inferSelect;
type ActivityRow = typeof taskActivity.$inferSelect;

export type CreateTaskInput = {
  title?: unknown;
  projectId?: unknown;
  status?: unknown;
  priority?: unknown;
  owner?: unknown;
  dueDate?: unknown;
};

export type UpdateTaskInput = Partial<{
  title: unknown;
  description: unknown;
  projectId: unknown;
  status: unknown;
  priority: unknown;
  owner: unknown;
  dueDate: unknown;
  progress: unknown;
  blockers: unknown;
  tags: unknown;
}>;

function nowIso() {
  return new Date().toISOString();
}

function asText(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function asNumber(value: unknown, fallback: number, min: number, max: number) {
  const numberValue = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numberValue)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, Math.round(numberValue)));
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
  if (!Array.isArray(value)) {
    return fallback;
  }

  return value
    .filter((tag): tag is string => typeof tag === "string")
    .map((tag) => tag.trim())
    .filter(Boolean)
    .slice(0, 5);
}

function rowToProject(row: ProjectRow): Project {
  return {
    id: row.id,
    name: row.name,
    owner: row.owner,
    color: row.color,
    health:
      row.health === "good" || row.health === "risk" ? row.health : "normal",
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function rowToTask(row: TaskRow): BoardTask {
  const status = isBoardStatus(row.status) ? row.status : "backlog";
  const priority = isPriority(row.priority) ? row.priority : "medium";

  return {
    id: row.id,
    projectId: row.projectId,
    title: row.title,
    description: row.description,
    status,
    priority,
    owner: row.owner,
    startDate: row.startDate,
    dueDate: row.dueDate,
    estimate: row.estimate,
    progress: row.progress,
    blockers: row.blockers,
    tags: parseTags(row.tags),
    orderIndex: row.orderIndex,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function rowToActivity(row: ActivityRow): TaskActivity {
  return {
    id: row.id,
    taskId: row.taskId,
    message: row.message,
    createdAt: row.createdAt,
  };
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
    seed.tasks.map((task) => ({
      ...task,
      tags: JSON.stringify(task.tags),
    }))
  );
  await db.insert(taskActivity).values(seed.activity);
}

async function nextOrderIndex(status: BoardStatus) {
  const db = getDb();
  const rows = await db
    .select({ orderIndex: tasks.orderIndex })
    .from(tasks)
    .where(eq(tasks.status, status));
  return rows.reduce((max, row) => Math.max(max, row.orderIndex), 0) + 10;
}

async function addActivity(taskId: string, message: string) {
  const db = getDb();
  await db.insert(taskActivity).values({
    id: crypto.randomUUID(),
    taskId,
    message,
    createdAt: nowIso(),
  });
}

export async function getBoard(): Promise<BoardData> {
  await ensureSeeded();

  const db = getDb();
  const [projectRows, taskRows, activityRows] = await Promise.all([
    db.select().from(projects).orderBy(asc(projects.name)),
    db
      .select()
      .from(tasks)
      .orderBy(asc(tasks.status), asc(tasks.orderIndex), desc(tasks.updatedAt)),
    db
      .select()
      .from(taskActivity)
      .orderBy(desc(taskActivity.createdAt))
      .limit(12),
  ]);

  return {
    columns: boardColumns,
    projects: projectRows.map(rowToProject),
    tasks: taskRows.map(rowToTask),
    activity: activityRows.map(rowToActivity),
  };
}

export async function createTask(input: CreateTaskInput): Promise<BoardTask> {
  await ensureSeeded();

  const db = getDb();
  const now = nowIso();
  const status = isBoardStatus(input.status) ? input.status : "backlog";
  const priority: Priority = isPriority(input.priority)
    ? input.priority
    : "medium";
  const task: BoardTask = {
    id: crypto.randomUUID(),
    projectId: asText(input.projectId, "core-platform"),
    title: asText(input.title, "未命名任务"),
    description: "",
    status,
    priority,
    owner: asText(input.owner, "未分配"),
    startDate: "",
    dueDate: asText(input.dueDate, ""),
    estimate: 1,
    progress: 0,
    blockers: 0,
    tags: [],
    orderIndex: await nextOrderIndex(status),
    createdAt: now,
    updatedAt: now,
  };

  await db.insert(tasks).values({
    ...task,
    tags: JSON.stringify(task.tags),
  });
  await addActivity(task.id, `${task.owner} 创建了任务。`);

  return task;
}

export async function updateTask(
  id: string,
  input: UpdateTaskInput
): Promise<BoardTask> {
  await ensureSeeded();

  const db = getDb();
  const existingRows = await db.select().from(tasks).where(eq(tasks.id, id));
  const existing = existingRows[0];

  if (!existing) {
    throw new Error("Task not found");
  }

  const existingTask = rowToTask(existing);
  const nextStatus = isBoardStatus(input.status)
    ? input.status
    : existingTask.status;
  const nextPriority = isPriority(input.priority)
    ? input.priority
    : existingTask.priority;
  const now = nowIso();
  const patch = {
    title: asText(input.title, existingTask.title),
    description:
      typeof input.description === "string"
        ? input.description.trim()
        : existingTask.description,
    projectId: asText(input.projectId, existingTask.projectId),
    status: nextStatus,
    priority: nextPriority,
    owner: asText(input.owner, existingTask.owner),
    dueDate:
      typeof input.dueDate === "string" ? input.dueDate : existingTask.dueDate,
    progress: asNumber(input.progress, existingTask.progress, 0, 100),
    blockers: asNumber(input.blockers, existingTask.blockers, 0, 9),
    tags: JSON.stringify(normalizeTags(input.tags, existingTask.tags)),
    orderIndex:
      nextStatus !== existingTask.status
        ? await nextOrderIndex(nextStatus)
        : existingTask.orderIndex,
    updatedAt: now,
  };

  await db.update(tasks).set(patch).where(eq(tasks.id, id));
  await addActivity(
    id,
    nextStatus !== existingTask.status
      ? `任务移动到「${
          boardColumns.find((column) => column.id === nextStatus)?.title
        }」。`
      : "任务信息已更新。"
  );

  const [updated] = await db.select().from(tasks).where(eq(tasks.id, id));
  return rowToTask(updated);
}
