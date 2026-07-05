"use client";

import {
  closestCenter,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  rectIntersection,
  type CollisionDetection,
  type DragCancelEvent,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  useDroppable,
  useSensor,
  useSensors,
  type UniqueIdentifier,
} from "@dnd-kit/core";
import {
  arrayMove,
  horizontalListSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Activity,
  Archive,
  ArchiveRestore,
  ChartNoAxesCombined,
  ChevronDown,
  ChevronUp,
  Check,
  CheckCircle2,
  Copyright,
  Download,
  Edit3,
  Eye,
  FileSpreadsheet,
  FolderPlus,
  History,
  LayoutGrid,
  PanelRightOpen,
  Plus,
  RotateCcw,
  Rows3,
  Search,
  SlidersHorizontal,
  Tag,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { read, utils, writeFileXLSX } from "xlsx";
import ConfirmDialog, { type ConfirmDialogAction } from "@/components/confirm-dialog";
import OnboardingGuide from "@/components/onboarding-guide";
import SearchMultiSelect, { type MultiSelectOption } from "@/components/search-multi-select";
import SearchableSelect, { type SearchableSelectOption } from "@/components/searchable-select";
import {
  type Dispatch,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type ReactNode,
  type SetStateAction,
} from "react";
import {
  columnsFromSettings,
  defaultSystemSettings,
  healthLabels,
  priorityLabels,
  type ActivityLog,
  type BoardData,
  type BoardStatus,
  type BoardTask,
  type BoardTeamOption,
  type BoardUserOption,
  type Priority,
  type Project,
  type ProjectHealth,
  type Subtask,
  type SystemSettings,
} from "@/lib/board-data";
import type { ChangelogEntry } from "@/lib/changelog";
import { clientFetch } from "@/lib/client-observability";
import { canManageKanbanProjects, isSuperAdminRole } from "@/lib/role-permissions";
import { getSelectSearchMatchRanges, textMatchesSelectQuery } from "@/lib/select-search";

type SyncState = "synced" | "syncing" | "local";
type DrawerMode = "task" | "project" | "activity" | "settings" | null;
type ViewMode = "board" | "list";
type ThemeId =
  | "linear"
  | "github"
  | "notion"
  | "atlassian"
  | "slack"
  | "figma"
  | "monday"
  | "microsoft"
  | "neon"
  | "deepspace";
type MetricFilter = "dueSoon" | "overdue" | "blocked" | null;
type DragTargetData =
  | { type: "task"; status: BoardStatus }
  | { type: "column"; status: BoardStatus }
  | { type: "delete-zone" };

const floatingActionButtonClass =
  "inline-flex h-11 items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--text)] px-4 text-[14px] font-semibold leading-none text-[var(--panel)] shadow-lg transition hover:opacity-90";
const sortableTransition = {
  duration: 260,
  easing: "cubic-bezier(0.22, 1, 0.36, 1)",
};
const dragOverlayDropAnimation = {
  duration: 240,
  easing: "cubic-bezier(0.22, 1, 0.36, 1)",
};
const kanbanCollisionDetection: CollisionDetection = (args) => {
  const pointerCollisions = pointerWithin(args);
  if (pointerCollisions.length > 0) {
    return pointerCollisions;
  }

  const intersecting = rectIntersection(args);
  return intersecting.length > 0 ? intersecting : closestCenter(args);
};

type NewTaskForm = {
  title: string;
  description: string;
  projectId: string;
  ownerUserId: string;
  owner: string;
  testerUserId: string;
  tester: string;
  workloadDays: string;
  priority: Priority;
  testDueDate: string;
  designDueDate: string;
  dueDate: string;
  tags: string;
};

type ProjectForm = {
  name: string;
  description: string;
  teamId: string;
  ownerUserId: string;
  owner: string;
  color: string;
  health: ProjectHealth;
  summary: string;
};

type SettingsPatch = {
  parameters: Array<{
    key: string;
    value: string;
  }>;
};

type Toast = {
  id: string;
  type: "success" | "error";
  message: string;
};

const priorityTone: Record<Priority, string> = {
  high: "border-[#c7523d] bg-[#fff2ed] text-[#8f2f20]",
  medium: "border-[#c69b38] bg-[#fff8df] text-[#7c5b13]",
  low: "border-[#5a8752] bg-[#eff8ed] text-[#35612f]",
};

const healthTone: Record<ProjectHealth, string> = {
  good: "bg-[#e8f4df] text-[#35612f]",
  normal: "bg-[#fff4d7] text-[#846117]",
  risk: "bg-[#ffe8df] text-[#9a3d24]",
};

const themePresets: Array<{ id: ThemeId; label: string }> = [
  { id: "linear", label: "Linear" },
  { id: "github", label: "GitHub" },
  { id: "notion", label: "Notion" },
  { id: "atlassian", label: "Atlassian" },
  { id: "slack", label: "Slack" },
  { id: "figma", label: "Figma" },
  { id: "monday", label: "Monday" },
  { id: "microsoft", label: "Microsoft" },
  { id: "neon", label: "Neon Grid" },
  { id: "deepspace", label: "Deep Space" },
];

const fallbackProject: Project = {
  id: "unassigned",
  teamId: "",
  ownerUserId: "",
  name: "未归属",
  description: "",
  owner: "未分配",
  color: "#6f6a5f",
  health: "normal",
  status: "active",
  summary: "",
  archivedAt: null,
  orderIndex: 0,
  createdAt: "",
  updatedAt: "",
};

function formatActivityTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("zh-CN", {
      timeZone: "Asia/Shanghai",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      hourCycle: "h23",
    })
      .formatToParts(date)
      .map((part) => [part.type, part.value])
  );
  return `${parts.month}/${parts.day} ${parts.hour}:${parts.minute}`;
}

function parseTags(value: string) {
  return value
    .split(/[,\s，、/]+/)
    .map((tag) => tag.trim())
    .filter(Boolean)
    .filter((tag, index, list) => list.indexOf(tag) === index)
    .slice(0, 8);
}

function daysUntil(date: string, todayKey: string) {
  if (!date) {
    return null;
  }

  const due = new Date(`${date}T00:00:00`);
  const today = new Date(`${todayKey}T00:00:00`);
  return Math.ceil((due.getTime() - today.getTime()) / 86400000);
}

function lateDaysByCompletion(date: string, compareIso: string | null) {
  if (!date || !compareIso) {
    return null;
  }
  const lateDays = Math.ceil(
    (new Date(compareIso).getTime() - new Date(`${date}T23:59:59`).getTime()) / 86400000
  );
  return lateDays > 0 ? -lateDays : null;
}

function negativeDayNote(days: number | null) {
  return days !== null && days < 0 ? `${days} 天` : undefined;
}

type DeadlineMarker = {
  label: string;
  date: string;
  state: "normal" | "due-soon" | "overdue" | "late";
  note?: string;
};

function deadlineMarkers(task: BoardTask, todayKey: string, dueSoonDays: number): DeadlineMarker[] {
  const markers: DeadlineMarker[] = [];
  const designDays = daysUntil(task.designDueDate, todayKey);
  const testDays = daysUntil(task.testDueDate, todayKey);
  const deliveryDays = daysUntil(task.dueDate, todayKey);
  const designLateDaysAfterCompletion = lateDaysByCompletion(task.designDueDate, task.completedAt);
  const testLateDaysAfterCompletion = lateDaysByCompletion(task.testDueDate, task.completedAt);
  const deliveryLateDaysAfterCompletion = lateDaysByCompletion(task.dueDate, task.completedAt);

  // 设计截止：设计中阶段标注临期/超期
  if (task.status === "design" && task.designDueDate) {
    markers.push({
      label: "设计",
      date: task.designDueDate,
      state:
        designDays !== null && designDays < 0
          ? "overdue"
          : designDays !== null && designDays <= dueSoonDays
            ? "due-soon"
            : "normal",
      note: designDays !== null && designDays < 0 ? negativeDayNote(designDays) : undefined,
    });
  }

  // 已完成且超设计截止
  if ((task.status === "dev" || task.status === "test" || task.status === "done") && task.designDueDate) {
    markers.push({
      label: "设计",
      date: task.designDueDate,
      state:
        task.status === "done"
          ? designLateDaysAfterCompletion !== null
            ? "late"
            : "normal"
          : designDays !== null && designDays < 0
            ? "overdue"
            : "normal",
      note:
        task.status === "done"
          ? designLateDaysAfterCompletion !== null
            ? negativeDayNote(designLateDaysAfterCompletion)
            : undefined
          : designDays !== null && designDays < 0
            ? negativeDayNote(designDays)
            : undefined,
    });
  }

  if (task.status === "dev" && task.testDueDate) {
    markers.push({
      label: "提测",
      date: task.testDueDate,
      state:
        testDays !== null && testDays < 0
          ? "overdue"
          : testDays !== null && testDays <= dueSoonDays
            ? "due-soon"
            : "normal",
      note: testDays !== null && testDays < 0 ? negativeDayNote(testDays) : undefined,
    });
  }

  if ((task.status === "test" || task.status === "done") && task.testDueDate) {
    markers.push({
      label: "提测",
      date: task.testDueDate,
      state:
        task.status === "done"
          ? testLateDaysAfterCompletion !== null
            ? "late"
            : "normal"
          : testDays !== null && testDays < 0
            ? "overdue"
            : "normal",
      note:
        task.status === "done"
          ? testLateDaysAfterCompletion !== null
            ? negativeDayNote(testLateDaysAfterCompletion)
            : undefined
          : testDays !== null && testDays < 0
            ? negativeDayNote(testDays)
            : undefined,
    });
  }

  if ((task.status === "test" || task.status === "done") && task.dueDate) {
    markers.push({
      label: "交付",
      date: task.dueDate,
      state:
        task.status === "done"
          ? deliveryLateDaysAfterCompletion !== null
            ? "late"
            : "normal"
          : deliveryDays !== null && deliveryDays < 0
            ? "overdue"
            : deliveryDays !== null && deliveryDays <= dueSoonDays
              ? "due-soon"
              : "normal",
      note:
        task.status === "done"
          ? deliveryLateDaysAfterCompletion !== null
            ? negativeDayNote(deliveryLateDaysAfterCompletion)
            : undefined
          : deliveryDays !== null && deliveryDays < 0
            ? negativeDayNote(deliveryDays)
            : undefined,
    });
  }

  if ((task.status === "backlog" || task.status === "dev") && task.dueDate) {
    markers.push({ label: "交付", date: task.dueDate, state: "normal" });
  }

  return markers;
}

function taskHasDueSoonAlert(task: BoardTask, todayKey: string, dueSoonDays: number) {
  return deadlineMarkers(task, todayKey, dueSoonDays).some((marker) => marker.state === "due-soon");
}

function taskHasOverdueAlert(task: BoardTask, todayKey: string, dueSoonDays: number) {
  return deadlineMarkers(task, todayKey, dueSoonDays).some((marker) => marker.state === "overdue" || marker.state === "late");
}

function deadlineSummary(task: BoardTask, todayKey: string, dueSoonDays: number) {
  const markers = deadlineMarkers(task, todayKey, dueSoonDays);
  return markers.length
    ? markers
        .map((marker) => `${marker.label}:${marker.date}${marker.note ? ` (${marker.note})` : ""}`)
        .join(" / ")
    : "未排期";
}

function deadlineMarkerClass(state: DeadlineMarker["state"]) {
  if (state === "due-soon") {
    return "border-[#f59e0b]/70 bg-[#fff1d6] font-semibold text-[#9a3412] dark:border-[#fb923c]/70 dark:bg-[#7c2d12]/70 dark:text-[#fed7aa]";
  }
  if (state === "overdue" || state === "late") {
    return "border-[#dc2626]/70 bg-[#fee2e2] font-semibold text-[#991b1b] dark:border-[#f87171]/80 dark:bg-[#7f1d1d]/80 dark:text-[#fecaca]";
  }
  return "border-[var(--card-border)] bg-[var(--card-section)]";
}

function taskSpreadsheet(task: BoardTask, project: Project, statusLabelText: string, todayKey: string, dueSoonDays: number) {
  return {
    project: project.name,
    title: task.title,
    description: task.description || "",
    status: statusLabelText,
    priority: priorityLabels[task.priority],
    owner: task.owner || "",
    tester: task.tester || "",
    workloadDays: task.workloadDays ?? "",
    tags: task.tags.join(" / "),
    designDueDate: task.designDueDate || "",
    testDueDate: task.testDueDate || "",
    dueDate: task.dueDate || "",
    deadlines: deadlineSummary(task, todayKey, dueSoonDays),
    progress: `${task.progress}%`,
    blockers: task.blockers > 0 ? `${task.blockers}` : "",
    updatedAt: task.updatedAt.slice(0, 10),
  };
}

const taskImportHeaderRow = [
  "项目",
  "任务",
  "描述",
  "优先级",
  "负责人",
  "测试员",
  "工作量（人日）",
  "设计截止",
  "提测日期",
  "交付日期",
  "标签",
];

type TaskImportRow = {
  project: string;
  title: string;
  description: string;
  priority: Priority;
  ownerUserId: string;
  testerUserId: string;
  workloadDays: number | null;
  designDueDate: string;
  testDueDate: string;
  dueDate: string;
  tags: string[];
};

function importField(row: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (value !== undefined && value !== null && String(value).trim()) {
      return String(value).trim();
    }
  }
  return "";
}

function parseImportedPriority(value: string): Priority {
  const normalized = value.trim().toLowerCase();
  if (normalized === "高优先级" || normalized === "高" || normalized === "high") return "high";
  if (normalized === "低优先级" || normalized === "低" || normalized === "low") return "low";
  return "medium";
}

function normalizeImportedDate(value: string) {
  const normalized = value.trim();
  if (!normalized) {
    return "";
  }
  const matched = normalized.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (!matched) {
    throw new Error(`日期格式无效：${value}`);
  }
  const [, year, month, day] = matched;
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

function parseTaskImportRow(
  row: Record<string, unknown>,
  projects: Project[],
  teams: BoardTeamOption[],
  lineNumber: number
): { errors: string[] } & TaskImportRow {
  const errors: string[] = [];
  const projectName = importField(row, ["项目", "project"]);
  const title = importField(row, ["任务", "title"]);
  const description = importField(row, ["描述", "description"]);
  const priority = parseImportedPriority(importField(row, ["优先级", "priority"]));
  const ownerValue = importField(row, ["负责人", "owner"]);
  const testerValue = importField(row, ["测试员", "tester"]);
  const workloadDays = normalizeWorkloadInput(importField(row, ["工作量（人日）", "workloadDays"]));
  let designDueDate = "";
  let testDueDate = "";
  let dueDate = "";
  try { designDueDate = normalizeImportedDate(importField(row, ["设计截止", "designDueDate"])); } catch { errors.push(`第 ${lineNumber} 行设计截止日期格式无效`); }
  try { testDueDate = normalizeImportedDate(importField(row, ["提测日期", "testDueDate"])); } catch { errors.push(`第 ${lineNumber} 行提测日期格式无效`); }
  try { dueDate = normalizeImportedDate(importField(row, ["交付日期", "dueDate"])); } catch { errors.push(`第 ${lineNumber} 行交付日期格式无效`); }
  const tags = parseTags(importField(row, ["标签", "tags"]));

  if (!projectName) errors.push(`第 ${lineNumber} 行缺少项目名称`);
  if (!title) errors.push(`第 ${lineNumber} 行缺少任务名称`);

  const project = projectName ? projects.find((item) => item.status === "active" && item.name.trim() === projectName) : null;
  if (projectName && !project) {
    errors.push(`第 ${lineNumber} 行项目不存在或已归档：${projectName}`);
  }

  const members = project ? membersForProject(projects, teams, project.id) : [];
  const ownerUserId = ownerValue
    ? members.find((member) => {
        const label = userName(member);
        return label === ownerValue || member.username === ownerValue;
      })?.id ?? ""
    : "";
  const testerUserId = testerValue
    ? members.find((member) => {
        const label = userName(member);
        return label === testerValue || member.username === testerValue;
      })?.id ?? ""
    : "";

  if (ownerValue && !ownerUserId) {
    errors.push(`第 ${lineNumber} 行负责人不在项目团队中：${ownerValue}`);
  }
  if (testerValue && !testerUserId) {
    errors.push(`第 ${lineNumber} 行测试员不在项目团队中：${testerValue}`);
  }

  return {
    errors,
    project: project?.id ?? "",
    title,
    description,
    priority,
    ownerUserId,
    testerUserId,
    workloadDays,
    designDueDate,
    testDueDate,
    dueDate,
    tags,
  };
}

function isBoardStatus(value: unknown): value is BoardStatus {
  return value === "backlog" || value === "design" || value === "dev" || value === "test" || value === "done";
}

function isDragTargetData(value: unknown): value is DragTargetData {
  if (!value || typeof value !== "object" || !("type" in value)) {
    return false;
  }

  const data = value as { type?: unknown; status?: unknown };
  if (data.type === "delete-zone") {
    return true;
  }

  return (data.type === "task" || data.type === "column") && isBoardStatus(data.status);
}

type DndDataEntry = {
  id: UniqueIdentifier;
  data?: unknown;
} | null | undefined;

function dragDataFromEntry(entry: DndDataEntry) {
  const rawData = entry?.data;
  const data = rawData && typeof rawData === "object" && "current" in rawData
    ? (rawData as { current?: unknown }).current
    : rawData;

  return isDragTargetData(data) ? data : null;
}

function targetStatusFromEntity(target: DndDataEntry) {
  const data = dragDataFromEntry(target);
  if (data) {
    if (data.type === "delete-zone") {
      return null;
    }
    return data.status;
  }

  return typeof target?.id === "string" && isBoardStatus(target.id)
    ? target.id
    : null;
}

function isDeleteDropTarget(target: DndDataEntry) {
  return target?.id === "delete-zone" || dragDataFromEntry(target)?.type === "delete-zone";
}

function measuredTaskCardWidth(status: BoardStatus) {
  if (typeof document === "undefined") {
    return status === "backlog" ? 280 : 272;
  }

  const lane = document.querySelector<HTMLElement>(`[data-board-drop-status="${status}"]`);
  const card = lane?.querySelector<HTMLElement>("[data-task-card-frame]");
  if (card) {
    return Math.round(card.getBoundingClientRect().width);
  }

  if (status === "backlog") {
    return 280;
  }

  if (!lane) {
    return 272;
  }

  const style = window.getComputedStyle(lane);
  const paddingLeft = Number.parseFloat(style.paddingLeft) || 0;
  const paddingRight = Number.parseFloat(style.paddingRight) || 0;
  return Math.max(240, Math.round(lane.clientWidth - paddingLeft - paddingRight));
}

function activeTaskIdFromEvent(event: DragStartEvent | DragOverEvent | DragEndEvent | DragCancelEvent) {
  return typeof event.active.id === "string" ? event.active.id : null;
}

function activeTaskStatusFromEvent(
  event: DragStartEvent | DragOverEvent | DragEndEvent | DragCancelEvent,
  fallbackStatus?: BoardStatus | null
) {
  if (fallbackStatus) {
    return fallbackStatus;
  }

  const data = dragDataFromEntry(event.active);
  if (data?.type === "task") {
    return data.status;
  }
  return null;
}

function overTaskIdFromEvent(event: DragOverEvent | DragEndEvent | DragCancelEvent) {
  const data = dragDataFromEntry(event.over);
  return data?.type === "task" && typeof event.over?.id === "string" ? event.over.id : null;
}

function tasksByStatus(tasks: BoardTask[]) {
  return {
    backlog: sortTasks(tasks.filter((task) => task.status === "backlog")),
    design: sortTasks(tasks.filter((task) => task.status === "design")),
    dev: sortTasks(tasks.filter((task) => task.status === "dev")),
    test: sortTasks(tasks.filter((task) => task.status === "test")),
    done: sortTasks(tasks.filter((task) => task.status === "done")),
  } satisfies Record<BoardStatus, BoardTask[]>;
}

function boardTasksFromGroups(currentTasks: BoardTask[], groups: Record<BoardStatus, BoardTask[]>) {
  const updates = new Map<string, BoardTask>();

  (Object.entries(groups) as Array<[BoardStatus, BoardTask[]]>).forEach(([status, items]) => {
    items.forEach((task, index) => {
      updates.set(task.id, {
        ...task,
        status,
        orderIndex: (index + 1) * 10,
      });
    });
  });

  return currentTasks.map((task) => updates.get(task.id) ?? task);
}

function moveTaskNearTarget(
  tasks: BoardTask[],
  activeId: string,
  targetStatus: BoardStatus,
  targetTaskId: string | null
) {
  const groups = tasksByStatus(tasks);
  const currentTask = tasks.find((task) => task.id === activeId);

  if (!currentTask) {
    return tasks;
  }

  if (currentTask.status === targetStatus && targetTaskId) {
    const group = groups[targetStatus];
    const oldIndex = group.findIndex((task) => task.id === activeId);
    const newIndex = group.findIndex((task) => task.id === targetTaskId);

    if (oldIndex >= 0 && newIndex >= 0) {
      groups[targetStatus] = arrayMove(group, oldIndex, newIndex);
      return boardTasksFromGroups(tasks, groups);
    }
  }

  (Object.keys(groups) as BoardStatus[]).forEach((status) => {
    groups[status] = groups[status].filter((task) => task.id !== activeId);
  });

  const movedTask = { ...currentTask, status: targetStatus };
  const destination = groups[targetStatus];
  const insertIndex = targetTaskId ? destination.findIndex((task) => task.id === targetTaskId) : -1;

  if (insertIndex >= 0) {
    groups[targetStatus] = [
      ...destination.slice(0, insertIndex),
      movedTask,
      ...destination.slice(insertIndex),
    ];
  } else {
    groups[targetStatus] = [...destination, movedTask];
  }

  return boardTasksFromGroups(tasks, groups);
}

function moveTaskToStatusEnd(tasks: BoardTask[], taskId: string, targetStatus: BoardStatus) {
  const groups = tasksByStatus(tasks);
  let movingTask: BoardTask | null = null;

  (Object.keys(groups) as BoardStatus[]).forEach((status) => {
    groups[status] = groups[status].filter((task) => {
      if (task.id === taskId) {
        movingTask = task;
        return false;
      }

      return true;
    });
  });

  if (!movingTask) {
    return tasks;
  }

  const taskToMove: BoardTask = movingTask;
  groups[targetStatus] = [
    ...groups[targetStatus],
    {
      ...taskToMove,
      status: targetStatus,
    },
  ];

  return boardTasksFromGroups(tasks, groups);
}

function tasksFromDragTarget(
  tasks: BoardTask[],
  event: DragOverEvent | DragEndEvent,
  targetStatus: BoardStatus,
  sourceInitialStatus?: BoardStatus | null
) {
  const sourceId = activeTaskIdFromEvent(event);
  const sourceStatus = activeTaskStatusFromEvent(event, sourceInitialStatus);

  if (!sourceId || !sourceStatus) {
    return tasks;
  }

  const targetTaskId = overTaskIdFromEvent(event);
  const isCrossRegion = targetStatus !== sourceStatus;
  const targetTaskCount = tasks.filter((task) => task.status === targetStatus && task.id !== sourceId).length;

  if (isCrossRegion && (!targetTaskId || targetTaskCount <= 1)) {
    return moveTaskToStatusEnd(tasks, sourceId, targetStatus);
  }

  return moveTaskNearTarget(tasks, sourceId, targetStatus, targetTaskId);
}

function shouldMoveTasks(
  event: DragOverEvent | DragEndEvent,
  targetStatus: BoardStatus,
  sourceInitialStatus?: BoardStatus | null,
  currentTasks?: BoardTask[]
) {
  const sourceId = activeTaskIdFromEvent(event);
  const currentStatus = sourceId && currentTasks
    ? currentTasks.find((task) => task.id === sourceId)?.status
    : null;
  const sourceStatus = currentStatus ?? activeTaskStatusFromEvent(event, sourceInitialStatus);
  if (!sourceStatus) {
    return false;
  }

  // 同一区域排序只接受卡片作为目标；拖到本列表空白处不应触发末尾/首位误让位。
  if (targetStatus === sourceStatus && dragDataFromEntry(event.over)?.type !== "task") {
    return false;
  }

  return true;
}

function projectById(projects: Project[], projectId: string) {
  return (
    projects.find((project) => project.id === projectId) ??
    projects[0] ??
    fallbackProject
  );
}

function teamForProject(teams: BoardTeamOption[], project: Project | null | undefined) {
  if (!project?.teamId) return null;
  return teams.find((team) => team.id === project.teamId) ?? null;
}

function membersForProject(projects: Project[], teams: BoardTeamOption[], projectId: string) {
  const project = projects.find((item) => item.id === projectId);
  return teamForProject(teams, project)?.members ?? [];
}

function membersForTeam(teams: BoardTeamOption[], teamId: string) {
  return teams.find((team) => team.id === teamId)?.members ?? [];
}

function projectOwnerUserIdFromOwner(teams: BoardTeamOption[], teamId: string, owner: string) {
  const normalizedOwner = owner.trim();
  return membersForTeam(teams, teamId).find((member) => userName(member) === normalizedOwner || member.username === normalizedOwner)?.id ?? "";
}

function userName(user: BoardUserOption | null | undefined) {
  return user ? user.displayName || user.username : "";
}

function isTaskRelatedToUser(task: BoardTask, userId: string) {
  return task.ownerUserId === userId || task.testerUserId === userId;
}

function summarizeActivityChanges(meta: Record<string, unknown>) {
  const changes = Array.isArray(meta.changes) ? meta.changes : [];
  return changes
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }
      const row = item as Record<string, unknown>;
      const label = typeof row.label === "string" ? row.label : "";
      const before = typeof row.before === "string" ? row.before : "";
      const after = typeof row.after === "string" ? row.after : "";
      if (!label || before === after) {
        return null;
      }
      return { label, before, after };
    })
    .filter((item): item is { label: string; before: string; after: string } => Boolean(item));
}

function sortTasks(tasks: BoardTask[]) {
  return [...tasks].sort((left, right) => {
    if (left.orderIndex !== right.orderIndex) {
      return left.orderIndex - right.orderIndex;
    }
    return right.updatedAt.localeCompare(left.updatedAt);
  });
}

function progressFromSubtasks(subtasks: Subtask[], fallback: number) {
  if (subtasks.length === 0) {
    return fallback;
  }
  const done = subtasks.filter((step) => step.done).length;
  return Math.round((done / subtasks.length) * 100);
}

function applyDoneSideEffects(task: BoardTask, updatedAt = new Date().toISOString()): BoardTask {
  if (task.status !== "done") {
    return task;
  }
  return {
    ...task,
    progress: 100,
    blockers: 0,
    blockedReason: "",
    subtasks: task.subtasks.map((step) => (
      step.done ? step : { ...step, done: true, updatedAt }
    )),
  };
}

function applyDoneSideEffectsToTasks(tasks: BoardTask[]) {
  const updatedAt = new Date().toISOString();
  return tasks.map((task) => applyDoneSideEffects(task, updatedAt));
}

function normalizeWorkloadInput(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") return null;
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return null;
  return Math.min(999, Math.max(0.5, Math.round(numeric * 2) / 2));
}

function taskUpdates(tasks: BoardTask[]) {
  return tasks.map((task) => ({
    id: task.id,
    status: task.status,
    orderIndex: task.orderIndex,
  }));
}

function settingNumber(settings: SystemSettings, key: string, fallback: number) {
  const value = Number(settings.parameters.find((parameter) => parameter.key === key)?.value);
  return Number.isFinite(value) ? value : fallback;
}

function settingText(settings: SystemSettings, key: string, fallback: string) {
  const value = settings.parameters.find((parameter) => parameter.key === key)?.value?.trim();
  return value || fallback;
}

function settingBoolean(settings: SystemSettings, key: string, fallback: boolean) {
  const value = settings.parameters.find((parameter) => parameter.key === key)?.value;
  return value === undefined ? fallback : value === "true";
}

function alphaColor(value: string, alpha: number) {
  const hex = value.trim();
  const match = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!match) {
    return value;
  }

  const raw = match[1];
  const red = Number.parseInt(raw.slice(0, 2), 16);
  const green = Number.parseInt(raw.slice(2, 4), 16);
  const blue = Number.parseInt(raw.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function sortProjects(projects: Project[]) {
  return [...projects].sort((left, right) => {
    if (left.status !== right.status) {
      return left.status === "active" ? -1 : 1;
    }
    if (left.orderIndex !== right.orderIndex) {
      return left.orderIndex - right.orderIndex;
    }
    return left.name.localeCompare(right.name, "zh-CN", { numeric: true, sensitivity: "base" });
  });
}

function isThemeId(value: unknown): value is ThemeId {
  return (
    value === "linear" ||
    value === "github" ||
    value === "notion" ||
    value === "atlassian" ||
    value === "slack" ||
    value === "figma" ||
    value === "monday" ||
    value === "microsoft" ||
    value === "neon" ||
    value === "deepspace"
  );
}

function sameTaskOrder(left: BoardTask[], right: BoardTask[]) {
  if (left.length !== right.length) {
    return false;
  }

  const rightById = new Map(right.map((task) => [task.id, task]));
  return left.every((task) => {
    const nextTask = rightById.get(task.id);
    return nextTask && nextTask.status === task.status && nextTask.orderIndex === task.orderIndex;
  });
}


async function apiRequest<T>(url: string, method: string, body?: unknown) {
  const response = await clientFetch(url, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  }, {
    operation: `kanban.${method.toLowerCase()}`,
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    const requestId = response.headers.get("x-request-id");
    throw new Error(payload.error ?? (requestId ? `Request failed (${requestId})` : "Request failed"));
  }

  return (await response.json()) as T;
}

const dashboardRefreshEventKey = "kanban:dashboard-refresh";

function notifyDashboardRefresh() {
  if (typeof window === "undefined") {
    return;
  }

  const payload = String(Date.now());
  window.dispatchEvent(new CustomEvent(dashboardRefreshEventKey, { detail: payload }));

  try {
    window.localStorage.setItem(dashboardRefreshEventKey, payload);
    window.localStorage.removeItem(dashboardRefreshEventKey);
  } catch {
    // noop
  }

  if (typeof BroadcastChannel !== "undefined") {
    const channel = new BroadcastChannel(dashboardRefreshEventKey);
    channel.postMessage(payload);
    channel.close();
  }
}

function installPointerCaptureGuard() {
  if (typeof Element === "undefined") {
    return () => {};
  }

  // Older Chromium builds can throw when dnd-kit releases a pointer that has
  // already been dropped by the browser. Keep the guard narrow so unrelated
  // pointer-capture errors still surface.
  const prototype = Element.prototype;
  const originalSetPointerCapture = prototype.setPointerCapture;
  const originalReleasePointerCapture = prototype.releasePointerCapture;

  if (typeof originalSetPointerCapture !== "function") {
    return () => {};
  }

  prototype.setPointerCapture = function guardedSetPointerCapture(pointerId: number) {
    try {
      originalSetPointerCapture.call(this, pointerId);
    } catch (error) {
      if (!isIgnorablePointerCaptureError(error)) {
        throw error;
      }
    }
  };

  if (typeof originalReleasePointerCapture === "function") {
    prototype.releasePointerCapture = function guardedReleasePointerCapture(pointerId: number) {
      try {
        originalReleasePointerCapture.call(this, pointerId);
      } catch (error) {
        if (!isIgnorablePointerCaptureError(error)) {
          throw error;
        }
      }
    };
  }

  return () => {
    prototype.setPointerCapture = originalSetPointerCapture;
    prototype.releasePointerCapture = originalReleasePointerCapture;
  };
}

function isIgnorablePointerCaptureError(error: unknown) {
  const record = error as { name?: unknown; message?: unknown } | null;
  const name = typeof record?.name === "string" ? record.name : "";
  const message = typeof record?.message === "string" ? record.message : "";
  return (
    name === "InvalidPointerId" ||
    name === "InvalidStateError" ||
    name === "NotFoundError" ||
    message.includes("No active pointer") ||
    message.includes("Invalid pointer id")
  );
}

export default function KanbanApp({
  initialBoard,
  todayKey,
  appVersion,
  changelogEntries,
  initialThemeId = "notion",
}: {
  initialBoard: BoardData;
  todayKey: string;
  appVersion: string;
  changelogEntries: ChangelogEntry[];
  initialThemeId?: string;
}) {
  const [board, setBoard] = useState(initialBoard);
  const [, setSyncState] = useState<SyncState>("syncing");
  const [search, setSearch] = useState("");
  const [projectFilter, setProjectFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState<Priority | "all">("all");
  const [tagFilters, setTagFilters] = useState<string[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>("board");
  const [listStatusFilters, setListStatusFilters] = useState<BoardStatus[]>([]);
  const [metricFilter, setMetricFilter] = useState<MetricFilter>(null);
  const [backlogCollapsed, setBacklogCollapsed] = useState(false);
  const [themeId, setThemeId] = useState<ThemeId>(isThemeId(initialThemeId) ? initialThemeId : "notion");
  const [drawerMode, setDrawerMode] = useState<DrawerMode>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
    initialBoard.projects[0]?.id ?? null
  );
  const [crossDragTarget, setCrossDragTarget] = useState<BoardStatus | null>(null);
  const [dragOverlayWidth, setDragOverlayWidth] = useState<number | null>(null);
  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogAction | null>(null);
  const [importingTasks, setImportingTasks] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [taskCreateOpen, setTaskCreateOpen] = useState(false);
  const [changelogOpen, setChangelogOpen] = useState(false);
  const localIdCounter = useRef(0);
  const metricRef = useRef<HTMLDivElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const dragStartTasksRef = useRef<BoardTask[] | null>(null);
  const dragStartStatusRef = useRef<BoardStatus | null>(null);
  const latestTasksRef = useRef<BoardTask[]>(board.tasks);
  const dragSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );
  const [newTask, setNewTask] = useState<NewTaskForm>({
    title: "",
    description: "",
    projectId: initialBoard.projects.find((project) => project.status === "active")?.id ?? "",
    ownerUserId: "",
    owner: "",
    testerUserId: "",
    tester: "",
    workloadDays: "",
    priority: "medium",
    testDueDate: "",
    designDueDate: "",
    dueDate: "",
    tags: "",
  });
  const [projectDraft, setProjectDraft] = useState<ProjectForm>({
    name: "",
    description: "",
    teamId: "",
    ownerUserId: "",
    owner: "",
    color: "#1f6f68",
    health: "normal",
    summary: "",
  });

  useEffect(() => installPointerCaptureGuard(), []);

  async function refreshBoard(markSynced = true) {
    try {
      const data = await apiRequest<BoardData>("/api/board", "GET");
      setBoard(data);
      if (markSynced) {
        setSyncState(data.storageMode === "local" ? "local" : "synced");
      }
    } catch {
      setSyncState("local");
    }
  }

  useEffect(() => {
    let active = true;

    clientFetch("/api/board", undefined, { operation: "kanban.initial-board" })
      .then((response) => {
        if (!response.ok) {
          throw new Error("Board API unavailable");
        }
        return response.json() as Promise<BoardData>;
      })
      .then((data) => {
        if (!active) {
          return;
        }
        setBoard(data);
        setSyncState(data.storageMode === "local" ? "local" : "synced");
      })
      .catch(() => {
        if (active) {
          setSyncState("local");
        }
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    latestTasksRef.current = board.tasks;
  }, [board.tasks]);

  const boardTeams = useMemo(() => board.teams ?? [], [board.teams]);
  const currentUser = board.currentUser ?? initialBoard.currentUser ?? null;
  const currentUserRole = currentUser?.role ?? "super_admin";
  const canManageProjects = canManageKanbanProjects(currentUserRole);
  const canManageSettings = isSuperAdminRole(currentUserRole);
  const sortedProjects = useMemo(() => sortProjects(board.projects), [board.projects]);
  const activeProjects = useMemo(
    () => sortedProjects.filter((project) => project.status === "active"),
    [sortedProjects]
  );
  const isLocalPreview = board.storageMode === "local";
  const settings = board.settings ?? defaultSystemSettings;
  const dueSoonDays = settings.dueSoonDays;
  const taskCardStripeEnabled = settingBoolean(settings, "task_card_stripe_enabled", true);
  const archivedProjects = useMemo(
    () => sortedProjects.filter((project) => project.status === "archived"),
    [sortedProjects]
  );
  const boardTitle = board.boardName?.trim() || settingText(settings, "board_title", "默认看板");
  const selectedTask = selectedTaskId
    ? board.tasks.find((task) => task.id === selectedTaskId) ?? null
    : null;
  const draggingTask = draggingTaskId
    ? board.tasks.find((task) => task.id === draggingTaskId) ?? null
    : null;
  const draggingTaskProject = draggingTask
    ? projectById(board.projects, draggingTask.projectId)
    : fallbackProject;
  const selectedTaskEditable = selectedTask ? canEditTask(selectedTask) : false;
  const selectedProject = selectedProjectId
    ? board.projects.find((project) => project.id === selectedProjectId) ?? null
    : null;
  function canEditTask(task: BoardTask) {
    if (canManageProjects) {
      return true;
    }
    return currentUser ? isTaskRelatedToUser(task, currentUser.id) : false;
  }
  const allTags = useMemo(
    () => {
      const activeIds = new Set(activeProjects.map((p) => p.id));
      return Array.from(
        new Set(
          board.tasks
            .filter((t) => activeIds.has(t.projectId))
            .flatMap((task) => task.tags)
        )
      ).sort((a, b) => (a > b ? 1 : a < b ? -1 : 0));
    },
    [board.tasks, activeProjects]
  );

  const filteredTasks = useMemo(() => {
    const query = search.trim();
    const activeProjectIds = new Set(activeProjects.map((project) => project.id));

    return board.tasks.filter((task) => {
      const project = projectById(board.projects, task.projectId);
      const matchesProject =
        projectFilter === "all" || task.projectId === projectFilter;
      const matchesPriority =
        priorityFilter === "all" || task.priority === priorityFilter;
      const matchesTag = tagFilters.length === 0 || tagFilters.some((tag) => task.tags.includes(tag));
      const matchesSearch =
        !query ||
        [
          task.title,
          task.description,
          task.owner,
          task.tester,
          ...task.tags,
        ].some((part) => textMatchesSelectQuery(part, query));
      const matchesMetric =
        metricFilter === null ||
        (metricFilter === "blocked"
          ? task.blockers > 0
          : metricFilter === "overdue"
            ? task.status !== "done" && taskHasOverdueAlert(task, todayKey, dueSoonDays)
            : task.status !== "done" && taskHasDueSoonAlert(task, todayKey, dueSoonDays));

      return (
        activeProjectIds.has(project.id) &&
        matchesProject &&
        matchesPriority &&
        matchesTag &&
        matchesSearch &&
        matchesMetric
      );
    });
  }, [
    activeProjects,
    board.projects,
    board.tasks,
    dueSoonDays,
    metricFilter,
    priorityFilter,
    projectFilter,
    search,
    tagFilters,
    todayKey,
  ]);

  const metrics = useMemo(() => {
    const activeProjectIds = new Set(activeProjects.map((project) => project.id));
    const activeTasks = board.tasks.filter((task) => activeProjectIds.has(task.projectId));
    const blocked = activeTasks.filter((task) => task.blockers > 0);
    const dueSoon = activeTasks.filter((task) => task.status !== "done" && taskHasDueSoonAlert(task, todayKey, dueSoonDays));
    const overdue = activeTasks.filter((task) => task.status !== "done" && taskHasOverdueAlert(task, todayKey, dueSoonDays));
    const completed = activeTasks.filter((task) => task.status === "done");

    return {
      projects: activeProjects.length,
      active: activeTasks.filter((task) => task.status !== "done").length,
      dueSoon: dueSoon.length,
      overdue: overdue.length,
      blocked: blocked.length,
      completion: activeTasks.length
        ? Math.round((completed.length / activeTasks.length) * 100)
        : 0,
    };
  }, [activeProjects, board.tasks, dueSoonDays, todayKey]);

  function openTask(taskId: string) {
    setSelectedTaskId(taskId);
    setDrawerMode("task");
  }

  function changeTheme(nextTheme: ThemeId) {
    setThemeId(nextTheme);
    window.localStorage.setItem("kanban-theme", nextTheme);
    document.cookie = `kanban_theme=${nextTheme}; path=/; max-age=31536000; samesite=lax`;
    window.dispatchEvent(new CustomEvent("kanban:theme-change", { detail: { themeId: nextTheme } }));
  }

  function changeViewMode(nextMode: ViewMode) {
    setViewMode(nextMode);
  }

  async function persistSettings(patch: SettingsPatch) {
    const currentSettings = board.settings ?? defaultSystemSettings;
    const values = new Map(patch.parameters.map((parameter) => [parameter.key, parameter.value]));
    const nextParameters = currentSettings.parameters.map((parameter) =>
      values.has(parameter.key)
        ? {
            ...parameter,
            value: values.get(parameter.key) ?? parameter.value,
            updatedAt: new Date().toISOString(),
          }
        : parameter
    );
    const nextSettings: SystemSettings = {
      ...currentSettings,
      parameters: nextParameters,
      dueSoonDays: settingNumber({ ...currentSettings, parameters: nextParameters }, "due_soon_days", currentSettings.dueSoonDays),
      activityRetentionDays: settingNumber(
        { ...currentSettings, parameters: nextParameters },
        "activity_retention_days",
        currentSettings.activityRetentionDays
      ),
    };

    setBoard((current) => ({ ...current, columns: columnsFromSettings(nextSettings), settings: nextSettings }));
    setSyncState("syncing");

    if (isLocalPreview) {
      setSyncState("local");
      notify("参数已保存");
      return true;
    }

    try {
      const saved = await apiRequest<SystemSettings>("/api/settings", "PATCH", patch);
      setBoard((current) => ({ ...current, columns: columnsFromSettings(saved), settings: saved }));
      await refreshBoard();
      notify("参数已保存");
      return true;
    } catch {
      setSyncState("local");
      notify("参数保存失败", "error");
      return false;
    }
  }

  function openProject(project: Project | null) {
    setSelectedProjectId(project?.id ?? null);
    setProjectDraft({
      name: project?.name ?? "",
      description: project?.description ?? "",
      ownerUserId: project ? project.ownerUserId || projectOwnerUserIdFromOwner(boardTeams, project.teamId, project.owner) : "",
      owner: project?.owner ?? "",
      teamId: project?.teamId ?? "",
      color: project?.color ?? "#1f6f68",
      health: project?.health ?? "normal",
      summary: project?.summary ?? "",
    });
    setDrawerMode("project");
  }

  function appendLocalActivity(message: string, entityType: ActivityLog["entityType"] = "task") {
    const activity: ActivityLog = {
      id: nextLocalId("local-activity"),
      entityType,
      entityId: "local",
      projectId: null,
      taskId: null,
      action: "local.preview",
      message,
      meta: {},
      createdAt: new Date().toISOString(),
    };
    setBoard((current) => ({ ...current, activity: [activity, ...current.activity] }));
  }

  function nextLocalId(prefix: string) {
    localIdCounter.current += 1;
    return `${prefix}-${localIdCounter.current}`;
  }

  function notify(message: string, type: Toast["type"] = "success") {
    const id = nextLocalId("toast");
    setToasts((current) => [...current, { id, message, type }]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, 2800);
  }

  function showNotice(message: string, title = "提示") {
    setConfirmDialog({
      title,
      message,
      actionLabel: "知道了",
      showCancel: false,
      onConfirm: () => setConfirmDialog(null),
    });
  }

  async function persistProject(projectId: string, patch: Partial<Project>, successMessage = "项目已保存") {
    const previous = board.projects.find((project) => project.id === projectId);
    setBoard((current) => ({
      ...current,
      projects: current.projects.map((project) =>
        project.id === projectId
          ? { ...project, ...patch, updatedAt: new Date().toISOString() }
          : project
      ),
    }));
    setSyncState("syncing");

    if (isLocalPreview) {
      appendLocalActivity(
        `更新项目「${patch.name ?? previous?.name ?? "未命名项目"}」。`,
        "project"
      );
      setSyncState("local");
      notify(successMessage);
      return true;
    }

    try {
      const saved = await apiRequest<Project>(`/api/projects/${projectId}`, "PATCH", patch);
      setBoard((current) => ({
        ...current,
        projects: current.projects.map((project) =>
          project.id === projectId ? saved : project
        ),
      }));
      await refreshBoard();
      notify(successMessage);
      return true;
    } catch {
      appendLocalActivity(
        `更新项目「${patch.name ?? previous?.name ?? "未命名项目"}」。`,
        "project"
      );
      setSyncState("local");
      notify("项目操作失败", "error");
      return false;
    }
  }

  async function saveProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!projectDraft.name.trim()) {
      return;
    }
    if (!projectDraft.teamId) {
      notify("请选择团队", "error");
      return;
    }
    if (!projectDraft.ownerUserId) {
      notify("请选择负责人", "error");
      return;
    }

    if (selectedProject) {
      await persistProject(selectedProject.id, projectDraft, "项目已保存");
      return;
    }

    const optimistic: Project = {
      id: nextLocalId("local-project"),
      teamId: projectDraft.teamId,
      ownerUserId: projectDraft.ownerUserId,
      name: projectDraft.name.trim(),
      description: projectDraft.description.trim(),
      owner: projectDraft.owner.trim(),
      color: projectDraft.color,
      health: projectDraft.health,
      status: "active",
      summary: "",
      archivedAt: null,
      orderIndex: board.projects.length * 10 + 10,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    setBoard((current) => ({ ...current, projects: [...current.projects, optimistic] }));
    setSelectedProjectId(optimistic.id);
    setProjectFilter(optimistic.id);
    setNewTask((current) => ({ ...current, projectId: current.projectId || optimistic.id }));
    setSyncState("syncing");

    if (isLocalPreview) {
      appendLocalActivity(`创建项目「${optimistic.name}」。`, "project");
      setSyncState("local");
      notify("项目已创建");
      return;
    }

    try {
      const saved = await apiRequest<Project>("/api/projects", "POST", projectDraft);
      setBoard((current) => ({
        ...current,
        projects: current.projects.map((project) =>
          project.id === optimistic.id ? saved : project
        ),
      }));
      setSelectedProjectId(saved.id);
      setProjectFilter(saved.id);
      setNewTask((current) => ({ ...current, projectId: current.projectId || saved.id }));
      await refreshBoard();
      notify("项目已创建");
    } catch {
      appendLocalActivity(`创建项目「${optimistic.name}」。`, "project");
      setSyncState("local");
      notify("项目创建失败", "error");
    }
  }

  function removeProject(projectId: string) {
    const project = board.projects.find((item) => item.id === projectId);
    if (!project) {
      return;
    }
    setConfirmDialog({
      title: "删除项目",
      message: `确认删除项目「${project.name}」及其任务？此操作会同时移除项目下的任务。`,
      tone: "danger",
      actionLabel: "删除",
      onConfirm: () => void executeRemoveProject(projectId),
    });
  }

  async function executeRemoveProject(projectId: string) {
    const project = board.projects.find((item) => item.id === projectId);
    if (!project) return;
    setConfirmDialog(null);

    setBoard((current) => ({
      ...current,
      projects: current.projects.filter((item) => item.id !== projectId),
      tasks: current.tasks.filter((task) => task.projectId !== projectId),
    }));
    setProjectFilter("all");
    setDrawerMode(null);
    setSyncState("syncing");

    if (isLocalPreview) {
      appendLocalActivity(`删除项目「${project.name}」。`, "project");
      setSyncState("local");
      notify("项目已删除");
      return;
    }

    try {
      await apiRequest(`/api/projects/${projectId}`, "DELETE");
      await refreshBoard();
      notify("项目已删除");
    } catch {
      appendLocalActivity(`删除项目「${project.name}」。`, "project");
      setSyncState("local");
      notify("项目删除失败", "error");
    }
  }

  async function saveTaskDetail(
    taskId: string,
    patch: Partial<BoardTask>,
    nextSubtasks: SubtaskDraft[]
  ) {
    const previous = board.tasks.find((task) => task.id === taskId);
    const previousTasks = board.tasks;
    if (!previous) {
      return false;
    }

    const updatedAt = new Date().toISOString();
    const normalizedSubtasks = nextSubtasks
      .map((step, index) => ({
        ...step,
        title: step.title.trim(),
        orderIndex: (index + 1) * 10,
        updatedAt,
      }))
      .filter((step) => step.title);
    const progress = progressFromSubtasks(normalizedSubtasks, patch.progress ?? previous.progress);

    setBoard((current) => ({
      ...current,
      tasks: current.tasks.map((task) =>
        task.id === taskId
          ? applyDoneSideEffects({
              ...task,
              ...patch,
              subtasks: normalizedSubtasks,
              progress,
              updatedAt,
            }, updatedAt)
          : task
      ),
    }));
    setSyncState("syncing");

    if (isLocalPreview) {
      appendLocalActivity(
        `更新任务「${patch.title ?? previous?.title ?? "未命名任务"}」。`
      );
      setSyncState("local");
      notify("任务已保存");
      return true;
    }

    try {
      const saved = await apiRequest<BoardTask>(`/api/tasks/${taskId}/detail`, "PATCH", {
        task: patch,
        subtasks: normalizedSubtasks.map((step) => ({
          id: step.id,
          title: step.title,
          done: step.done,
        })),
      });
      setBoard((current) => ({
        ...current,
        tasks: current.tasks.map((task) => (task.id === taskId ? saved : task)),
      }));
      await refreshBoard(false);
      notifyDashboardRefresh();
      notify("任务已保存");
      return true;
    } catch (error) {
      setBoard((current) => ({ ...current, tasks: previousTasks }));
      setSyncState("local");
      notify(error instanceof Error ? error.message : "任务保存失败", "error");
      return false;
    }
  }

  async function createTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const projectId = newTask.projectId || activeProjects[0]?.id || sortedProjects[0]?.id || "";
    const projectMembers = membersForProject(board.projects, boardTeams, projectId);
    const owner = projectMembers.find((member) => member.id === newTask.ownerUserId);
    const tester = projectMembers.find((member) => member.id === newTask.testerUserId);
    if (!newTask.title.trim()) {
      showNotice("请输入任务名称。", "无法添加任务");
      return;
    }
    if (!newTask.description.trim()) {
      showNotice("请输入任务描述。", "无法添加任务");
      return;
    }
    if (!projectId) {
      showNotice("当前没有可用项目，请先创建项目。", "无法添加任务");
      return;
    }
    const optimistic: BoardTask = {
      id: nextLocalId("local-task"),
      projectId,
      title: newTask.title.trim(),
      description: newTask.description.trim(),
      status: "backlog",
      priority: newTask.priority,
      ownerUserId: newTask.ownerUserId,
      owner: userName(owner),
      testerUserId: newTask.testerUserId,
      tester: userName(tester),
      workloadDays: normalizeWorkloadInput(newTask.workloadDays),
      startDate: "",
      testDueDate: newTask.testDueDate,
      designDueDate: newTask.designDueDate,
      dueDate: newTask.dueDate,
      estimate: 1,
      progress: 0,
      blockers: 0,
      blockedReason: "",
      tags: parseTags(newTask.tags),
      subtasks: [],
      orderIndex:
        Math.max(0, ...board.tasks.filter((task) => task.status === "backlog").map((task) => task.orderIndex)) + 10,
      deletedAt: null,
      completedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    setBoard((current) => ({ ...current, tasks: [...current.tasks, optimistic] }));
    setNewTask((current) => ({
      ...current,
      title: "",
      description: "",
      owner: "",
      ownerUserId: "",
      tester: "",
      testerUserId: "",
      workloadDays: "",
      testDueDate: "",
      designDueDate: "",
      dueDate: "",
      tags: "",
    }));
    setTaskCreateOpen(false);
    openTask(optimistic.id);
    setSyncState("syncing");

    if (isLocalPreview) {
      appendLocalActivity(`创建任务「${optimistic.title}」。`);
      setSyncState("local");
      notify("任务已创建");
      return;
    }

    try {
      const saved = await apiRequest<BoardTask>("/api/tasks", "POST", {
        title: newTask.title,
        description: newTask.description,
        projectId,
        ownerUserId: newTask.ownerUserId,
        testerUserId: newTask.testerUserId,
        workloadDays: normalizeWorkloadInput(newTask.workloadDays),
        priority: newTask.priority,
        testDueDate: newTask.testDueDate,
        designDueDate: newTask.designDueDate,
        dueDate: newTask.dueDate,
        tags: parseTags(newTask.tags),
      });
      setBoard((current) => ({
        ...current,
        tasks: current.tasks.map((task) =>
          task.id === optimistic.id ? saved : task
        ),
      }));
      openTask(saved.id);
      await refreshBoard();
      notifyDashboardRefresh();
      notify("任务已创建");
    } catch {
      appendLocalActivity(`创建任务「${optimistic.title}」。`);
      setSyncState("local");
      notify("任务创建失败", "error");
    }
  }

  async function removeTask(taskId: string) {
    const task = board.tasks.find((item) => item.id === taskId);
    if (!task) {
      return;
    }

    setBoard((current) => ({
      ...current,
      tasks: current.tasks.filter((item) => item.id !== taskId),
    }));
    if (selectedTaskId === taskId) {
      setDrawerMode(null);
      setSelectedTaskId(null);
    }
    setSyncState("syncing");

    if (isLocalPreview) {
      appendLocalActivity(`删除任务「${task.title}」。`);
      setSyncState("local");
      notify("任务已删除");
      return;
    }

    try {
      await apiRequest(`/api/tasks/${taskId}`, "DELETE");
      await refreshBoard();
      notifyDashboardRefresh();
      notify("任务已删除");
    } catch {
      appendLocalActivity(`删除任务「${task.title}」。`);
      setSyncState("local");
      notify("任务删除失败", "error");
    }
  }

  async function reworkTask(taskId: string) {
    setSyncState("syncing");

    if (isLocalPreview) {
      notify("本地预览模式不支持发起返工", "error");
      setSyncState("local");
      return;
    }

    try {
      const created = await apiRequest<BoardTask>(`/api/tasks/${taskId}/rework`, "POST");
      await refreshBoard(false);
      notifyDashboardRefresh();
      openTask(created.id);
      notify("已发起返工");
    } catch {
      setSyncState("local");
      notify("发起返工失败", "error");
    }
  }

  function handleDragStart(event: DragStartEvent) {
    const sourceId = activeTaskIdFromEvent(event);
    const sourceStatus = activeTaskStatusFromEvent(event);
    if (!sourceId || !sourceStatus) {
      return;
    }

    dragStartTasksRef.current = board.tasks;
    dragStartStatusRef.current = sourceStatus;
    latestTasksRef.current = board.tasks;
    setDraggingTaskId(sourceId);
    setCrossDragTarget(sourceStatus);
    setDragOverlayWidth(measuredTaskCardWidth(sourceStatus));
  }

  function handleDragOver(event: DragOverEvent) {
    if (!activeTaskIdFromEvent(event)) {
      return;
    }

    const targetStatus = targetStatusFromEntity(event.over);
    if (!targetStatus) {
      return;
    }

    const sourceStatus = dragStartStatusRef.current ?? activeTaskStatusFromEvent(event);
    if (!sourceStatus) {
      setCrossDragTarget(null);
      return;
    }

    setCrossDragTarget(targetStatus);
    setDragOverlayWidth(measuredTaskCardWidth(targetStatus));

    if (!shouldMoveTasks(event, targetStatus, sourceStatus, latestTasksRef.current)) {
      return;
    }

    setBoard((current) => {
      const finalTasks = tasksFromDragTarget(current.tasks, event, targetStatus, sourceStatus);
      if (sameTaskOrder(current.tasks, finalTasks)) {
        return current;
      }

      latestTasksRef.current = finalTasks;
      return { ...current, tasks: finalTasks };
    });
  }

  async function handleDragEnd(event: DragEndEvent) {
    setCrossDragTarget(null);
    setDragOverlayWidth(null);
    setDraggingTaskId(null);
    const targetStatus = targetStatusFromEntity(event.over);
    const deleteDrop = isDeleteDropTarget(event.over);
    const sourceId = activeTaskIdFromEvent(event);
    const sourceStatus = dragStartStatusRef.current ?? activeTaskStatusFromEvent(event);

    if (!sourceId || !sourceStatus) {
      dragStartTasksRef.current = null;
      dragStartStatusRef.current = null;
      return;
    }

    const startTasks = dragStartTasksRef.current;

    const liveTasks = latestTasksRef.current;
    if (!startTasks) {
      dragStartTasksRef.current = null;
      dragStartStatusRef.current = null;
      return;
    }

    if (deleteDrop) {
      latestTasksRef.current = startTasks;
      setBoard((current) => ({ ...current, tasks: startTasks }));
      dragStartTasksRef.current = null;
      dragStartStatusRef.current = null;
      await removeTask(sourceId);
      return;
    }

    const finalTasks = applyDoneSideEffectsToTasks(sameTaskOrder(startTasks, liveTasks)
      ? targetStatus && shouldMoveTasks(event, targetStatus, sourceStatus, liveTasks)
        ? tasksFromDragTarget(liveTasks, event, targetStatus, sourceStatus)
        : liveTasks
      : liveTasks);

    if (sameTaskOrder(startTasks, finalTasks)) {
      dragStartTasksRef.current = null;
      dragStartStatusRef.current = null;
      return;
    }

    latestTasksRef.current = finalTasks;
    setBoard((current) =>
      sameTaskOrder(current.tasks, finalTasks) ? current : { ...current, tasks: finalTasks }
    );
    void persistCurrentOrder(finalTasks, startTasks);
    dragStartTasksRef.current = null;
    dragStartStatusRef.current = null;
  }

  function handleDragCancel() {
    setCrossDragTarget(null);
    setDragOverlayWidth(null);
    setDraggingTaskId(null);
    const startTasks = dragStartTasksRef.current;
    if (startTasks) {
      latestTasksRef.current = startTasks;
      setBoard((current) => ({ ...current, tasks: startTasks }));
    }
    dragStartTasksRef.current = null;
    dragStartStatusRef.current = null;
  }

  async function persistCurrentOrder(tasksToPersist = board.tasks, rollbackTasks?: BoardTask[]) {
    setSyncState("syncing");
    if (isLocalPreview) {
      setSyncState("local");
      return;
    }

    try {
      await apiRequest("/api/tasks/reorder", "POST", {
        updates: taskUpdates(tasksToPersist),
      });
      await refreshBoard(false);
    } catch {
      if (rollbackTasks) {
        latestTasksRef.current = rollbackTasks;
        setBoard((current) => ({ ...current, tasks: rollbackTasks }));
      }
      setSyncState("local");
      notify("拖拽保存失败", "error");
    }
  }

  const activeProjectChoices = activeProjects.length ? activeProjects : sortedProjects;
  const listTasks = board.columns.flatMap((column) =>
    sortTasks(filteredTasks.filter((task) => task.status === column.id)).map((task) => ({
      task,
      project: projectById(board.projects, task.projectId),
      statusLabel: column.title,
    }))
  );
  const newTaskProjectId = newTask.projectId || activeProjects[0]?.id || sortedProjects[0]?.id || "";
  const newTaskMembers = membersForProject(board.projects, boardTeams, newTaskProjectId);
  const themeOptions = themePresets.map((theme) => ({ value: theme.id, label: theme.label }));
  const activeProjectOptions = activeProjects.map((project) => ({
    value: project.id,
    label: project.name,
    meta: project.owner,
  }));
  const newTaskMemberOptions = newTaskMembers.map((member) => ({
    value: member.id,
    label: userName(member),
    meta: `@${member.username}`,
  }));
  const priorityOptions: SearchableSelectOption[] = [
    { value: "high", label: "高优先级" },
    { value: "medium", label: "中优先级" },
    { value: "low", label: "低优先级" },
  ];
  const listStatusOptions: MultiSelectOption[] = board.columns.map((column) => ({
    value: column.id,
    label: column.title,
    colorDotClass: column.tone,
  }));
  const visibleListTasks =
    listStatusFilters.length > 0
      ? listTasks.filter(({ task }) => listStatusFilters.includes(task.status))
      : listTasks;
  const sidebarStageCounts = board.columns.map((column) => ({
    id: column.id,
    title: column.title,
    tone: column.tone,
    count: filteredTasks.filter((task) => task.status === column.id).length,
  }));
  const sidebarOverviewItems = [
    { id: "all", title: "总计", tone: "bg-[var(--accent)]", count: filteredTasks.length },
    ...sidebarStageCounts,
  ];

  function exportTaskTable() {
    const rows = listTasks.map(({ task, project, statusLabel }) =>
      taskSpreadsheet(task, project, statusLabel, todayKey, dueSoonDays)
    );
    const worksheet = utils.json_to_sheet(rows, {
      header: [
        "project",
        "title",
        "description",
        "status",
        "priority",
        "owner",
        "tester",
        "workloadDays",
        "tags",
        "designDueDate",
        "testDueDate",
        "dueDate",
        "deadlines",
        "progress",
        "blockers",
        "updatedAt",
      ],
    });
    utils.sheet_add_aoa(
      worksheet,
      [[
        "项目",
        "任务",
        "描述",
        "状态",
        "优先级",
        "负责人",
        "测试员",
        "工作量（人日）",
        "标签",
        "设计截止",
        "提测日期",
        "交付日期",
        "截止摘要",
        "进度",
        "阻塞",
        "更新时间",
      ]],
      { origin: "A1" }
    );
    const workbook = utils.book_new();
    utils.book_append_sheet(workbook, worksheet, (boardTitle.slice(0, 25) || "任务列表").replace(/[\\/?*[\]:]/g, ""));
    writeFileXLSX(
      workbook,
      `${boardTitle.replace(/[\\\\/:*?\"<>|]/g, "-") || "任务列表"}-${new Date().toISOString().slice(0, 10)}.xlsx`
    );
  }

  function downloadTaskImportTemplate() {
    const worksheet = utils.aoa_to_sheet([
      taskImportHeaderRow,
      ["演示项目", "示例任务", "示例描述", "中优先级", "张三", "李四", "1", "2026-07-10", "2026-07-14", "2026-07-18", "业务需求/接口联调"],
    ]);
    const notes = utils.aoa_to_sheet([
      ["说明"],
      ["1. 每一行都会作为新增任务导入，默认进入需求池。"],
      ["2. 项目名称必须与当前看板中的活跃项目完全一致。"],
      ["3. 负责人、测试员需填写项目团队中的姓名或用户名，可留空。"],
      ["4. 日期格式统一为 YYYY-MM-DD；标签可用空格、逗号或斜杠分隔。"],
    ]);
    const workbook = utils.book_new();
    utils.book_append_sheet(workbook, worksheet, "任务模板");
    utils.book_append_sheet(workbook, notes, "填写说明");
    writeFileXLSX(
      workbook,
      `${boardTitle.replace(/[\\\\/:*?\"<>|]/g, "-") || "看板"}-任务导入模板.xlsx`
    );
  }

  async function importTaskTable(file: File) {
    if (isLocalPreview) {
      throw new Error("本地预览模式不支持任务导入。");
    }
    setImportingTasks(true);
    try {
      const buffer = await file.arrayBuffer();
      const workbook = read(buffer, { type: "array" });
      const firstSheetName = workbook.SheetNames[0];
      const sheet = firstSheetName ? workbook.Sheets[firstSheetName] : null;
      if (!sheet) {
        throw new Error("未找到可导入的工作表");
      }
      const rows = utils.sheet_to_json<Record<string, unknown>>(sheet, {
        defval: "",
        raw: false,
      });
      if (rows.length === 0) {
        throw new Error("导入文件为空");
      }

      const parsedRows = rows.map((row, index) => parseTaskImportRow(row, board.projects, boardTeams, index + 2));

      const preflightErrors = parsedRows.flatMap((r) => r.errors);
      if (preflightErrors.length > 0) {
        throw new Error(preflightErrors.slice(0, 10).join("\n") + (preflightErrors.length > 10 ? `\n... 还有 ${preflightErrors.length - 10} 条错误` : ""));
      }

      let createdCount = 0;
      const failures: string[] = [];

      for (const row of parsedRows) {
        try {
          await apiRequest<BoardTask>("/api/tasks", "POST", {
            title: row.title,
            description: row.description,
            projectId: row.project,
            ownerUserId: row.ownerUserId,
            testerUserId: row.testerUserId,
            workloadDays: row.workloadDays,
            priority: row.priority,
            testDueDate: row.testDueDate,
            designDueDate: row.designDueDate,
            dueDate: row.dueDate,
            tags: row.tags,
          });
          createdCount += 1;
        } catch (error) {
          failures.push(error instanceof Error ? error.message : `任务「${row.title}」导入失败`);
        }
      }

      if (createdCount > 0) {
        await refreshBoard();
        notifyDashboardRefresh();
      }

      if (failures.length === 0) {
        notify(`已导入 ${createdCount} 条任务`);
        return;
      }

      const summary = [
        createdCount > 0 ? `成功导入 ${createdCount} 条任务。` : "没有任务导入成功。",
        `失败 ${failures.length} 条。`,
        failures.slice(0, 5).join("\n"),
      ]
        .filter(Boolean)
        .join("\n");
      showNotice(summary, "导入已完成");
      notify(`导入完成：成功 ${createdCount} / 失败 ${failures.length}`, failures.length === parsedRows.length ? "error" : "success");
    } finally {
      setImportingTasks(false);
      if (importInputRef.current) {
        importInputRef.current.value = "";
      }
    }
  }

  return (
    <main data-theme={themeId} className="kanban-theme flex min-h-screen flex-col bg-[var(--app-bg)] text-[var(--text)]">
      {currentUser ? (
        <OnboardingGuide
          username={currentUser.username}
          role={currentUser.role}
          scope="kanban"
          actions={{
            closeMenu: () => {
              window.dispatchEvent(new CustomEvent("kanban:onboarding-close-menu"));
            },
            openTaskCreate: () => setTaskCreateOpen(true),
            openProjectCreate: () => openProject(null),
            goDashboard: () => window.location.assign("/dashboard"),
          }}
        />
      ) : null}
      <div className="mx-auto grid min-h-screen w-full max-w-[2160px] flex-1 grid-rows-[auto_1fr] gap-4 px-5 py-4 2xl:px-8">
        <header className="flex flex-col gap-4 border-b border-[var(--border)] pb-4 2xl:flex-row 2xl:items-end 2xl:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
              <span className="inline-flex items-center rounded-full border border-[var(--accent)]/20 bg-[var(--accent-soft)] px-3 py-1 text-[11px] font-semibold text-[var(--accent)]">
                <span className="mr-2 h-2 w-2 rounded-full bg-current opacity-75" />
                KANBAN
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--accent)]/20 bg-[var(--accent-soft)] px-3 py-1 text-[11px] font-semibold normal-case tracking-normal text-[var(--accent)]">
                <Edit3 size={12} />
                <span className="text-[var(--text)]">kfzx-chenwh4</span>
                <span className="text-[var(--accent)]">000959918</span>
              </span>
              <button
                type="button"
                onClick={() => setChangelogOpen(true)}
                className="inline-flex items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--panel)] px-3 py-1 text-[11px] font-semibold text-[var(--muted)] transition hover:border-[var(--accent)]/30 hover:bg-[var(--card-section)] hover:text-[var(--text)]"
                title="查看版本更新记录"
              >
                {appVersion}
                <History size={12} />
              </button>
            </div>
            <h1 className="mt-3 text-3xl font-semibold 2xl:text-5xl">{boardTitle}</h1>
          </div>
          <div className="flex flex-col gap-3 2xl:items-end">
            <div ref={metricRef} className="grid grid-cols-5 gap-2 text-right">
              <Metric label="项目" value={metrics.projects} />
              <Metric label="活跃" value={metrics.active} />
              <Metric
                label="临期"
                value={metrics.dueSoon}
                alert={metrics.dueSoon > 0}
                active={metricFilter === "dueSoon"}
                onClick={() => setMetricFilter((current) => (current === "dueSoon" ? null : "dueSoon"))}
              />
              <Metric
                label="超期"
                value={metrics.overdue}
                alert={metrics.overdue > 0}
                active={metricFilter === "overdue"}
                onClick={() => setMetricFilter((current) => (current === "overdue" ? null : "overdue"))}
              />
              <Metric
                label="阻塞"
                value={metrics.blocked}
                alert={metrics.blocked > 0}
                active={metricFilter === "blocked"}
                onClick={() => setMetricFilter((current) => (current === "blocked" ? null : "blocked"))}
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="shrink-0 text-sm text-[var(--muted)]">配色方案</span>
              <SearchableSelect
                value={themeId}
                options={themeOptions}
                onChange={(value) => changeTheme(value as ThemeId)}
                placeholder="选择配色"
                className="min-w-0 flex-1 2xl:w-[180px]"
              />
              {canManageSettings ? (
                <button
                  type="button"
                  title="系统参数"
                  onClick={() => setDrawerMode("settings")}
                  className="rounded-md border border-[var(--border)] bg-[var(--panel)] p-2 text-[var(--text)] transition hover:bg-[var(--panel-soft)]"
                >
                  <SlidersHorizontal size={18} />
                </button>
              ) : null}
            </div>
          </div>
        </header>

        <section className="grid min-h-0 gap-4 lg:grid-cols-[320px_minmax(0,1fr)] 2xl:grid-cols-[340px_minmax(0,1fr)]">
          <aside className="min-h-0 space-y-3 overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--panel)] p-3">
            <SidebarSection
              title="项目导航"
              icon={<LayoutGrid size={15} />}
              action={canManageProjects ? (
                <button
                  type="button"
                  title="新建项目"
                  data-tour="kanban-create-project"
                  onClick={() => openProject(null)}
                  className="rounded-md border border-[var(--border)] bg-[var(--panel)] p-2 text-[var(--text)] transition hover:bg-[var(--panel-soft)]"
                >
                  <FolderPlus size={16} />
                </button>
              ) : null}
            >
              <button
                type="button"
                onClick={() => setProjectFilter("all")}
                className={`flex w-full items-center justify-between rounded-md px-3 py-2.5 text-left text-sm transition ${
                  projectFilter === "all"
                    ? "bg-[var(--text)] text-[var(--panel)]"
                    : "bg-[var(--panel)] text-[var(--text)] hover:bg-[var(--panel-soft)]"
                }`}
              >
                <span className="font-medium">全部活跃项目</span>
                <span className="rounded bg-black/10 px-2 py-0.5 text-xs font-semibold">{activeProjects.length}</span>
              </button>
              <div className="grid gap-2">
                {activeProjects.map((project) => (
                  <ProjectRow
                    key={project.id}
                    project={project}
                    selected={projectFilter === project.id}
                    taskCount={board.tasks.filter((task) => task.projectId === project.id).length}
                    onSelect={() => {
                      setProjectFilter(project.id);
                      setSelectedProjectId(project.id);
                    }}
                    onView={!canManageProjects ? () => openProject(project) : undefined}
                    onEdit={canManageProjects ? () => openProject(project) : undefined}
                    onArchive={canManageProjects ? () => void persistProject(project.id, { status: "archived" }, "项目已归档") : undefined}
                  />
                ))}
              </div>
            </SidebarSection>

            <SidebarSection title="任务筛选" icon={<SlidersHorizontal size={15} />}>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-2.5 text-[var(--muted)]" size={15} />
                <input
                  name="taskSearch"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="任务、描述、负责人、测试员"
                  className="w-full rounded-md border border-[var(--border)] bg-[var(--input)] py-2 pl-9 pr-3 text-base text-[var(--text)] outline-none transition placeholder:text-base placeholder:text-[var(--muted)] placeholder:opacity-50 focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)]"
                />
                {search ? (
                  <button
                    type="button"
                    title="重置搜索"
                    onClick={() => setSearch("")}
                    className="absolute right-2 top-2 rounded p-1 text-[var(--muted)] transition hover:bg-[var(--panel-soft)] hover:text-[var(--text)]"
                  >
                    <X size={14} />
                  </button>
                ) : null}
              </div>
              <div className="grid grid-cols-4 gap-1 rounded-lg border border-[var(--border)] bg-[var(--input)] p-1 shadow-inner">
                {(["all", "high", "medium", "low"] as const).map((priority) => (
                  <button
                    key={priority}
                    type="button"
                    aria-pressed={priorityFilter === priority}
                    onClick={() => setPriorityFilter(priority)}
                    className={`rounded-md border px-2 py-2 text-sm font-semibold shadow-sm transition active:scale-[0.98] ${
                      priorityFilter === priority
                        ? "border-[var(--text)] bg-[var(--text)] text-[var(--panel)]"
                        : "border-[var(--border)] bg-[var(--panel)] text-[var(--text)] hover:border-[var(--accent)] hover:bg-[var(--panel-soft)]"
                    }`}
                  >
                    {priority === "all" ? "全部" : priorityLabels[priority]}
                  </button>
                ))}
              </div>
              <SearchMultiSelect
                value={tagFilters}
                options={allTags.map((tag) => ({ value: tag, label: tag }))}
                onChange={setTagFilters}
                placeholder="全部标签"
                summaryLabel="标签"
                searchPlaceholder="搜索标签"
              />
            </SidebarSection>

            <SidebarSection title="看板概览" icon={<Activity size={15} />}>
              <div className="grid grid-cols-2 gap-2">
                {sidebarOverviewItems.map((item) => (
                  <div key={item.id} className="rounded-md border border-[var(--border)] bg-[var(--panel)] px-3 py-3">
                    <div className="flex items-center gap-2 text-xs text-[var(--muted)]">
                      <span className={`h-2 w-2 rounded-full ${item.tone}`} />
                      <span>{item.title}</span>
                    </div>
                    <div className="mt-2 text-xl font-semibold text-[var(--text)]">{item.count}</div>
                  </div>
                ))}
              </div>
            </SidebarSection>

            {archivedProjects.length > 0 ? (
              <SidebarSection title="归档项目" icon={<Archive size={15} />}>
                {archivedProjects.map((project) => (
                  <button
                    key={project.id}
                    type="button"
                    onClick={() => openProject(project)}
                    className="flex w-full items-center justify-between rounded-md bg-[var(--panel-soft)] px-3 py-2 text-left text-sm text-[var(--muted)] hover:bg-[var(--hover)]"
                  >
                    <span>{project.name}</span>
                    <Archive size={14} />
                  </button>
                ))}
              </SidebarSection>
            ) : null}
          </aside>

          <section className="min-w-0 overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--board-bg)]">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] px-3 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <div className="inline-flex rounded-md border border-[var(--border)] bg-[var(--panel)] p-1">
                  <button
                    type="button"
                    title="卡片视图"
                    aria-label="卡片视图"
                    onClick={() => changeViewMode("board")}
                    className={`inline-flex items-center gap-2 rounded px-3 py-2 text-sm transition ${
                      viewMode === "board"
                        ? "bg-[var(--text)] text-[var(--panel)]"
                        : "text-[var(--muted)] hover:bg-[var(--panel-soft)] hover:text-[var(--text)]"
                    }`}
                  >
                    <LayoutGrid size={15} />
                  </button>
                  <button
                    type="button"
                    title="列表视图"
                    aria-label="列表视图"
                    onClick={() => changeViewMode("list")}
                    className={`inline-flex items-center gap-2 rounded px-3 py-2 text-sm transition ${
                      viewMode === "list"
                        ? "bg-[var(--text)] text-[var(--panel)]"
                        : "text-[var(--muted)] hover:bg-[var(--panel-soft)] hover:text-[var(--text)]"
                    }`}
                  >
                    <Rows3 size={15} />
                  </button>
                </div>
                <button
                  type="button"
                  data-tour="kanban-create-task"
                  onClick={() => setTaskCreateOpen(true)}
                  className="inline-flex h-10 items-center gap-2 rounded-md border border-[var(--accent)] bg-[var(--panel)] px-3.5 text-sm font-semibold text-[var(--accent)] transition hover:bg-[var(--accent-soft)]"
                >
                  <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-[var(--accent)] text-white">
                    <Plus size={12} />
                  </span>
                  <span>任务卡</span>
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {viewMode === "list" ? (
                  <SearchMultiSelect
                    value={listStatusFilters}
                    options={listStatusOptions}
                    onChange={(nextValue) => setListStatusFilters(nextValue as BoardStatus[])}
                    placeholder="全部阶段"
                    summaryLabel="阶段"
                    searchPlaceholder="搜索阶段"
                    className="min-w-[240px]"
                    compact
                  />
                ) : null}
                <span className="inline-flex h-10 min-w-[86px] items-center justify-center rounded-md border border-[var(--border)] bg-[var(--panel)] px-3 text-center shadow-sm">
                  <span className="inline-flex items-baseline">
                    <span className="text-lg font-semibold leading-none text-[var(--text)]">{visibleListTasks.length}</span>
                    <span className="ml-0.5 text-[10px] font-semibold leading-none text-[var(--muted)]">任务</span>
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => setImportDialogOpen(true)}
                  disabled={importingTasks}
                  className="inline-flex h-10 items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--panel)] px-3 text-sm font-medium text-[var(--text)] shadow-sm transition hover:bg-[var(--panel-soft)] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Upload size={15} />
                  {importingTasks ? "导入中" : "导入"}
                </button>
                <button
                  type="button"
                  onClick={exportTaskTable}
                  className="inline-flex h-10 items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--panel)] px-3 text-sm font-medium text-[var(--text)] shadow-sm transition hover:bg-[var(--panel-soft)]"
                >
                  <Download size={15} />
                  导出
                </button>
                <input
                  ref={importInputRef}
                  type="file"
                  accept=".xlsx,.xls"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) {
                      void importTaskTable(file);
                    }
                  }}
                />
              </div>
            </div>
            {viewMode === "board" ? (
              <DndContext
                id="kanban-board-dnd"
                sensors={dragSensors}
                collisionDetection={kanbanCollisionDetection}
                onDragStart={handleDragStart}
                onDragOver={handleDragOver}
                onDragEnd={(event) => void handleDragEnd(event)}
                onDragCancel={handleDragCancel}
              >
                {/* 需求池：横向布局 - 始终显示，拖拽时不消失 */}
                <div className="border-b border-[var(--border)] p-3">
                  {board.columns.slice(0, 1).map((column) => {
                    const columnTasks = sortTasks(
                      filteredTasks.filter((task) => task.status === column.id)
                    );
                    return (
                      <HorizontalBoardColumn
                        key={column.id}
                        column={column}
                        tasks={columnTasks}
                        projects={board.projects}
                        collapsed={backlogCollapsed}
                        selectedTaskId={selectedTaskId}
                        todayKey={todayKey}
                        dueSoonDays={dueSoonDays}
                        taskCardStripeEnabled={taskCardStripeEnabled}
                        crossDragTarget={crossDragTarget}
                        searchQuery={search}
                        onToggleCollapse={() => setBacklogCollapsed((current) => !current)}
                        onOpenTask={openTask}
                      />
                    );
                  })}
                </div>
                {/* 其余4列：纵向布局 */}
                <div className="flex h-full min-h-[760px] gap-3 overflow-x-auto p-3 2xl:min-h-[900px]">
                  {board.columns.slice(1).map((column) => {
                    const columnTasks = sortTasks(
                      filteredTasks.filter((task) => task.status === column.id)
                    );

                    return (
                      <BoardColumnView
                        key={column.id}
                        column={column}
                        tasks={columnTasks}
                        projects={board.projects}
                        selectedTaskId={selectedTaskId}
                        todayKey={todayKey}
                        dueSoonDays={dueSoonDays}
                        taskCardStripeEnabled={taskCardStripeEnabled}
                        crossDragTarget={crossDragTarget}
                        searchQuery={search}
                        onOpenTask={openTask}
                      />
                    );
                  })}
                </div>
                <DeleteDropZone visible={draggingTaskId !== null} />
                <DragOverlay dropAnimation={dragOverlayDropAnimation} zIndex={160}>
                  {draggingTask ? (
                    <div
                      className="transition-[width] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]"
                      style={{
                        width: dragOverlayWidth ?? measuredTaskCardWidth(draggingTask.status),
                        maxWidth: "calc(100vw - 32px)",
                      }}
                    >
                      <TaskCard
                        task={draggingTask}
                        todayKey={todayKey}
                        dueSoonDays={dueSoonDays}
                        project={draggingTaskProject}
                        selected={draggingTask.id === selectedTaskId}
                        stripeEnabled={taskCardStripeEnabled}
                        dragging
                        draggable={false}
                        searchQuery={search}
                        onSelect={() => {}}
                      />
                    </div>
                  ) : null}
                </DragOverlay>
              </DndContext>
            ) : (
              <KanbanListView
                tasks={visibleListTasks}
                todayKey={todayKey}
                dueSoonDays={dueSoonDays}
                searchQuery={search}
                onOpenTask={openTask}
              />
            )}
          </section>

        </section>
      </div>

      <footer className="border-t border-[var(--border)] text-sm text-[var(--muted)]">
        <div className="mx-auto flex w-full max-w-[2160px] flex-col items-center gap-3 px-5 py-5 sm:flex-row sm:justify-between 2xl:px-8">
          <div className="flex items-center gap-2">
            <Copyright size={14} />
            <span>2026 <strong>Kanban</strong></span>
            <span className="rounded bg-[var(--card-section)] px-1.5 py-0.5 text-xs text-[var(--muted)]">
              v{appVersion}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Edit3 size={13} />
            <span className="h-3 w-px bg-[var(--border)]" />
            <span className="font-medium text-[var(--text)]">kfzx-chenwh4</span>
            <span className="rounded bg-[var(--accent-soft)] px-1.5 py-0.5 text-xs font-medium text-[var(--accent)]">000959918</span>
          </div>
        </div>
      </footer>

      <div className="fixed bottom-5 right-5 z-30 flex flex-col items-end gap-3">
        <button
          type="button"
          title="项目负载大屏"
          data-tour="kanban-go-dashboard"
          onClick={() => window.location.assign("/dashboard")}
          className={floatingActionButtonClass}
        >
          <ChartNoAxesCombined size={17} className="shrink-0" />
          <span>项目负载</span>
        </button>
        <button
          type="button"
          title="活动记录"
          onClick={() => setDrawerMode("activity")}
          className={floatingActionButtonClass}
        >
          <Activity size={17} className="shrink-0" />
          <span>活动记录</span>
        </button>
      </div>

      <ToastViewport toasts={toasts} />

      {drawerMode ? (
        <Drawer onClose={() => setDrawerMode(null)} side={drawerMode === "project" || drawerMode === "settings" ? "left" : "right"}>
          {drawerMode === "task" && selectedTask ? (
            <TaskDrawer
              key={selectedTask.id}
              task={selectedTask}
              projects={activeProjectChoices}
              teams={boardTeams}
              columns={board.columns}
              currentUser={currentUser ?? undefined}
              editable={selectedTaskEditable}
              onSave={(patch, subtasks) => saveTaskDetail(selectedTask.id, patch, subtasks)}
              onInvalid={showNotice}
              onRework={() => reworkTask(selectedTask.id)}
              onDelete={() => void removeTask(selectedTask.id)}
            />
          ) : null}
          {drawerMode === "project" ? (
            <ProjectDrawer
              project={selectedProject}
              teams={boardTeams}
              draft={projectDraft}
              setDraft={setProjectDraft}
              editable={canManageProjects}
              onSubmit={saveProject}
              onArchive={(summary) => {
                if (selectedProject) {
                  void persistProject(selectedProject.id, {
                    status: "archived",
                    summary,
                  }, "项目已归档");
                }
              }}
              onRestore={() => {
                if (selectedProject) {
                  void persistProject(selectedProject.id, { status: "active" }, "项目已恢复");
                }
              }}
              onDelete={() => {
                if (selectedProject) {
                  void removeProject(selectedProject.id);
                }
              }}
            />
          ) : null}
          {drawerMode === "activity" ? (
            <ActivityPanel
              activity={board.activity}
              projects={board.projects}
              tasks={board.tasks}
              expanded
            />
          ) : null}
          {drawerMode === "settings" ? (
            <SettingsDrawer
              key={settings.parameters.map((parameter) => `${parameter.key}:${parameter.value}`).join("|")}
              settings={settings}
              onSave={(patch) => void persistSettings(patch)}
            />
          ) : null}
        </Drawer>
      ) : null}
      {confirmDialog ? (
        <ConfirmDialog
          title={confirmDialog.title}
          message={confirmDialog.message}
          tone={confirmDialog.tone}
          actionLabel={confirmDialog.actionLabel}
          cancelLabel={confirmDialog.cancelLabel}
          showCancel={confirmDialog.showCancel}
          onClose={() => setConfirmDialog(null)}
          onConfirm={confirmDialog.onConfirm}
        />
      ) : null}
      {changelogOpen ? (
        <ChangelogDialog
          appVersion={appVersion}
          entries={changelogEntries}
          onClose={() => setChangelogOpen(false)}
        />
      ) : null}
      {taskCreateOpen ? (
        <TaskCreateDialog
          open={taskCreateOpen}
          newTask={newTask}
          newTaskProjectId={newTaskProjectId}
          newTaskMembers={newTaskMembers}
          newTaskMemberOptions={newTaskMemberOptions}
          activeProjectOptions={activeProjectOptions}
          priorityOptions={priorityOptions}
          canManageProjects={canManageProjects}
          onClose={() => setTaskCreateOpen(false)}
          onOpenProjectCreate={() => openProject(null)}
          onSubmit={createTask}
          onChange={setNewTask}
        />
      ) : null}
      {importDialogOpen ? (
        <ImportTaskDialog
          importing={importingTasks}
          onImport={async (file) => {
            await importTaskTable(file);
          }}
          onDownloadTemplate={downloadTaskImportTemplate}
          onClose={() => setImportDialogOpen(false)}
        />
      ) : null}
    </main>
  );
}

function SidebarSection({
  title,
  icon,
  action,
  description,
  children,
}: {
  title: string;
  icon: ReactNode;
  action?: ReactNode;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3 rounded-lg border border-[var(--border)] bg-[var(--panel-soft)] p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-semibold text-[var(--text)]">
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-[var(--panel)] text-[var(--accent)]">
              {icon}
            </span>
            <span>{title}</span>
          </div>
          {description ? <p className="mt-1 text-xs leading-5 text-[var(--muted)]">{description}</p> : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      {children}
    </section>
  );
}

function HorizontalBoardColumn({
  column,
  tasks,
  projects,
  collapsed,
  selectedTaskId,
  todayKey,
  dueSoonDays,
  taskCardStripeEnabled,
  crossDragTarget,
  searchQuery,
  onToggleCollapse,
  onOpenTask,
}: {
  column: BoardData["columns"][number];
  tasks: BoardTask[];
  projects: Project[];
  collapsed: boolean;
  selectedTaskId: string | null;
  todayKey: string;
  dueSoonDays: number;
  taskCardStripeEnabled: boolean;
  crossDragTarget: BoardStatus | null;
  searchQuery: string;
  onToggleCollapse: () => void;
  onOpenTask: (taskId: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: column.id,
    data: { type: "column", status: column.id } satisfies DragTargetData,
  });
  const activeDropTarget = crossDragTarget === column.id || isOver;
  const taskIds = tasks.map((task) => task.id);

  return (
    <div
      ref={setNodeRef}
      role="region"
      aria-label={`${column.title}列表`}
      data-board-drop-status={column.id}
      data-tour={column.id === "backlog" ? "column-backlog" : undefined}
      className={`rounded-lg border bg-[var(--column-bg)] transition ${
        activeDropTarget
          ? "border-[var(--accent)] ring-2 ring-[var(--accent-soft)]"
          : "border-[var(--border)]"
      }`}
    >
      <div className="flex items-center gap-4 px-3 py-2">
        <div className="flex shrink-0 items-center gap-2">
          <span className={`h-2.5 w-2.5 rounded-full ${column.tone}`} />
          <h2 className="text-sm font-semibold 2xl:text-base">
            {column.title}
            <span className="ml-2 inline-flex rounded-md bg-[var(--panel-soft)] px-2 py-1 align-middle text-xs font-medium text-[var(--muted)]">
              {tasks.length}
            </span>
          </h2>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span className="sr-only">
            {tasks.length}
          </span>
          <button
            type="button"
            title={collapsed ? "展开需求池" : "折叠需求池"}
            onClick={onToggleCollapse}
            className="rounded-md border border-[var(--border)] bg-[var(--panel)] p-1.5 text-[var(--muted)] transition hover:bg-[var(--panel-soft)] hover:text-[var(--text)]"
          >
            {collapsed ? <ChevronDown size={15} /> : <ChevronUp size={15} />}
          </button>
        </div>
      </div>
      <div
        className={`grid overflow-hidden transition-[grid-template-rows,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
          collapsed ? "grid-rows-[0fr] opacity-0" : "grid-rows-[1fr] opacity-100"
        }`}
      >
        <div className="min-h-0 overflow-hidden">
            <div
              className="flex min-h-[118px] flex-nowrap items-stretch gap-3.5 overflow-x-auto overflow-y-hidden rounded-b-lg bg-[var(--lane-bg)] px-3.5 py-3"
            >
              <SortableContext id={column.id} items={taskIds} strategy={horizontalListSortingStrategy}>
                {tasks.map((task) => (
                  <HorizontalSortableTaskCard
                    key={task.id}
                    task={task}
                    todayKey={todayKey}
                    dueSoonDays={dueSoonDays}
                    project={projectById(projects, task.projectId)}
                    selected={task.id === selectedTaskId}
                    stripeEnabled={taskCardStripeEnabled}
                    searchQuery={searchQuery}
                    className="w-[280px] shrink-0"
                    onSelect={() => onOpenTask(task.id)}
                  />
                ))}
              </SortableContext>
              {tasks.length === 0 ? (
                <EmptyLaneCard axis="horizontal" active={activeDropTarget} />
              ) : null}
            </div>
        </div>
      </div>
    </div>
  );
}

function BoardColumnView({
  column,
  tasks,
  projects,
  selectedTaskId,
  todayKey,
  dueSoonDays,
  taskCardStripeEnabled,
  crossDragTarget,
  searchQuery,
  onOpenTask,
}: {
  column: BoardData["columns"][number];
  tasks: BoardTask[];
  projects: Project[];
  selectedTaskId: string | null;
  todayKey: string;
  dueSoonDays: number;
  taskCardStripeEnabled: boolean;
  crossDragTarget: BoardStatus | null;
  searchQuery: string;
  onOpenTask: (taskId: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: column.id,
    data: { type: "column", status: column.id } satisfies DragTargetData,
  });
  const activeDropTarget = crossDragTarget === column.id || isOver;
  const taskIds = tasks.map((task) => task.id);

  return (
    <div
      role="region"
      aria-label={`${column.title}列表`}
      data-tour={column.id === "design" ? "column-design" : undefined}
      className={`flex min-w-[300px] flex-[0_0_300px] flex-col overflow-hidden rounded-lg border bg-[var(--column-bg)] transition 2xl:min-w-[320px] 2xl:flex-1 ${
        activeDropTarget
          ? "border-[var(--accent)] ring-2 ring-[var(--accent-soft)]"
          : "border-[var(--border)]"
      }`}
    >
      <div className="border-b border-[var(--border)] px-3 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className={`h-2.5 w-2.5 rounded-full ${column.tone}`} />
            <h2 className="text-sm font-semibold 2xl:text-base">
              {column.title}
              <span className="ml-2 inline-flex rounded-md bg-[var(--panel-soft)] px-2 py-1 align-middle text-xs font-medium text-[var(--muted)]">
                {tasks.length}
              </span>
            </h2>
          </div>
          <span className="sr-only">
            {tasks.length}
          </span>
        </div>
      </div>
      <div ref={setNodeRef} data-board-drop-status={column.id} className="flex min-h-[220px] flex-1 flex-col gap-3.5 overflow-y-auto bg-[var(--lane-bg)] p-3.5">
          <SortableContext id={column.id} items={taskIds} strategy={verticalListSortingStrategy}>
            {tasks.map((task) => (
              <VerticalSortableTaskCard
                key={task.id}
                task={task}
                todayKey={todayKey}
                dueSoonDays={dueSoonDays}
                project={projectById(projects, task.projectId)}
                selected={task.id === selectedTaskId}
                stripeEnabled={taskCardStripeEnabled}
                searchQuery={searchQuery}
                className="w-full"
                onSelect={() => onOpenTask(task.id)}
              />
            ))}
          </SortableContext>
          {tasks.length === 0 ? (
            <EmptyLaneCard axis="vertical" active={activeDropTarget} />
          ) : null}
      </div>
    </div>
  );
}

function KanbanListView({
  tasks,
  todayKey,
  dueSoonDays,
  searchQuery,
  onOpenTask,
}: {
  tasks: Array<{ task: BoardTask; project: Project; statusLabel: string }>;
  todayKey: string;
  dueSoonDays: number;
  searchQuery: string;
  onOpenTask: (taskId: string) => void;
}) {
  return (
    <div className="min-h-[760px] overflow-auto bg-[var(--lane-bg)] p-3 2xl:min-h-[900px]">
      <div className="min-w-[1200px] overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--panel)]">
        <div className="grid grid-cols-[180px_minmax(280px,1.6fr)_140px_110px_110px_130px_130px_140px_110px_110px] gap-3 border-b border-[var(--border)] bg-[var(--panel-soft)] px-4 py-3 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">
          <span>项目 / 状态</span>
          <span>任务</span>
          <span>负责人</span>
          <span>测试员</span>
          <span>工作量（人日）</span>
          <span>标签</span>
          <span>截止</span>
          <span>更新时间</span>
          <span>进度</span>
          <span>阻塞</span>
        </div>
        <div className="divide-y divide-[var(--border)]">
          {tasks.length > 0 ? (
            tasks.map(({ task, project, statusLabel }) => {
              const deadlineText = deadlineSummary(task, todayKey, dueSoonDays);
              return (
                <button
                  key={task.id}
                  type="button"
                  onClick={() => onOpenTask(task.id)}
                  className="grid w-full grid-cols-[180px_minmax(280px,1.6fr)_140px_110px_110px_130px_130px_140px_110px_110px] gap-3 px-4 py-3 text-left transition hover:bg-[var(--hover)]"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-[var(--text)]">{project.name}</span>
                    <span className="mt-1 inline-flex rounded-full bg-[var(--panel-soft)] px-2 py-1 text-xs text-[var(--muted)]">{statusLabel}</span>
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-[var(--text)]">
                      <HighlightedSearchText text={task.title} query={searchQuery} />
                    </span>
                    <span className="mt-1 line-clamp-2 block text-xs text-[var(--muted)]">
                      <HighlightedSearchText text={task.description || "无描述"} query={task.description ? searchQuery : ""} />
                    </span>
                  </span>
                  <span className="truncate text-sm text-[var(--text)]">{task.owner || "-"}</span>
                  <span className="truncate text-sm text-[var(--text)]">{task.tester || "-"}</span>
                  <span className="text-sm font-semibold text-[var(--text)]">{task.workloadDays ?? "-"}</span>
                  <span className="truncate text-xs text-[var(--muted)]">{task.tags.join(" / ") || "-"}</span>
                  <span className="truncate text-xs text-[var(--muted)]">{deadlineText}</span>
                  <span className="text-xs text-[var(--muted)]">{task.updatedAt.slice(0, 10)}</span>
                  <span className="text-sm font-semibold text-[var(--text)]">{task.progress}%</span>
                  <span className={`text-sm font-semibold ${task.blockers > 0 ? "text-[#c7523d]" : "text-[var(--muted)]"}`}>
                    {task.blockers > 0 ? task.blockers : "-"}
                  </span>
                </button>
              );
            })
          ) : (
            <div className="grid min-h-[280px] place-items-center text-sm text-[var(--muted)]">暂无任务</div>
          )}
        </div>
      </div>
    </div>
  );
}

function HorizontalSortableTaskCard({
  task,
  todayKey,
  dueSoonDays,
  project,
  selected,
  stripeEnabled,
  searchQuery,
  className,
  onSelect,
}: {
  task: BoardTask;
  todayKey: string;
  dueSoonDays: number;
  project: Project;
  selected: boolean;
  stripeEnabled: boolean;
  searchQuery: string;
  className?: string;
  onSelect: () => void;
}) {
  return (
    <HorizontalDraggableTaskCard
      task={task}
      todayKey={todayKey}
      dueSoonDays={dueSoonDays}
      project={project}
      selected={selected}
      stripeEnabled={stripeEnabled}
      searchQuery={searchQuery}
      className={className}
      onSelect={onSelect}
    />
  );
}

function HorizontalDraggableTaskCard({
  task,
  todayKey,
  dueSoonDays,
  project,
  selected,
  stripeEnabled,
  searchQuery,
  className,
  onSelect,
}: {
  task: BoardTask;
  todayKey: string;
  dueSoonDays: number;
  project: Project;
  selected: boolean;
  stripeEnabled: boolean;
  searchQuery: string;
  className?: string;
  onSelect: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: task.id,
    data: { type: "task", status: task.status } satisfies DragTargetData,
    transition: sortableTransition,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  } satisfies CSSProperties;

  return (
    <div
      ref={setNodeRef}
      style={style}
      data-task-card-frame="true"
      {...attributes}
      {...listeners}
      className={`${className ?? ""} touch-none ${isDragging ? "pointer-events-none relative z-30 opacity-0" : ""}`}
      data-shadow={isDragging || undefined}
    >
      <TaskCard
        task={task}
        todayKey={todayKey}
        dueSoonDays={dueSoonDays}
        project={project}
        selected={selected}
        stripeEnabled={stripeEnabled}
        searchQuery={searchQuery}
        dragging={isDragging}
        draggable={true}
        onSelect={onSelect}
      />
    </div>
  );
}

function VerticalSortableTaskCard({
  task,
  todayKey,
  dueSoonDays,
  project,
  selected,
  stripeEnabled,
  searchQuery,
  className,
  onSelect,
}: {
  task: BoardTask;
  todayKey: string;
  dueSoonDays: number;
  project: Project;
  selected: boolean;
  stripeEnabled: boolean;
  searchQuery: string;
  className?: string;
  onSelect: () => void;
}) {
  return (
    <VerticalDraggableTaskCard
      task={task}
      todayKey={todayKey}
      dueSoonDays={dueSoonDays}
      project={project}
      selected={selected}
      stripeEnabled={stripeEnabled}
      searchQuery={searchQuery}
      className={className}
      onSelect={onSelect}
    />
  );
}

function VerticalDraggableTaskCard({
  task,
  todayKey,
  dueSoonDays,
  project,
  selected,
  stripeEnabled,
  searchQuery,
  className,
  onSelect,
}: {
  task: BoardTask;
  todayKey: string;
  dueSoonDays: number;
  project: Project;
  selected: boolean;
  stripeEnabled: boolean;
  searchQuery: string;
  className?: string;
  onSelect: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: task.id,
    data: { type: "task", status: task.status } satisfies DragTargetData,
    transition: sortableTransition,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  } satisfies CSSProperties;

  return (
    <div
      ref={setNodeRef}
      style={style}
      data-task-card-frame="true"
      {...attributes}
      {...listeners}
      className={`${className ?? ""} touch-none ${isDragging ? "pointer-events-none relative z-30 opacity-0" : ""}`}
      data-shadow={isDragging || undefined}
    >
      <TaskCard
        task={task}
        todayKey={todayKey}
        dueSoonDays={dueSoonDays}
        project={project}
        selected={selected}
        stripeEnabled={stripeEnabled}
        searchQuery={searchQuery}
        dragging={isDragging}
        draggable={true}
        onSelect={onSelect}
      />
    </div>
  );
}

function Metric({
  label,
  value,
  alert,
  active,
  onClick,
}: {
  label: string;
  value: number | string;
  alert?: boolean;
  active?: boolean;
  onClick?: () => void;
}) {
  const className = `rounded-lg border px-3 py-2 ${
    active
      ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]"
      : alert
        ? "border-[var(--danger)] bg-[var(--danger-soft)] text-[var(--danger)]"
        : "border-[var(--border)] bg-[var(--panel)]"
  } ${onClick ? "cursor-pointer text-left transition hover:-translate-y-0.5 hover:shadow-sm" : ""}`;

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={className}>
        <p className="text-xs text-[var(--muted)]">{label}</p>
        <p className="mt-1 text-lg font-semibold 2xl:text-2xl">{value}</p>
      </button>
    );
  }

  return (
    <div className={className}>
      <p className="text-xs text-[var(--muted)]">{label}</p>
      <p className="mt-1 text-lg font-semibold 2xl:text-2xl">{value}</p>
    </div>
  );
}

function EmptyLaneCard({
  axis,
  active = false,
}: {
  axis: "horizontal" | "vertical";
  active?: boolean;
}) {
  return (
    <div
      className={`grid rounded-lg border border-dashed px-4 text-center transition duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] ${
        active
          ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]"
          : "border-[var(--border)] bg-[var(--panel)]/60 text-[var(--muted)]"
      } ${
        axis === "horizontal"
          ? "min-h-[110px] w-[280px] shrink-0 place-items-center"
          : "min-h-[170px] w-full place-items-center"
      }`}
    >
      <div className="grid place-items-center gap-2">
        <span
          className={`grid h-8 w-8 place-items-center rounded-full border border-dashed ${
            active
              ? "border-[var(--accent)] bg-[var(--panel)] text-[var(--accent)]"
              : "border-[var(--border)] bg-[var(--panel-soft)] text-[var(--muted)]"
          }`}
        >
          <Plus size={16} />
        </span>
        <p className="text-xs">暂无任务</p>
      </div>
    </div>
  );
}

function ToastViewport({ toasts }: { toasts: Toast[] }) {
  if (toasts.length === 0) {
    return null;
  }

  return (
    <div className="fixed right-5 top-5 z-[70] flex w-[320px] max-w-[calc(100vw-2rem)] flex-col gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`rounded-md border px-3 py-2 text-sm shadow-lg ${
            toast.type === "success"
              ? "border-[#b9d4b1] bg-[#edf6ea] text-[#335c2d]"
              : "border-[var(--danger)] bg-[var(--danger-soft)] text-[var(--danger)]"
          }`}
        >
          {toast.message}
        </div>
      ))}
    </div>
  );
}

function ProjectRow({
  project,
  selected,
  taskCount,
  onSelect,
  onView,
  onEdit,
  onArchive,
}: {
  project: Project;
  selected: boolean;
  taskCount: number;
  onSelect: () => void;
  onView?: () => void;
  onEdit?: () => void;
  onArchive?: () => void;
}) {
  return (
    <div
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect();
        }
      }}
      role="button"
      tabIndex={0}
      className={`group relative cursor-pointer overflow-hidden rounded-lg border px-3 py-2.5 shadow-sm transition ${
        selected
          ? "border-[var(--text)] bg-[var(--text)] text-[var(--panel)] shadow-md"
          : "border-[var(--border)] bg-[var(--panel-soft)] text-[var(--text)] hover:border-[var(--accent)] hover:bg-[var(--hover)] hover:shadow-md"
      }`}
    >
      <span className="absolute bottom-2 left-0 top-2 w-1 rounded-r-full" style={{ backgroundColor: project.color }} />
      <div className="flex w-full cursor-pointer items-center gap-2 pl-1 text-left">
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{project.name}</span>
        <span
          className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${
            selected ? "border-white/20 bg-white/15 text-[var(--panel)]" : "border-[var(--border)] bg-[var(--panel)] text-[var(--muted)]"
          }`}
        >
          {taskCount}
        </span>
      </div>
      <div className="mt-2 flex items-center justify-between gap-2 pl-1 text-xs">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate opacity-80">{project.owner}</span>
          <span className={`rounded px-1.5 py-0.5 ${healthTone[project.health]}`}>
            {healthLabels[project.health]}
          </span>
        </div>
        {onView || onEdit || onArchive ? (
          <div className="flex gap-1">
            {onView ? (
              <button
                type="button"
                title="查看项目"
                onClick={(event) => {
                  event.stopPropagation();
                  onView();
                }}
                className={`rounded p-1 transition ${selected ? "hover:bg-white/20" : "hover:bg-[var(--panel)]"}`}
              >
                <Eye size={13} />
              </button>
            ) : null}
            {onEdit ? (
              <button
                type="button"
                title="编辑项目"
                onClick={(event) => {
                  event.stopPropagation();
                  onEdit();
                }}
                className={`rounded p-1 transition ${selected ? "hover:bg-white/20" : "hover:bg-[var(--panel)]"}`}
              >
                <Edit3 size={13} />
              </button>
            ) : null}
            {onArchive ? (
              <button
                type="button"
                title="归档项目"
                onClick={(event) => {
                  event.stopPropagation();
                  onArchive();
                }}
                className={`rounded p-1 transition ${selected ? "hover:bg-white/20" : "hover:bg-[var(--panel)]"}`}
              >
                <Archive size={13} />
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function DeleteDropZone({ visible }: { visible: boolean }) {
  const { setNodeRef, isOver } = useDroppable({
    id: "delete-zone",
    data: { type: "delete-zone" } satisfies DragTargetData,
  });

  return (
    <div
      ref={setNodeRef}
      className={`fixed bottom-8 right-6 z-40 transition-all duration-200 ${
        visible ? "pointer-events-auto translate-y-0 opacity-100" : "pointer-events-none translate-y-4 opacity-0"
      }`}
    >
      <div
        className={`grid min-h-[150px] min-w-[260px] place-items-center rounded-lg border-2 border-dashed px-7 py-6 text-center shadow-xl transition ${
          isOver
            ? "scale-[1.02] border-[var(--danger)] bg-[var(--danger)] text-white"
            : "border-[var(--danger)] bg-[var(--panel)] text-[var(--danger)]"
        }`}
      >
        <div className="flex flex-col items-center gap-3">
          <span
            className={`grid h-12 w-12 place-items-center rounded-full transition ${
              isOver ? "bg-white/20" : "bg-[var(--danger-soft)]"
            }`}
          >
            <Trash2 size={24} />
          </span>
          <span className="text-base font-semibold">拖入删除</span>
        </div>
      </div>
    </div>
  );
}

function HighlightedSearchText({ text, query }: { text: string; query: string }) {
  const ranges = getSelectSearchMatchRanges(text, query);
  if (ranges.length === 0) {
    return <>{text}</>;
  }

  const parts: ReactNode[] = [];
  let cursor = 0;
  ranges.forEach((range, index) => {
    const start = Math.max(cursor, range.start);
    const end = Math.max(start, range.end);
    if (start > cursor) {
      parts.push(text.slice(cursor, start));
    }
    if (end > start) {
      parts.push(
        <mark
          key={`${start}-${end}-${index}`}
          className="box-decoration-clone rounded bg-[var(--search-highlight-bg)] px-0.5 font-semibold text-[var(--search-highlight-text)] shadow-[0_0_0_1px_var(--search-highlight-bg)]"
        >
          {text.slice(start, end)}
        </mark>
      );
    }
    cursor = end;
  });
  if (cursor < text.length) {
    parts.push(text.slice(cursor));
  }

  return <>{parts}</>;
}

function TaskCard({
  task,
  todayKey,
  dueSoonDays,
  project,
  selected,
  stripeEnabled,
  searchQuery = "",
  dragging,
  draggable,
  onSelect,
}: {
  task: BoardTask;
  todayKey: string;
  dueSoonDays: number;
  project: Project;
  selected: boolean;
  stripeEnabled: boolean;
  searchQuery?: string;
  dragging: boolean;
  draggable: boolean;
  onSelect: () => void;
}) {
  const markers = deadlineMarkers(task, todayKey, dueSoonDays);
  const hasDateAlert = markers.some((marker) => marker.state !== "normal");
  const progress = task.progress;
  const visibleTags = task.tags.slice(0, 3);
  const hiddenTagCount = Math.max(0, task.tags.length - visibleTags.length);
  const stripeColor = alphaColor(project.color, 0.42);

  return (
    <article
      onClick={onSelect}
      className={`group relative overflow-hidden rounded-lg border bg-[var(--card)] p-3.5 pl-4 transition duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] ${
        selected ? "border-[var(--accent)] ring-2 ring-[var(--accent-soft)]" : "border-[var(--card-border-strong)]"
      } ${hasDateAlert ? "border-[var(--danger)] bg-[var(--danger-soft)]" : ""} ${
        dragging
          ? "shadow-[0_22px_50px_rgba(15,23,42,0.24),0_8px_18px_rgba(15,23,42,0.16)] ring-1 ring-[var(--accent-soft)]"
          : draggable
            ? "cursor-grab shadow-[var(--card-shadow)] hover:-translate-y-0.5 hover:border-[var(--accent)] hover:shadow-[var(--card-shadow-hover)] active:cursor-grabbing"
            : "cursor-default shadow-[var(--card-shadow)]"
      }`}
    >
      {stripeEnabled ? (
        <span
          aria-hidden="true"
          className="absolute inset-y-0 left-0 w-1"
          style={{ backgroundColor: stripeColor }}
        />
      ) : null}
      <div className="min-w-0">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h3 className="line-clamp-2 text-sm font-semibold leading-5 text-[var(--text)] 2xl:text-[15px]">
              <HighlightedSearchText text={task.title} query={searchQuery} />
            </h3>
            <div className="mt-1.5 flex min-w-0 items-center gap-1.5 text-[11px] text-[var(--muted)]">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: project.color }} />
              <span className="truncate">{project.name}</span>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <span className="rounded-md border border-[var(--card-border-strong)] bg-[var(--card-section)] px-2 py-0.5 text-[11px] font-semibold text-[var(--text)] shadow-sm">
              {task.workloadDays ?? "-"}
            </span>
            <span className={`rounded-md border px-2 py-0.5 text-[11px] ${priorityTone[task.priority]}`}>
              {priorityLabels[task.priority]}
            </span>
          </div>
        </div>
        <p className="mt-2 line-clamp-2 text-xs leading-5 text-[var(--muted)]">
          <HighlightedSearchText text={task.description || "暂无描述"} query={task.description ? searchQuery : ""} />
        </p>
      </div>

      {visibleTags.length ? (
        <div className="mt-3 flex flex-wrap gap-1">
          {visibleTags.map((tag) => (
            <span key={tag} className="inline-flex items-center gap-1 rounded-md bg-[var(--tag-bg)] px-2 py-0.5 text-[11px] text-[var(--muted)]">
              <Tag size={10} />
              {tag}
            </span>
          ))}
          {hiddenTagCount > 0 ? (
            <span className="rounded-md bg-[var(--panel-soft)] px-2 py-0.5 text-[11px] text-[var(--muted)]">
              +{hiddenTagCount}
            </span>
          ) : null}
        </div>
      ) : null}

      <div className="mt-3 grid grid-cols-2 gap-2 border-t border-[var(--border)] pt-3 text-xs">
        <TaskCardInfo label="负责">
          <OwnerTag name={task.owner} />
        </TaskCardInfo>
        {task.tester ? (
          <TaskCardInfo label="测试">
            <OwnerTag name={task.tester} />
          </TaskCardInfo>
        ) : (
          <TaskCardInfo label="测试">
            <span className="text-[var(--muted)]">-</span>
          </TaskCardInfo>
        )}
      </div>

      <div className="mt-3 grid gap-1.5 text-[11px] text-[var(--muted)]">
        {markers.length ? (
          markers.map((marker) => (
            <div
              key={`${marker.label}-${marker.date}`}
              className={`flex items-center justify-between gap-2 rounded-md border px-2 py-1 ${deadlineMarkerClass(marker.state)}`}
            >
              <span>{marker.label}</span>
              <span className="shrink-0 tabular-nums">
                {marker.date}
                {marker.note ? ` ${marker.note}` : ""}
              </span>
            </div>
          ))
        ) : (
          <div className="rounded-md border border-[var(--card-border)] bg-[var(--card-section)] px-2 py-1">未排期</div>
        )}
      </div>

      <div className="mt-3 flex items-center gap-3 text-xs text-[var(--muted)]">
        <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-[var(--card-section)]">
          <div
            className="h-full rounded-full bg-[var(--accent)] transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
        <span className="shrink-0 tabular-nums">{progress}%</span>
        <span className={`shrink-0 ${task.blockers > 0 ? "font-semibold text-[var(--danger)]" : ""}`}>
          {task.blockers > 0 ? `${task.blockers} 个阻塞` : "进度"}
        </span>
      </div>
    </article>
  );
}

function TaskCardInfo({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-3 rounded-md border border-[var(--card-border)] bg-[var(--card-section)] px-2 py-1.5 text-left">
      <div className="shrink-0 text-xs text-[var(--muted)]">{label}</div>
      <div className="flex min-w-0 items-center justify-end text-right">{children}</div>
    </div>
  );
}

function Drawer({ children, onClose, side = "right" }: { children: ReactNode; onClose: () => void; side?: "left" | "right" }) {
  function closeFromBackdrop(event: { target: EventTarget; currentTarget: EventTarget }) {
    if (event.target === event.currentTarget) {
      onClose();
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/20"
      onClick={closeFromBackdrop}
      onMouseDown={closeFromBackdrop}
      onPointerDown={closeFromBackdrop}
    >
      <aside
        className={`absolute top-0 h-full w-full max-w-[560px] overflow-y-auto bg-[var(--panel)] p-5 shadow-2xl ${
          side === "left"
            ? "left-0 border-r border-[var(--border)]"
            : "right-0 border-l border-[var(--border)]"
        }`}
      >
        <button
          type="button"
          title="关闭"
          onClick={onClose}
          className={`absolute top-4 rounded-md border border-[var(--border)] p-2 hover:bg-[var(--panel-soft)] ${
            side === "left" ? "right-4" : "right-4"
          }`}
        >
          <X size={16} />
        </button>
        {children}
      </aside>
    </div>
  );
}

type TaskDraft = {
  title: string;
  description: string;
  projectId: string;
  status: BoardStatus;
  priority: Priority;
  testDueDate: string;
  designDueDate: string;
  dueDate: string;
  ownerUserId: string;
  owner: string;
  testerUserId: string;
  tester: string;
  workloadDays: string;
  progress: number;
  blockers: string;
  blockedReason: string;
  tagsText: string;
};

type SubtaskDraft = Subtask;

function taskDraftFromTask(task: BoardTask): TaskDraft {
  return {
    title: task.title,
    description: task.description,
    projectId: task.projectId,
    status: task.status,
    priority: task.priority,
    testDueDate: task.testDueDate,
    designDueDate: task.designDueDate,
    dueDate: task.dueDate,
    ownerUserId: task.ownerUserId,
    owner: task.owner,
    testerUserId: task.testerUserId,
    tester: task.tester,
    workloadDays: task.workloadDays === null || task.workloadDays === undefined ? "" : String(task.workloadDays),
    progress: task.progress,
    blockers: String(task.blockers ?? 0),
    blockedReason: task.blockedReason,
    tagsText: task.tags.join(" "),
  };
}

function TaskDrawer({
  task,
  projects,
  teams,
  columns,
  currentUser,
  editable,
  onSave,
  onInvalid,
  onRework,
  onDelete,
}: {
  task: BoardTask;
  projects: Project[];
  teams: BoardTeamOption[];
  columns: BoardData["columns"];
  currentUser: BoardData["currentUser"];
  editable: boolean;
  onSave: (patch: Partial<BoardTask>, subtasks: SubtaskDraft[]) => Promise<boolean>;
  onInvalid: (message: string, title?: string) => void;
  onRework: () => Promise<void>;
  onDelete: () => void;
}) {
  const [draft, setDraft] = useState<TaskDraft>(() => taskDraftFromTask(task));
  const [subtaskDrafts, setSubtaskDrafts] = useState<SubtaskDraft[]>(() => task.subtasks);
  const [newSubtaskTitle, setNewSubtaskTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [reworking, setReworking] = useState(false);
  const [editingSubtaskId, setEditingSubtaskId] = useState<string | null>(null);
  const [editingSubtaskTitle, setEditingSubtaskTitle] = useState("");
  const taskSubtasksRef = useRef(task.subtasks);
  const taskDraftSnapshot = useMemo<TaskDraft>(() => taskDraftFromTask(task), [task]);

  const taskMembers = membersForProject(projects, teams, draft.projectId);
  const taskProjectOptions = projects.map((project) => ({
    value: project.id,
    label: project.name,
    meta: project.owner,
  }));
  const taskColumnOptions = columns.map((column) => ({ value: column.id, label: column.title }));
  const taskPriorityOptions: SearchableSelectOption[] = [
    { value: "high", label: "高" },
    { value: "medium", label: "中" },
    { value: "low", label: "低" },
  ];
  const taskMemberOptions = taskMembers.map((member) => ({
    value: member.id,
    label: userName(member),
    meta: `@${member.username}`,
  }));
  const hasSubtasks = subtaskDrafts.length > 0;
  const effectiveProgress = hasSubtasks
    ? progressFromSubtasks(subtaskDrafts, draft.progress)
    : draft.progress;
  const subtaskResetKey = task.subtasks
    .map((step) => `${step.id}:${step.done ? 1 : 0}:${step.title}:${step.updatedAt}`)
    .join("|");

  useEffect(() => {
    taskSubtasksRef.current = task.subtasks;
  }, [task.subtasks]);

  useEffect(() => {
    setDraft(taskDraftSnapshot);
    setSubtaskDrafts(taskSubtasksRef.current);
    setNewSubtaskTitle("");
    setEditingSubtaskId(null);
    setEditingSubtaskTitle("");
  }, [subtaskResetKey, task.id, task.updatedAt, taskDraftSnapshot]);

  function commitSubtaskTitle(subtaskId: string, title: string) {
    if (!title.trim()) {
      setEditingSubtaskId(null);
      setEditingSubtaskTitle("");
      return;
    }
    setSubtaskDrafts((current) =>
      current.map((step) =>
        step.id === subtaskId
          ? { ...step, title: title.trim(), updatedAt: new Date().toISOString() }
          : step
      )
    );
    setEditingSubtaskId(null);
    setEditingSubtaskTitle("");
  }

  function addSubtask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!newSubtaskTitle.trim()) {
      return;
    }
    const now = new Date().toISOString();
    setSubtaskDrafts((current) => [
      ...current,
      {
        id: `draft-step-${task.id}-${Date.now()}-${current.length + 1}`,
        taskId: task.id,
        title: newSubtaskTitle.trim(),
        done: false,
        orderIndex: current.length * 10 + 10,
        createdAt: now,
        updatedAt: now,
      },
    ]);
    setNewSubtaskTitle("");
  }

  async function saveTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft.title.trim()) {
      onInvalid("请输入任务名称。", "无法保存任务");
      return;
    }
    if (!draft.description.trim()) {
      onInvalid("请输入任务描述。", "无法保存任务");
      return;
    }
    if (!draft.projectId) {
      onInvalid("请选择项目。", "无法保存任务");
      return;
    }
    const hasDraftAssignee = Boolean(draft.ownerUserId || draft.testerUserId);
    if (
      currentUser?.role === "team_member" &&
      hasDraftAssignee &&
      draft.ownerUserId !== currentUser.id &&
      draft.testerUserId !== currentUser.id
    ) {
      onInvalid("团队成员只能保存跟自己有关的任务", "无法保存任务");
      return;
    }

    setSaving(true);
    try {
      await onSave({
        title: draft.title,
        description: draft.description,
        projectId: draft.projectId,
        status: draft.status,
        priority: draft.priority,
        testDueDate: draft.testDueDate,
        designDueDate: draft.designDueDate,
        dueDate: draft.dueDate,
        ownerUserId: draft.ownerUserId,
        owner: draft.owner,
        testerUserId: draft.testerUserId,
        tester: draft.tester,
        workloadDays: normalizeWorkloadInput(draft.workloadDays),
        progress: effectiveProgress,
        blockers: Number(draft.blockers || 0),
        blockedReason: draft.blockedReason,
        tags: parseTags(draft.tagsText),
      }, subtaskDrafts);
    } finally {
      setSaving(false);
    }
  }

  async function handleRework() {
    setReworking(true);
    await onRework();
    setReworking(false);
  }

  return (
    <section className="space-y-5 pr-10">
      <div>
        <h2 className="text-base font-semibold">{editable ? "编辑任务信息" : "任务信息"}</h2>
      </div>

      <form id="task-edit-form" onSubmit={saveTask} className="flex flex-col gap-5">
        <fieldset disabled={!editable} className="flex flex-col gap-5">
          <Field label="任务名称" required>
            <input
              name="taskTitle"
              value={draft.title}
              onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
            />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="项目" required>
              <SearchableSelect
                value={draft.projectId}
                options={taskProjectOptions}
                onChange={(value) =>
                  setDraft((current) => ({
                    ...current,
                    projectId: value,
                    ownerUserId: "",
                    owner: "",
                    testerUserId: "",
                    tester: "",
                  }))
                }
                placeholder="选择项目"
              />
            </Field>
            <Field label="状态">
              <SearchableSelect
                value={draft.status}
                options={taskColumnOptions}
                onChange={(value) => setDraft((current) => ({ ...current, status: value as BoardStatus }))}
                placeholder="选择状态"
              />
            </Field>
            <Field label="优先级">
              <SearchableSelect
                value={draft.priority}
                options={taskPriorityOptions}
                onChange={(value) => setDraft((current) => ({ ...current, priority: value as Priority }))}
                placeholder="选择优先级"
              />
            </Field>
            <Field label="工作量（人日）">
              <input
                type="number"
                name="taskWorkloadDays"
                min="0.5"
                step="0.5"
                value={draft.workloadDays}
                onChange={(event) => setDraft((current) => ({ ...current, workloadDays: event.target.value }))}
                placeholder="不填按 1 人日计算"
              />
            </Field>
            <Field label="负责人">
              <SearchableSelect
                value={draft.ownerUserId}
                options={taskMemberOptions}
                onChange={(value) => {
                  const member = taskMembers.find((item) => item.id === value);
                  setDraft((current) => ({ ...current, ownerUserId: value, owner: userName(member) }));
                }}
                placeholder={draft.projectId ? "选择负责人" : "先选择项目"}
                clearable
                disabled={!draft.projectId}
              />
            </Field>
            <Field label="测试员">
              <SearchableSelect
                value={draft.testerUserId}
                options={taskMemberOptions}
                onChange={(value) => {
                  const member = taskMembers.find((item) => item.id === value);
                  setDraft((current) => ({ ...current, testerUserId: value, tester: userName(member) }));
                }}
                placeholder={draft.projectId ? "选择测试员" : "先选择项目"}
                clearable
                disabled={!draft.projectId}
              />
            </Field>
            <Field label="设计截止">
              <input
                name="taskDesignDueDate"
                type="date"
                value={draft.designDueDate}
                onChange={(event) => setDraft((current) => ({ ...current, designDueDate: event.target.value }))}
              />
            </Field>
            <Field label="提测日期">
              <input
                name="taskTestDueDate"
                type="date"
                value={draft.testDueDate}
                onChange={(event) => setDraft((current) => ({ ...current, testDueDate: event.target.value }))}
              />
            </Field>
            <Field label="交付日期">
              <input
                name="taskDueDate"
                type="date"
                value={draft.dueDate}
                onChange={(event) => setDraft((current) => ({ ...current, dueDate: event.target.value }))}
              />
            </Field>
          </div>

          <Field label="描述" required>
            <textarea
              name="taskDescription"
              value={draft.description}
              onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))}
              rows={7}
              className="min-h-[184px] resize-none leading-6"
            />
          </Field>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-4">
              <div className="text-sm font-medium leading-10 text-[var(--muted)]">{`进度 ${effectiveProgress}%`}</div>
              <label className="flex items-center gap-3 text-sm font-medium text-[var(--muted)]">
                <span className="shrink-0">阻塞项</span>
                <input
                  type="number"
                  name="taskBlockers"
                  min="0"
                  max="99"
                  value={draft.blockers}
                  onChange={(event) => setDraft((current) => ({ ...current, blockers: event.target.value }))}
                  className="h-10 w-24 rounded-md border border-[var(--border)] bg-[var(--input)] px-3 text-sm font-normal text-[var(--text)] outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)]"
                />
              </label>
            </div>
            <div>
              {hasSubtasks ? (
                <div className="h-2 overflow-hidden rounded-full bg-[var(--panel-soft)]">
                  <div className="h-full rounded-full bg-[var(--accent)] transition-all" style={{ width: `${effectiveProgress}%` }} />
                </div>
              ) : (
                <input
                  type="range"
                  name="taskProgress"
                  min="0"
                  max="100"
                  value={draft.progress}
                  onChange={(event) => setDraft((current) => ({ ...current, progress: Number(event.target.value) }))}
                  className="w-full accent-[var(--accent)]"
                />
              )}
            </div>
          </div>

          <Field label="阻塞说明">
            <input
              name="taskBlockedReason"
              value={draft.blockedReason}
              onChange={(event) => setDraft((current) => ({ ...current, blockedReason: event.target.value }))}
              placeholder="没有阻塞时可留空"
            />
          </Field>

          <Field label="标签">
            <input
              name="taskTags"
              value={draft.tagsText}
              onChange={(event) => setDraft((current) => ({ ...current, tagsText: event.target.value }))}
              placeholder="例如：接口 复盘 移动端"
            />
          </Field>
        </fieldset>
      </form>

      <section className="flex flex-col gap-4 border-t border-[var(--border)] pt-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">任务拆解</h2>
          {hasSubtasks ? (
            <span className="rounded-full bg-[var(--accent-soft)] px-2.5 py-0.5 text-xs font-semibold text-[var(--accent)]">
              {effectiveProgress}%
            </span>
          ) : null}
        </div>
        {hasSubtasks ? (
          <div className="h-2 overflow-hidden rounded-full bg-[var(--panel-soft)]">
            <div
              className="h-full rounded-full bg-[var(--accent)] transition-all"
              style={{ width: `${effectiveProgress}%` }}
            />
          </div>
        ) : null}
        <fieldset disabled={!editable} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            {subtaskDrafts.filter((s) => !s.done).map((step) => (
              <div key={step.id} className="flex items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--input)] px-3 py-2">
                <button
                  type="button"
                  onClick={() =>
                    setSubtaskDrafts((current) =>
                      current.map((item) =>
                        item.id === step.id
                          ? { ...item, done: true, updatedAt: new Date().toISOString() }
                          : item
                      )
                    )
                  }
                  className="grid h-5 w-5 shrink-0 place-items-center rounded-full border border-[var(--border)] transition hover:border-[var(--accent)]"
                >
                  <Check size={11} className="opacity-0" />
                </button>
                {editingSubtaskId === step.id ? (
                  <input
                    value={editingSubtaskTitle}
                    onChange={(e) => setEditingSubtaskTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") { commitSubtaskTitle(step.id, editingSubtaskTitle); }
                      if (e.key === "Escape") { setEditingSubtaskId(null); setEditingSubtaskTitle(""); }
                    }}
                    onBlur={() => commitSubtaskTitle(step.id, editingSubtaskTitle)}
                    autoFocus
                    className="flex-1 rounded border border-[var(--accent)] bg-[var(--input)] px-2 py-1 text-sm outline-none"
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => { setEditingSubtaskId(step.id); setEditingSubtaskTitle(step.title); }}
                    className="flex-1 rounded px-1 py-0.5 text-left text-sm transition hover:bg-[var(--panel-soft)]"
                  >
                    {step.title}
                  </button>
                )}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSubtaskDrafts((current) => current.filter((item) => item.id !== step.id));
                  }}
                  title="删除拆解"
                  className="shrink-0 rounded p-1 text-[var(--muted)] transition hover:bg-[var(--panel-soft)] hover:text-[var(--danger)]"
                >
                  <X size={13} />
                </button>
              </div>
            ))}
            {subtaskDrafts.filter((s) => s.done).map((step) => (
              <div key={step.id} className="flex items-center gap-2 rounded-md border border-[#c8d8bf] bg-[#edf6ea] px-3 py-2">
                <button
                  type="button"
                  onClick={() =>
                    setSubtaskDrafts((current) =>
                      current.map((item) =>
                        item.id === step.id
                          ? { ...item, done: false, updatedAt: new Date().toISOString() }
                          : item
                      )
                    )
                  }
                  className="grid h-5 w-5 shrink-0 place-items-center rounded-full border border-[#4f7a45] bg-[#4f7a45] text-white transition"
                >
                  <Check size={11} />
                </button>
                {editingSubtaskId === step.id ? (
                  <input
                    value={editingSubtaskTitle}
                    onChange={(e) => setEditingSubtaskTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") { commitSubtaskTitle(step.id, editingSubtaskTitle); }
                      if (e.key === "Escape") { setEditingSubtaskId(null); setEditingSubtaskTitle(""); }
                    }}
                    onBlur={() => commitSubtaskTitle(step.id, editingSubtaskTitle)}
                    autoFocus
                    className="flex-1 rounded border border-[var(--accent)] bg-white px-2 py-1 text-sm text-[#58704e] outline-none"
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => { setEditingSubtaskId(step.id); setEditingSubtaskTitle(step.title); }}
                    className="flex-1 rounded px-1 py-0.5 text-left text-sm text-[#58704e] line-through transition hover:bg-white/50"
                  >
                    {step.title}
                  </button>
                )}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSubtaskDrafts((current) => current.filter((item) => item.id !== step.id));
                  }}
                  title="删除拆解"
                  className="shrink-0 rounded p-1 text-[#6d8064] transition hover:bg-white/50 hover:text-[var(--danger)]"
                >
                  <X size={13} />
                </button>
              </div>
            ))}
          </div>
          <form onSubmit={addSubtask} className="grid grid-cols-[minmax(0,1fr)_42px] gap-2">
            <input
              value={newSubtaskTitle}
              name="newSubtaskTitle"
              onChange={(event) => setNewSubtaskTitle(event.target.value)}
              placeholder="添加新拆解项"
              className="h-11 rounded-md border border-[var(--border)] bg-[var(--input)] px-3 text-sm outline-none transition placeholder:text-[var(--muted)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)]"
            />
            <button type="submit" title="添加任务拆解" className="grid h-11 place-items-center rounded-md bg-[var(--accent)] text-white transition hover:bg-[var(--accent-hover)]">
              <Plus size={16} />
            </button>
          </form>
        </fieldset>
      </section>

      {editable ? (
        <div className={`mt-2 grid gap-3 border-t border-[var(--border)] pt-5 ${task.status === "done" ? "grid-cols-3" : "grid-cols-2"}`}>
          <button
            type="submit"
            form="task-edit-form"
            disabled={saving}
            className="flex items-center justify-center gap-2 rounded-md bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[var(--accent-hover)] disabled:opacity-60"
          >
            <CheckCircle2 size={16} />
            {saving ? "保存中" : "保存任务"}
          </button>
          {task.status === "done" ? (
            <button
              type="button"
              onClick={() => void handleRework()}
              disabled={reworking}
              className="flex items-center justify-center gap-2 rounded-md border border-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-[var(--accent)] transition hover:bg-[var(--accent-soft)] disabled:opacity-60"
            >
              <RotateCcw size={16} />
              {reworking ? "发起中" : "发起返工"}
            </button>
          ) : null}
          <button
            type="button"
            onClick={onDelete}
            className="flex items-center justify-center gap-2 rounded-md border border-[var(--danger)] px-4 py-2.5 text-sm font-semibold text-[var(--danger)] transition hover:bg-[var(--danger-soft)]"
          >
            <Trash2 size={16} />
            删除任务
          </button>
        </div>
      ) : (
        <div className="mt-2 border-t border-[var(--border)] pt-5 text-sm text-[var(--muted)]">当前任务仅可查看</div>
      )}
    </section>
  );
}

function ProjectDrawer({
  project,
  teams,
  draft,
  setDraft,
  editable,
  onSubmit,
  onArchive,
  onRestore,
  onDelete,
}: {
  project: Project | null;
  teams: BoardTeamOption[];
  draft: ProjectForm;
  setDraft: (draft: ProjectForm) => void;
  editable: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onArchive: (summary: string) => void;
  onRestore: () => void;
  onDelete: () => void;
}) {
  const teamOptions = teams.map((team) => ({
    value: team.id,
    label: team.name,
    meta: `${team.members.length} 人`,
  }));
  const projectMembers = membersForTeam(teams, draft.teamId);
  const ownerOptions = projectMembers.map((member) => ({
    value: member.id,
    label: userName(member),
    meta: `@${member.username}`,
  }));
  const healthOptions: SearchableSelectOption[] = [
    { value: "good", label: healthLabels.good },
    { value: "normal", label: healthLabels.normal },
    { value: "risk", label: healthLabels.risk },
  ];

  return (
    <section className="space-y-5 pr-10">
      <div>
        <h2 className="text-base font-semibold">{project ? (editable ? "项目修改" : "项目详情") : "创建项目"}</h2>
      </div>

      <form onSubmit={onSubmit} className="space-y-5">
        <fieldset disabled={!editable} className="space-y-5">
          <Field label="项目名称">
            <input name="projectName" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
          </Field>
          <Field label="项目描述">
            <textarea
              name="projectDescription"
              value={draft.description}
              onChange={(event) => setDraft({ ...draft, description: event.target.value })}
              rows={3}
              className="resize-none leading-6"
            />
          </Field>
          <Field label="团队">
            {teams.length > 0 ? (
              <div data-tour="kanban-project-team">
                <SearchableSelect
                  value={draft.teamId}
                  options={teamOptions}
                  onChange={(value) => setDraft({ ...draft, teamId: value, ownerUserId: "", owner: "" })}
                  placeholder="选择团队"
                  clearable
                />
              </div>
            ) : (
              <button type="button" onClick={() => window.location.assign("/admin")} className="h-10 w-full rounded-md border border-dashed border-[var(--border)] text-sm text-[var(--muted)]">
                创建团队
              </button>
            )}
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="负责人">
              <SearchableSelect
                value={draft.ownerUserId}
                options={ownerOptions}
                onChange={(value) => {
                  const member = projectMembers.find((item) => item.id === value);
                  setDraft({ ...draft, ownerUserId: value, owner: userName(member) });
                }}
                placeholder={draft.teamId ? "选择负责人" : "先选择团队"}
                clearable
                disabled={!draft.teamId}
              />
              {draft.teamId && ownerOptions.length === 0 ? (
                <span className="rounded-md border border-dashed border-[var(--border)] bg-[var(--panel-soft)] px-3 py-2 text-xs leading-5 text-[var(--muted)]">
                  当前团队没有可用成员，请先在后台管理维护团队成员。
                </span>
              ) : null}
            </Field>
            <Field label="健康度">
              <SearchableSelect
                value={draft.health}
                options={healthOptions}
                onChange={(value) => setDraft({ ...draft, health: value as ProjectHealth })}
                placeholder="选择健康度"
              />
            </Field>
          </div>
          <Field label="颜色">
            <input name="projectColor" type="color" value={draft.color} onChange={(event) => setDraft({ ...draft, color: event.target.value })} className="h-10 w-full" />
          </Field>
          <Field label="归档总结">
            <textarea
              name="projectSummary"
              value={draft.summary}
              onChange={(event) => setDraft({ ...draft, summary: event.target.value })}
              rows={4}
              placeholder="项目完成后记录结果、经验和后续建议"
              className="resize-none leading-6"
            />
          </Field>
        </fieldset>
        {editable ? (
          <button type="submit" data-tour="kanban-project-save" className="flex w-full items-center justify-center gap-2 rounded-md bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[var(--accent-hover)]">
            <CheckCircle2 size={16} />
            保存项目
          </button>
        ) : null}
      </form>

      {editable && project ? (
        <div className="grid grid-cols-2 gap-3 border-t border-[var(--border)] pt-4">
          {project.status === "archived" ? (
            <button type="button" onClick={onRestore} className="flex items-center justify-center gap-2 rounded-md border border-[var(--border)] px-4 py-2.5 text-sm transition hover:bg-[var(--panel-soft)]">
              <ArchiveRestore size={15} />
              恢复
            </button>
          ) : (
            <button type="button" onClick={() => onArchive(draft.summary)} className="flex items-center justify-center gap-2 rounded-md border border-[var(--border)] px-4 py-2.5 text-sm transition hover:bg-[var(--panel-soft)]">
              <Archive size={15} />
              归档
            </button>
          )}
          <button type="button" onClick={onDelete} className="flex items-center justify-center gap-2 rounded-md border border-[var(--danger)] px-4 py-2.5 text-sm font-semibold text-[var(--danger)] transition hover:bg-[var(--danger-soft)]">
            <Trash2 size={15} />
            删除
          </button>
        </div>
      ) : project ? (
        <div className="border-t border-[var(--border)] pt-4 text-sm text-[var(--muted)]">当前看板设置仅可查看</div>
      ) : null}
    </section>
  );
}

function SettingsDrawer({
  settings,
  onSave,
}: {
  settings: SystemSettings;
  onSave: (patch: SettingsPatch) => void;
}) {
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(settings.parameters.map((parameter) => [parameter.key, parameter.value]))
  );
  const [selectedKey, setSelectedKey] = useState(settings.parameters[0]?.key ?? "");
  const selectedParameter =
    settings.parameters.find((parameter) => parameter.key === selectedKey) ??
    settings.parameters[0] ??
    null;
  const parameterOptions: SearchableSelectOption[] = settings.parameters.map((parameter) => ({
    value: parameter.key,
    label: `${parameter.group} / ${parameter.label}`,
  }));

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedParameter) {
      return;
    }
    onSave({
      parameters: [
        {
          key: selectedParameter.key,
          value: values[selectedParameter.key] ?? selectedParameter.value,
        },
      ],
    });
  }

  return (
    <section className="space-y-5 pr-10">
      <div>
        <h2 className="text-base font-semibold">系统参数</h2>
      </div>

      <form onSubmit={submit} className="space-y-4">
        <div className="flex items-center gap-3">
          <span className="w-14 shrink-0 text-right text-sm text-[var(--muted)]">参数</span>
          <div className="flex-1">
            <SearchableSelect
              value={selectedParameter?.key ?? ""}
              options={parameterOptions}
              onChange={setSelectedKey}
              placeholder="选择参数"
            />
          </div>
        </div>

        {selectedParameter ? (
          <div className="flex items-center gap-3">
            <span className="w-14 shrink-0 text-right text-sm text-[var(--muted)]">{selectedParameter.label}</span>
            <div className="flex-1">
              {selectedParameter.valueType === "boolean" ? (
                <input
                  type="checkbox"
                  name={selectedParameter.key}
                  checked={(values[selectedParameter.key] ?? selectedParameter.value) === "true"}
                  onChange={(event) =>
                    setValues((current) => ({ ...current, [selectedParameter.key]: String(event.target.checked) }))
                  }
                  className="h-5 w-5 accent-[var(--accent)]"
                />
              ) : (
                <input
                  type={selectedParameter.valueType === "number" ? "number" : "text"}
                  name={selectedParameter.key}
                  min={selectedParameter.minValue ?? undefined}
                  max={selectedParameter.maxValue ?? undefined}
                  value={values[selectedParameter.key] ?? selectedParameter.value}
                  onChange={(event) =>
                    setValues((current) => ({ ...current, [selectedParameter.key]: event.target.value }))
                  }
                  className="w-full rounded-md border border-[var(--border)] bg-[var(--input)] px-2 py-2 text-sm"
                />
              )}
            </div>
          </div>
        ) : null}
        <button
          type="submit"
          className="flex w-full items-center justify-center gap-2 rounded-md bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[var(--accent-hover)]"
        >
          <CheckCircle2 size={16} />
          保存参数
        </button>
      </form>
    </section>
  );
}

function ActivityPanel({
  activity,
  projects,
  tasks,
  expanded,
  onOpen,
}: {
  activity: ActivityLog[];
  projects: Project[];
  tasks: BoardTask[];
  expanded?: boolean;
  onOpen?: () => void;
}) {
  return (
    <section className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
        <div className="flex items-center gap-2">
          <Activity size={16} />
          <h2 className="text-sm font-semibold">活动记录</h2>
        </div>
        {onOpen ? (
          <button type="button" title="打开活动抽屉" onClick={onOpen} className="rounded-md p-2 hover:bg-[var(--panel-soft)]">
            <PanelRightOpen size={15} />
          </button>
        ) : null}
      </div>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
        {activity.slice(0, expanded ? 80 : 18).map((item) => {
          const project = item.projectId ? projects.find((candidate) => candidate.id === item.projectId) : null;
          const task = item.taskId ? tasks.find((candidate) => candidate.id === item.taskId) : null;
          const changes = summarizeActivityChanges(item.meta);
          return (
            <div key={item.id} className="border-l-2 border-[var(--accent)] pl-3">
              <p className="text-sm leading-5 text-[var(--text)]">{item.message}</p>
              {changes.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {changes.map((change) => (
                    <span key={`${item.id}-${change.label}`} className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] bg-[var(--panel-soft)] px-2 py-1 text-[11px] text-[var(--muted)]">
                      <strong className="font-semibold text-[var(--text)]">{change.label}</strong>
                      <span className="text-[var(--muted)]">{change.before}</span>
                      <span className="text-[var(--accent)]">→</span>
                      <span className="text-[var(--text)]">{change.after}</span>
                    </span>
                  ))}
                </div>
              ) : null}
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[var(--muted)]">
                <span>{formatActivityTime(item.createdAt)}</span>
                {project ? <span>{project.name}</span> : null}
                {task ? <span>{task.title}</span> : null}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

const ownerColors = [
  "bg-[#dbeafe] text-[#1e40af]",
  "bg-[#dcfce7] text-[#166534]",
  "bg-[#fce7f3] text-[#9d174d]",
  "bg-[#fef3c7] text-[#92400e]",
  "bg-[#e0e7ff] text-[#3730a3]",
  "bg-[#ccfbf1] text-[#134e4a]",
  "bg-[#ffe4e6] text-[#9f1239]",
  "bg-[#f0fdf4] text-[#14532d]",
];

function ownerColor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return ownerColors[Math.abs(hash) % ownerColors.length];
}

function OwnerTag({ name }: { name: string }) {
  return (
    <span className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-medium ${ownerColor(name)}`}>
      {name}
    </span>
  );
}

function RequiredMark() {
  return <span className="ml-1 font-semibold text-[var(--danger)]">*</span>;
}

function TaskCreateDialog({
  open,
  newTask,
  newTaskProjectId,
  newTaskMembers,
  newTaskMemberOptions,
  activeProjectOptions,
  priorityOptions,
  canManageProjects,
  onClose,
  onOpenProjectCreate,
  onSubmit,
  onChange,
}: {
  open: boolean;
  newTask: NewTaskForm;
  newTaskProjectId: string;
  newTaskMembers: BoardUserOption[];
  newTaskMemberOptions: SearchableSelectOption[];
  activeProjectOptions: SearchableSelectOption[];
  priorityOptions: SearchableSelectOption[];
  canManageProjects: boolean;
  onClose: () => void;
  onOpenProjectCreate: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  onChange: Dispatch<SetStateAction<NewTaskForm>>;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[84] flex items-center justify-center bg-black/40 px-4 py-6" onClick={onClose}>
      <div
        data-tour="kanban-create-task-dialog"
        className="flex max-h-[calc(100vh-32px)] w-full max-w-[760px] flex-col overflow-hidden rounded-[28px] border border-[var(--border)] bg-[var(--panel)] shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[var(--border)] px-6 py-5">
          <div>
            <h2 className="text-xl font-semibold text-[var(--text)]">新建任务卡</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-[var(--border)] bg-[var(--panel)] p-2 text-[var(--muted)] transition hover:bg-[var(--panel-soft)] hover:text-[var(--text)]"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={(event) => void onSubmit(event)} className="min-h-0 overflow-y-auto px-6 py-5">
          <div className="grid gap-4">
            <label className="grid gap-1.5 text-sm text-[var(--muted)]">
              <span>任务名称<RequiredMark /></span>
              <input
                name="newTaskTitle"
                value={newTask.title}
                onChange={(event) => onChange((current) => ({ ...current, title: event.target.value }))}
                placeholder="输入任务名称"
                className="w-full rounded-md border border-[var(--border)] bg-[var(--input)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)]"
              />
            </label>
            <label className="grid gap-1.5 text-sm text-[var(--muted)]">
              <span>任务描述<RequiredMark /></span>
              <textarea
                name="newTaskDescription"
                value={newTask.description}
                onChange={(event) => onChange((current) => ({ ...current, description: event.target.value }))}
                placeholder="输入任务描述"
                rows={5}
                className="min-h-[136px] w-full resize-none rounded-md border border-[var(--border)] bg-[var(--input)] px-3 py-2 text-sm leading-6 outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)]"
              />
            </label>
            <div className="grid gap-1.5 text-sm text-[var(--muted)]">
              <span>项目<RequiredMark /></span>
              {activeProjectOptions.length > 0 ? (
                <SearchableSelect
                  value={newTaskProjectId || activeProjectOptions[0]?.value || ""}
                  options={activeProjectOptions}
                  onChange={(value) =>
                    onChange((current) => ({
                      ...current,
                      projectId: value,
                      ownerUserId: "",
                      owner: "",
                      testerUserId: "",
                      tester: "",
                    }))
                  }
                  placeholder="选择项目"
                />
              ) : canManageProjects ? (
                <button
                  type="button"
                  onClick={onOpenProjectCreate}
                  className="h-10 w-full rounded-md border border-dashed border-[var(--border)] bg-[var(--panel)] text-sm text-[var(--muted)] transition hover:border-[var(--accent)] hover:text-[var(--text)]"
                >
                  创建项目
                </button>
              ) : (
                <div className="grid h-10 place-items-center rounded-md border border-dashed border-[var(--border)] bg-[var(--panel)] text-sm text-[var(--muted)]">
                  暂无可选项目
                </div>
              )}
              {newTaskProjectId && newTaskMemberOptions.length === 0 ? (
                <div className="rounded-md border border-dashed border-[var(--border)] bg-[var(--panel)] px-3 py-3 text-xs leading-5 text-[var(--muted)]">
                  当前项目没有可用团队成员，可先创建任务，稍后在后台管理维护团队成员。
                </div>
              ) : null}
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <SearchableSelect
                value={newTask.ownerUserId}
                options={newTaskMemberOptions}
                onChange={(value) => {
                  const member = newTaskMembers.find((item) => item.id === value);
                  onChange((current) => ({ ...current, ownerUserId: value, owner: userName(member) }));
                }}
                placeholder={newTaskProjectId ? "负责人" : "先选择项目"}
                clearable
                disabled={!newTaskProjectId}
              />
              <SearchableSelect
                value={newTask.testerUserId}
                options={newTaskMemberOptions}
                onChange={(value) => {
                  const member = newTaskMembers.find((item) => item.id === value);
                  onChange((current) => ({ ...current, testerUserId: value, tester: userName(member) }));
                }}
                placeholder={newTaskProjectId ? "测试员" : "先选择项目"}
                clearable
                disabled={!newTaskProjectId}
              />
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <SearchableSelect
                value={newTask.priority}
                options={priorityOptions}
                onChange={(value) => onChange((current) => ({ ...current, priority: value as Priority }))}
                placeholder="优先级"
              />
              <input
                name="newTaskWorkloadDays"
                type="number"
                min="0.5"
                step="0.5"
                value={newTask.workloadDays}
                onChange={(event) => onChange((current) => ({ ...current, workloadDays: event.target.value }))}
                placeholder="工作量（人日）"
                className="h-10 w-full rounded-md border border-[var(--border)] bg-[var(--input)] px-3 text-sm text-[var(--text)] outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)]"
              />
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <label className="grid gap-1.5 text-sm text-[var(--muted)]">
                <span>设计截止</span>
                <input
                  name="newTaskDesignDueDate"
                  type="date"
                  value={newTask.designDueDate}
                  onChange={(event) => onChange((current) => ({ ...current, designDueDate: event.target.value }))}
                  className="w-full rounded-md border border-[var(--border)] bg-[var(--input)] px-3 py-2 text-sm text-[var(--text)]"
                />
              </label>
              <label className="grid gap-1.5 text-sm text-[var(--muted)]">
                <span>提测日期</span>
                <input
                  name="newTaskTestDueDate"
                  type="date"
                  value={newTask.testDueDate}
                  onChange={(event) => onChange((current) => ({ ...current, testDueDate: event.target.value }))}
                  className="w-full rounded-md border border-[var(--border)] bg-[var(--input)] px-3 py-2 text-sm text-[var(--text)]"
                />
              </label>
              <label className="grid gap-1.5 text-sm text-[var(--muted)]">
                <span>交付日期</span>
                <input
                  name="newTaskDueDate"
                  type="date"
                  value={newTask.dueDate}
                  onChange={(event) => onChange((current) => ({ ...current, dueDate: event.target.value }))}
                  className="w-full rounded-md border border-[var(--border)] bg-[var(--input)] px-3 py-2 text-sm text-[var(--text)]"
                />
              </label>
            </div>

            <label className="grid gap-1.5 text-sm text-[var(--muted)]">
              <span>标签</span>
              <input
                name="newTaskTags"
                value={newTask.tags}
                onChange={(event) => onChange((current) => ({ ...current, tags: event.target.value }))}
                placeholder="用空格或逗号分隔"
                className="w-full rounded-md border border-[var(--border)] bg-[var(--input)] px-3 py-2 text-sm text-[var(--text)] outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)]"
              />
            </label>
          </div>

          <div className="mt-5 flex items-center justify-end gap-3 border-t border-[var(--border)] pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-[var(--border)] px-4 py-2 text-sm font-semibold text-[var(--text)] transition hover:bg-[var(--panel-soft)]"
            >
              取消
            </button>
            <button
              type="submit"
              className="inline-flex items-center gap-2 rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[var(--accent-hover)]"
            >
              <Plus size={15} />
              创建任务
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ImportTaskDialog({
  importing,
  onImport,
  onDownloadTemplate,
  onClose,
}: {
  importing: boolean;
  onImport: (file: File) => Promise<void>;
  onDownloadTemplate: () => void;
  onClose: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const importBusy = importing || busy;

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setError("");
    setBusy(true);
    try {
      await onImport(file);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "导入失败，请检查文件格式是否正确。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="w-full max-w-[420px] rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-[var(--text)]">导入任务</h2>
          <button type="button" onClick={onClose} className="cursor-pointer rounded-md p-1.5 text-[var(--muted)] transition hover:bg-[var(--panel-soft)] hover:text-[var(--text)]">
            <X size={18} />
          </button>
        </div>

        <div className="mt-5 space-y-4">
          <div
            className={`cursor-pointer rounded-xl border-2 border-dashed p-8 text-center transition ${
              dragOver ? "border-[var(--accent)] bg-[var(--accent-soft)]" : "border-[var(--border)] hover:border-[var(--accent)]/40"
            }`}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => { e.preventDefault(); setDragOver(false); if (!importBusy) handleFile(e.dataTransfer.files?.[0]); }}
            onClick={() => { if (!importBusy) fileRef.current?.click(); }}
          >
            <Upload size={32} className="mx-auto text-[var(--muted)]" />
            <p className="mt-3 text-sm text-[var(--muted)]">
              点击上传或拖拽 Excel 文件到此处
            </p>
            <p className="mt-1 text-xs text-[var(--muted)]/60">支持 .xlsx / .xls 格式</p>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              disabled={importBusy}
              onChange={(e) => handleFile(e.target.files?.[0])}
            />
          </div>

          {error ? (
            <div className="whitespace-pre-line rounded-lg border border-[var(--danger)] bg-[var(--danger-soft)] px-4 py-3 text-sm text-[var(--danger)]">{error}</div>
          ) : null}

          <div className="flex items-center gap-2 rounded-lg bg-[var(--panel-soft)] px-4 py-3">
            <FileSpreadsheet size={18} className="shrink-0 text-[var(--accent)]" />
            <div className="min-w-0 flex-1">
              <p className="text-sm text-[var(--text)]">还没准备数据？</p>
              <p className="text-xs text-[var(--muted)]">下载模板，按格式填写后上传即可</p>
            </div>
            <button
              type="button"
              onClick={onDownloadTemplate}
              disabled={importBusy}
              className="shrink-0 rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[var(--accent-hover)]"
            >
              下载模板
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ChangelogDialog({
  appVersion,
  entries,
  onClose,
}: {
  appVersion: string;
  entries: ChangelogEntry[];
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[85] flex items-center justify-center bg-black/40 px-4 py-6" onClick={onClose}>
      <div
        className="flex max-h-[min(84vh,860px)] w-full max-w-[820px] flex-col overflow-hidden rounded-3xl border border-[var(--border)] bg-[var(--panel)] shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-[var(--border)] px-6 py-5">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center rounded-full border border-[var(--accent)]/20 bg-[var(--accent-soft)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--accent)]">
                版本记录
              </span>
              <span className="inline-flex items-center rounded-full border border-[var(--border)] bg-[var(--card-section)] px-2.5 py-1 text-xs font-semibold text-[var(--muted)]">
                当前 {appVersion}
              </span>
            </div>
            <h2 className="mt-3 text-xl font-semibold text-[var(--text)]">Changelog</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl border border-[var(--border)] bg-[var(--panel-soft)] text-[var(--muted)] transition hover:bg-[var(--card-section)] hover:text-[var(--text)]"
          >
            <X size={18} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          <div className="space-y-4">
            {entries.map((entry) => (
              <section key={`${entry.version}-${entry.date}`} className="rounded-2xl border border-[var(--border)] bg-[var(--panel-soft)] p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="text-base font-semibold text-[var(--text)]">{entry.version}</h3>
                    {entry.date ? <p className="mt-1 text-xs text-[var(--muted)]">{entry.date}</p> : null}
                  </div>
                  {entry.version === appVersion || entry.version === appVersion.replace(/@.+$/, "") ? (
                    <span className="inline-flex items-center rounded-full border border-[var(--accent)]/20 bg-[var(--accent-soft)] px-2.5 py-1 text-xs font-semibold text-[var(--accent)]">
                      当前版本
                    </span>
                  ) : null}
                </div>
                <ul className="mt-3 space-y-2">
                  {entry.items.map((item, index) => (
                    <li key={`${entry.version}-${index}`} className="flex items-start gap-2 text-sm leading-6 text-[var(--text)]">
                      <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--accent)] opacity-80" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}



function Field({ label, children, required = false }: { label: string; children: ReactNode; required?: boolean }) {
  return (
    <label className="flex flex-col gap-1.5 text-sm text-[var(--muted)] [&>input]:w-full [&>input]:rounded-md [&>input]:border [&>input]:border-[var(--border)] [&>input]:bg-[var(--input)] [&>input]:px-2 [&>input]:py-2 [&>input]:text-sm [&>input]:leading-5 [&>input]:text-[var(--text)] [&>input::placeholder]:text-sm [&>input::placeholder]:leading-5 [&>input::placeholder]:text-[var(--muted)] [&>input::placeholder]:opacity-50 [&>select]:w-full [&>select]:rounded-md [&>select]:border [&>select]:border-[var(--border)] [&>select]:bg-[var(--input)] [&>select]:px-2 [&>select]:py-2 [&>select]:text-sm [&>select]:leading-5 [&>select]:text-[var(--text)] [&>textarea]:w-full [&>textarea]:rounded-md [&>textarea]:border [&>textarea]:border-[var(--border)] [&>textarea]:bg-[var(--input)] [&>textarea]:px-2 [&>textarea]:py-2 [&>textarea]:text-sm [&>textarea]:leading-5 [&>textarea]:text-[var(--text)] [&>textarea::placeholder]:text-sm [&>textarea::placeholder]:leading-5 [&>textarea::placeholder]:text-[var(--muted)] [&>textarea::placeholder]:opacity-50">
      <span>{label}{required ? <RequiredMark /> : null}</span>
      {children}
    </label>
  );
}
