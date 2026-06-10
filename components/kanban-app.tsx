"use client";

import {
  closestCenter,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MeasuringStrategy,
  PointerSensor,
  TouchSensor,
  pointerWithin,
  useDroppable,
  useSensor,
  useSensors,
  type Collision,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type DraggableAttributes,
  type DraggableSyntheticListeners,
  type Over,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS as SortableCSS } from "@dnd-kit/utilities";
import {
  Activity,
  Archive,
  ArchiveRestore,
  Check,
  CheckCircle2,
  Copyright,
  Edit3,
  FolderPlus,
  GripVertical,
  PanelRightOpen,
  Plus,
  Search,
  SlidersHorizontal,
  Tag,
  Trash2,
  X,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
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
  type Priority,
  type Project,
  type ProjectHealth,
  type Subtask,
  type SystemSettings,
} from "@/lib/board-data";

type SyncState = "synced" | "syncing" | "local";
type DrawerMode = "task" | "project" | "activity" | "settings" | null;
type ThemeId = "linear" | "github" | "notion" | "atlassian";
type DragTargetData =
  | { type: "task"; status: BoardStatus }
  | { type: "column"; status: BoardStatus }
  | { type: "trash" };

type NewTaskForm = {
  title: string;
  description: string;
  projectId: string;
  owner: string;
  priority: Priority;
  testDueDate: string;
  dueDate: string;
  tags: string;
};

type ProjectForm = {
  name: string;
  description: string;
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

const defaultStatusNames: Record<BoardStatus, string> = {
  backlog: "需求池",
  dev: "开发中",
  test: "测试中",
  done: "已完成",
};

const statusOrder: BoardStatus[] = ["backlog", "dev", "test", "done"];

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
];

const fallbackProject: Project = {
  id: "unassigned",
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
    .split(/[,\s，、]+/)
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
  const testDays = daysUntil(task.testDueDate, todayKey);
  const deliveryDays = daysUntil(task.dueDate, todayKey);
  const testLateDaysAfterCompletion = lateDaysByCompletion(task.testDueDate, task.completedAt);
  const deliveryLateDaysAfterCompletion = lateDaysByCompletion(task.dueDate, task.completedAt);

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

function statusNameMap(columns: BoardData["columns"]) {
  return Object.fromEntries(
    statusOrder.map((status) => [
      status,
      columns.find((column) => column.id === status)?.title ?? defaultStatusNames[status],
    ])
  ) as Record<BoardStatus, string>;
}

function projectById(projects: Project[], projectId: string) {
  return (
    projects.find((project) => project.id === projectId) ??
    projects[0] ??
    fallbackProject
  );
}

function firstProjectId(projects: Project[]) {
  return projects.find((project) => project.status === "active")?.id ?? projects[0]?.id ?? "";
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

function isThemeId(value: unknown): value is ThemeId {
  return value === "linear" || value === "github" || value === "notion" || value === "atlassian";
}

function dragTargetData(over: Over | null): DragTargetData | null {
  const data = over?.data.current as DragTargetData | undefined;
  return data ?? null;
}

function collisionTargetData(
  droppableContainers: Parameters<CollisionDetection>[0]["droppableContainers"],
  collision: Collision
): DragTargetData | null {
  const container = droppableContainers.find((item) => item.id === collision.id);
  return (container?.data.current as DragTargetData | undefined) ?? null;
}

const kanbanCollisionDetection: CollisionDetection = (args) => {
  const pointerHits = pointerWithin(args);

  for (const targetType of ["trash", "task", "column"] as const) {
    const hit = pointerHits.find(
      (collision) => collisionTargetData(args.droppableContainers, collision)?.type === targetType
    );
    if (hit) {
      return [hit];
    }
  }

  return closestCenter(args);
};

function statusFromOver(tasks: BoardTask[], over: Over | null) {
  const data = dragTargetData(over);
  if (!data || data.type === "trash") {
    return null;
  }

  if (data.type === "column") {
    return data.status;
  }

  const overTask = typeof over?.id === "string"
    ? tasks.find((task) => task.id === over.id)
    : null;
  return overTask?.status ?? data.status;
}

function applyDndGroups(tasks: BoardTask[], groups: Map<BoardStatus, BoardTask[]>) {
  const updates = new Map<string, BoardTask>();
  for (const [status, group] of groups.entries()) {
    group.forEach((task, index) => {
      updates.set(task.id, {
        ...task,
        status,
        orderIndex: (index + 1) * 10,
      });
    });
  }

  let changed = false;
  const nextTasks = tasks.map((task) => {
    const nextTask = updates.get(task.id) ?? task;
    if (nextTask.status !== task.status || nextTask.orderIndex !== task.orderIndex) {
      changed = true;
    }
    return nextTask;
  });

  return changed ? nextTasks : tasks;
}

function withDndFinalOrder(tasks: BoardTask[], taskId: string, over: Over | null) {
  const moving = tasks.find((task) => task.id === taskId);
  if (!moving) {
    return tasks;
  }

  const targetStatus = statusFromOver(tasks, over);
  if (!targetStatus) {
    return tasks;
  }

  if (moving.status === targetStatus) {
    const data = dragTargetData(over);
    const overTaskId = data?.type === "task" && typeof over?.id === "string" ? over.id : null;
    if (!overTaskId || overTaskId === taskId) {
      return tasks;
    }

    const ordered = sortTasks(tasks.filter((task) => task.status === targetStatus));
    const movingIndex = ordered.findIndex((task) => task.id === taskId);
    const overIndex = ordered.findIndex((task) => task.id === overTaskId);

    if (movingIndex < 0 || overIndex < 0 || movingIndex === overIndex) {
      return tasks;
    }

    const groups = new Map<BoardStatus, BoardTask[]>();
    groups.set(targetStatus, arrayMove(ordered, movingIndex, overIndex));
    return applyDndGroups(tasks, groups);
  }

  const groups = new Map<BoardStatus, BoardTask[]>();
  groups.set(
    moving.status,
    sortTasks(tasks.filter((task) => task.status === moving.status && task.id !== taskId))
  );
  groups.set(
    targetStatus,
    [
      ...sortTasks(tasks.filter((task) => task.status === targetStatus && task.id !== taskId)),
      { ...moving, status: targetStatus },
    ]
  );
  return applyDndGroups(tasks, groups);
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
  const response = await fetch(url, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(payload.error ?? "Request failed");
  }

  return (await response.json()) as T;
}

export default function KanbanApp({
  initialBoard,
  todayKey,
}: {
  initialBoard: BoardData;
  todayKey: string;
}) {
  const [board, setBoard] = useState(initialBoard);
  const [, setSyncState] = useState<SyncState>("syncing");
  const [search, setSearch] = useState("");
  const [projectFilter, setProjectFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState<Priority | "all">("all");
  const [tagFilters, setTagFilters] = useState<string[]>([]);
  const [tagSearch, setTagSearch] = useState("");
  const [dragOverColumn, setDragOverColumn] = useState<BoardStatus | null>(null);
  const [themeId, setThemeId] = useState<ThemeId>(() => {
    if (typeof window === "undefined") {
      return "notion";
    }
    const savedTheme = window.localStorage.getItem("kanban-theme");
    return isThemeId(savedTheme) ? savedTheme : "notion";
  });
  const [drawerMode, setDrawerMode] = useState<DrawerMode>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
    initialBoard.projects[0]?.id ?? null
  );
  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null);
  const [trashArmed, setTrashArmed] = useState(false);
  const [newSubtaskTitle, setNewSubtaskTitle] = useState("");
  const [toasts, setToasts] = useState<Toast[]>([]);
  const localIdCounter = useRef(0);
  const dragOriginRef = useRef<{ taskId: string; status: BoardStatus } | null>(null);
  const dragStartTasksRef = useRef<BoardTask[] | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 120, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );
  const [newTask, setNewTask] = useState<NewTaskForm>({
    title: "",
    description: "",
    projectId: initialBoard.projects.find((project) => project.status === "active")?.id ?? "",
    owner: "",
    priority: "medium",
    testDueDate: "",
    dueDate: "",
    tags: "",
  });
  const [projectDraft, setProjectDraft] = useState<ProjectForm>({
    name: "",
    description: "",
    owner: "",
    color: "#1f6f68",
    health: "normal",
    summary: "",
  });

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

    fetch("/api/board")
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

  const activeProjects = useMemo(
    () => board.projects.filter((project) => project.status === "active"),
    [board.projects]
  );
  const isLocalPreview = board.storageMode === "local";
  const settings = board.settings ?? defaultSystemSettings;
  const dueSoonDays = settings.dueSoonDays;
  const statusLabels = useMemo(() => statusNameMap(board.columns), [board.columns]);
  const archivedProjects = useMemo(
    () => board.projects.filter((project) => project.status === "archived"),
    [board.projects]
  );
  const selectedTask = selectedTaskId
    ? board.tasks.find((task) => task.id === selectedTaskId) ?? null
    : null;
  const selectedProject = selectedProjectId
    ? board.projects.find((project) => project.id === selectedProjectId) ?? null
    : null;
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
    const query = search.trim().toLowerCase();
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
        task.title.toLowerCase().includes(query) ||
        task.description.toLowerCase().includes(query) ||
        task.owner.toLowerCase().includes(query) ||
        task.tags.some((tag) => tag.toLowerCase().includes(query));

      return (
        activeProjectIds.has(project.id) &&
        matchesProject &&
        matchesPriority &&
        matchesTag &&
        matchesSearch
      );
    });
  }, [activeProjects, board.projects, board.tasks, priorityFilter, projectFilter, search, tagFilters]);

  const metrics = useMemo(() => {
    const activeProjectIds = new Set(activeProjects.map((project) => project.id));
    const activeTasks = board.tasks.filter((task) => activeProjectIds.has(task.projectId));
    const blocked = activeTasks.filter((task) => task.blockers > 0);
    const dueSoon = activeTasks.filter((task) => task.status !== "done" && taskHasDueSoonAlert(task, todayKey, dueSoonDays));
    const completed = activeTasks.filter((task) => task.status === "done");

    return {
      projects: activeProjects.length,
      active: activeTasks.filter((task) => task.status !== "done").length,
      dueSoon: dueSoon.length,
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
      owner: project?.owner ?? "",
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

    if (selectedProject) {
      await persistProject(selectedProject.id, projectDraft, "项目已保存");
      return;
    }

    const optimistic: Project = {
      id: nextLocalId("local-project"),
      name: projectDraft.name.trim(),
      description: projectDraft.description.trim(),
      owner: projectDraft.owner.trim() || "未分配",
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

  async function removeProject(projectId: string) {
    const project = board.projects.find((item) => item.id === projectId);
    if (!project || !window.confirm(`删除项目「${project.name}」及其任务？`)) {
      return;
    }

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

  async function persistTask(taskId: string, patch: Partial<BoardTask>) {
    const previous = board.tasks.find((task) => task.id === taskId);
    setBoard((current) => ({
      ...current,
      tasks: current.tasks.map((task) =>
        task.id === taskId
          ? { ...task, ...patch, updatedAt: new Date().toISOString() }
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
      const saved = await apiRequest<BoardTask>(`/api/tasks/${taskId}`, "PATCH", patch);
      setBoard((current) => ({
        ...current,
        tasks: current.tasks.map((task) => (task.id === taskId ? saved : task)),
      }));
      await refreshBoard();
      notify("任务已保存");
      return true;
    } catch {
      appendLocalActivity(
        `更新任务「${patch.title ?? previous?.title ?? "未命名任务"}」。`
      );
      setSyncState("local");
      notify("任务保存失败", "error");
      return false;
    }
  }

  async function createTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const projectId = newTask.projectId || firstProjectId(activeProjectChoices);
    if (!newTask.title.trim() || !projectId) {
      return;
    }

    const optimistic: BoardTask = {
      id: nextLocalId("local-task"),
      projectId,
      title: newTask.title.trim(),
      description: newTask.description.trim(),
      status: "backlog",
      priority: newTask.priority,
      owner: newTask.owner.trim() || "未分配",
      startDate: "",
      testDueDate: newTask.testDueDate,
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
      testDueDate: "",
      dueDate: "",
      tags: "",
    }));
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
        owner: newTask.owner,
        priority: newTask.priority,
        testDueDate: newTask.testDueDate,
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
      notify("任务已删除");
    } catch {
      appendLocalActivity(`删除任务「${task.title}」。`);
      setSyncState("local");
      notify("任务删除失败", "error");
    }
  }

  function handleDragStart(event: DragStartEvent) {
    const taskId = String(event.active.id);
    const task = board.tasks.find((item) => item.id === taskId);
    if (!task) {
      return;
    }

    dragOriginRef.current = { taskId, status: task.status };
    dragStartTasksRef.current = board.tasks;
    setDraggingTaskId(taskId);
  }

  function handleDragOver(event: DragOverEvent) {
    setTrashArmed(dragTargetData(event.over)?.type === "trash");
    const origin = dragOriginRef.current;
    const targetStatus = statusFromOver(board.tasks, event.over);
    if (origin && targetStatus && targetStatus !== origin.status) {
      setDragOverColumn(targetStatus);
    } else {
      setDragOverColumn(null);
    }
  }

  function clearDragState(restore = false) {
    if (restore && dragStartTasksRef.current) {
      setBoard((current) => ({ ...current, tasks: dragStartTasksRef.current ?? current.tasks }));
    }
    setDraggingTaskId(null);
    setTrashArmed(false);
    setDragOverColumn(null);
    dragOriginRef.current = null;
    dragStartTasksRef.current = null;
  }

  function handleDragCancel() {
    clearDragState(true);
  }

  async function handleDragEnd(event: DragEndEvent) {
    const taskId = String(event.active.id);
    const targetData = dragTargetData(event.over);

    if (targetData?.type === "trash") {
      await removeTask(taskId);
      clearDragState();
      return;
    }

    const baseTasks = dragStartTasksRef.current ?? board.tasks;
    const finalTasks = withDndFinalOrder(baseTasks, taskId, event.over);
    if (sameTaskOrder(baseTasks, finalTasks)) {
      clearDragState();
      return;
    }

    setBoard((current) => ({ ...current, tasks: finalTasks }));
    await persistCurrentOrder(finalTasks);
    clearDragState();
  }

  async function persistCurrentOrder(tasksToPersist = board.tasks) {
    const origin = dragOriginRef.current;
    const currentTask = origin
      ? tasksToPersist.find((task) => task.id === origin.taskId)
      : null;
    const statusChanged = Boolean(origin && currentTask && currentTask.status !== origin.status);

    setSyncState("syncing");
    if (isLocalPreview) {
      if (statusChanged && currentTask && origin) {
        appendLocalActivity(
          `移动任务「${currentTask.title}」：${statusLabels[origin.status]} → ${statusLabels[currentTask.status]}。`,
          "task"
        );
      }
      setSyncState("local");
      return;
    }

    try {
      await apiRequest("/api/tasks/reorder", "POST", {
        updates: taskUpdates(tasksToPersist),
      });
      await refreshBoard();
    } catch {
      if (statusChanged && currentTask && origin) {
        appendLocalActivity(
          `移动任务「${currentTask.title}」：${statusLabels[origin.status]} → ${statusLabels[currentTask.status]}。`,
          "task"
        );
      }
      setSyncState("local");
    }
  }

  async function createSubtask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedTask || !newSubtaskTitle.trim()) {
      return;
    }

    const optimistic: Subtask = {
      id: nextLocalId("local-step"),
      taskId: selectedTask.id,
      title: newSubtaskTitle.trim(),
      done: false,
      orderIndex: selectedTask.subtasks.length * 10 + 10,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    setNewSubtaskTitle("");
    setBoard((current) => ({
      ...current,
      tasks: current.tasks.map((task) =>
        task.id === selectedTask.id
          ? { ...task, subtasks: [...task.subtasks, optimistic] }
          : task
      ),
    }));

    if (isLocalPreview) {
      appendLocalActivity(`添加任务拆解「${optimistic.title}」。`, "subtask");
      setSyncState("local");
      return;
    }

    try {
      const saved = await apiRequest<Subtask>(
        `/api/tasks/${selectedTask.id}/subtasks`,
        "POST",
        { title: optimistic.title }
      );
      setBoard((current) => ({
        ...current,
        tasks: current.tasks.map((task) =>
          task.id === selectedTask.id
            ? {
                ...task,
                subtasks: task.subtasks.map((step) =>
                  step.id === optimistic.id ? saved : step
                ),
              }
            : task
        ),
      }));
      await refreshBoard(false);
    } catch {
      appendLocalActivity(`添加任务拆解「${optimistic.title}」。`, "subtask");
      setSyncState("local");
    }
  }

  async function toggleSubtask(taskId: string, subtask: Subtask) {
    setBoard((current) => ({
      ...current,
      tasks: current.tasks.map((task) => {
        if (task.id !== taskId) {
          return task;
        }
        const subtasks = task.subtasks.map((step) =>
          step.id === subtask.id
            ? { ...step, done: !step.done, updatedAt: new Date().toISOString() }
            : step
        );
        return {
          ...task,
          subtasks,
          progress: progressFromSubtasks(subtasks, task.progress),
          updatedAt: new Date().toISOString(),
        };
      }),
    }));

    if (isLocalPreview) {
      appendLocalActivity(
        `${subtask.done ? "取消完成" : "完成"}任务拆解「${subtask.title}」。`,
        "subtask"
      );
      setSyncState("local");
      return;
    }

    try {
      await apiRequest(`/api/tasks/${taskId}/subtasks/${subtask.id}`, "PATCH", {
        done: !subtask.done,
      });
      await refreshBoard(false);
    } catch {
      setSyncState("local");
    }
  }

  async function updateSubtaskTitle(taskId: string, subtask: Subtask, title: string) {
    if (!title.trim()) return;
    setBoard((current) => ({
      ...current,
      tasks: current.tasks.map((task) => {
        if (task.id !== taskId) return task;
        return {
          ...task,
          subtasks: task.subtasks.map((s) =>
            s.id === subtask.id ? { ...s, title: title.trim(), updatedAt: new Date().toISOString() } : s
          ),
          updatedAt: new Date().toISOString(),
        };
      }),
    }));

    if (isLocalPreview) {
      appendLocalActivity(`更新任务拆解「${title.trim()}」。`, "subtask");
      setSyncState("local");
      return;
    }

    try {
      await apiRequest(`/api/tasks/${taskId}/subtasks/${subtask.id}`, "PATCH", { title: title.trim() });
      await refreshBoard(false);
    } catch {
      setSyncState("local");
    }
  }

  async function deleteSubtaskItem(taskId: string, subtask: Subtask) {
    setBoard((current) => ({
      ...current,
      tasks: current.tasks.map((task) => {
        if (task.id !== taskId) return task;
        const subtasks = task.subtasks.filter((s) => s.id !== subtask.id);
        return {
          ...task,
          subtasks,
          progress: progressFromSubtasks(subtasks, task.progress),
          updatedAt: new Date().toISOString(),
        };
      }),
    }));

    if (isLocalPreview) {
      appendLocalActivity(`删除任务拆解「${subtask.title}」。`, "subtask");
      setSyncState("local");
      return;
    }

    try {
      await apiRequest(`/api/tasks/${taskId}/subtasks/${subtask.id}`, "DELETE");
      await refreshBoard(false);
    } catch {
      setSyncState("local");
    }
  }

  const activeProjectChoices = activeProjects.length ? activeProjects : board.projects;
  const newTaskProjectId = newTask.projectId || firstProjectId(activeProjectChoices);

  return (
    <main data-theme={themeId} className="kanban-theme flex min-h-screen flex-col bg-[var(--app-bg)] text-[var(--text)]">
      <div className="mx-auto grid min-h-screen w-full max-w-[2160px] flex-1 grid-rows-[auto_1fr] gap-4 px-5 py-4 2xl:px-8">
        <header className="flex flex-col gap-4 border-b border-[var(--border)] pb-4 2xl:flex-row 2xl:items-end 2xl:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-3 text-xs font-semibold uppercase text-[var(--muted)]">
              <span className="h-2 w-2 rounded-full bg-[var(--accent)]" />
              <span>Project Operations</span>
            </div>
            <h1 className="mt-3 text-3xl font-semibold 2xl:text-5xl">项目看板</h1>
          </div>
          <div className="flex flex-col gap-3 2xl:items-end">
            <div className="grid grid-cols-5 gap-2 text-right">
              <Metric label="项目" value={metrics.projects} />
              <Metric label="活跃" value={metrics.active} />
              <Metric label="临期" value={metrics.dueSoon} alert={metrics.dueSoon > 0} />
              <Metric label="阻塞" value={metrics.blocked} alert={metrics.blocked > 0} />
              <Metric label="完成" value={`${metrics.completion}%`} />
            </div>
            <div className="flex items-center gap-2">
              <span className="shrink-0 text-sm text-[var(--muted)]">配色方案</span>
              <select
                name="themeId"
                value={themeId}
                onChange={(event) => changeTheme(event.target.value as ThemeId)}
                className="min-w-0 flex-1 rounded-md border border-[var(--border)] bg-[var(--panel)] px-3 py-2 text-sm text-[var(--text)] outline-none 2xl:w-[180px]"
              >
                {themePresets.map((theme) => (
                  <option key={theme.id} value={theme.id}>
                    {theme.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                title="系统参数"
                onClick={() => setDrawerMode("settings")}
                className="rounded-md border border-[var(--border)] bg-[var(--panel)] p-2 text-[var(--text)] transition hover:bg-[var(--panel-soft)]"
              >
                <SlidersHorizontal size={18} />
              </button>
            </div>
          </div>
        </header>

        <DndContext
          sensors={sensors}
          collisionDetection={kanbanCollisionDetection}
          measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={(event) => void handleDragEnd(event)}
          onDragCancel={handleDragCancel}
        >
        <section className="grid min-h-0 gap-4 lg:grid-cols-[320px_minmax(0,1fr)] 2xl:grid-cols-[340px_minmax(0,1fr)]">
          <aside className="min-h-0 space-y-4 overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--panel)] p-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold">项目</h2>
                <button
                  type="button"
                  title="新建项目"
                  onClick={() => openProject(null)}
                  className="rounded-md border border-[var(--border)] p-2 text-[var(--text)] transition hover:bg-[var(--panel-soft)]"
                >
                  <FolderPlus size={16} />
                </button>
              </div>
              <button
                type="button"
                onClick={() => setProjectFilter("all")}
                className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm transition ${
                  projectFilter === "all"
                    ? "bg-[var(--text)] text-[var(--panel)]"
                    : "text-[var(--text)] hover:bg-[var(--panel-soft)]"
                }`}
              >
                <span>全部活跃项目</span>
                <span>{activeProjects.length}</span>
              </button>
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
                  onEdit={() => openProject(project)}
                  onArchive={() => void persistProject(project.id, { status: "archived" }, "项目已归档")}
                />
              ))}
            </div>

            <div className="space-y-2 border-t border-[var(--border)] pt-4">
              <h2 className="text-sm font-semibold">筛选</h2>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-2.5 text-[var(--muted)]" size={15} />
                <input
                  name="taskSearch"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="任务、描述、负责人"
                  className="w-full rounded-md border border-[var(--border)] bg-[var(--input)] py-2 pl-9 pr-3 text-sm outline-none transition focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)]"
                />
              </div>
              <div className="grid grid-cols-3 gap-1">
                {(["all", "high", "medium", "low"] as const).map((priority) => (
                  <button
                    key={priority}
                    type="button"
                    onClick={() => setPriorityFilter(priority)}
                    className={`rounded-md px-2 py-2 text-sm transition ${
                      priorityFilter === priority
                        ? "bg-[var(--text)] text-[var(--panel)]"
                        : "bg-[var(--panel-soft)] text-[var(--text)] hover:bg-[var(--hover)]"
                    }`}
                  >
                    {priority === "all" ? "全部" : priorityLabels[priority]}
                  </button>
                ))}
              </div>
              <TagMultiSelect
                allTags={allTags}
                selected={tagFilters}
                onChange={setTagFilters}
                search={tagSearch}
                onSearchChange={setTagSearch}
              />
            </div>

            <form onSubmit={createTask} className="space-y-3 border-t border-[var(--border)] pt-4">
              <div className="flex items-center gap-2">
                <Plus size={16} />
                <h2 className="text-sm font-semibold">新任务</h2>
              </div>
              <input
                name="newTaskTitle"
                value={newTask.title}
                onChange={(event) => setNewTask((current) => ({ ...current, title: event.target.value }))}
                placeholder="任务名称"
                className="w-full rounded-md border border-[var(--border)] bg-[var(--input)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)]"
              />
              <textarea
                name="newTaskDescription"
                value={newTask.description}
                onChange={(event) => setNewTask((current) => ({ ...current, description: event.target.value }))}
                placeholder="任务描述"
                rows={3}
                className="w-full resize-none rounded-md border border-[var(--border)] bg-[var(--input)] px-3 py-2 text-sm leading-6 outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)]"
              />
              <div>
                <select
                  name="newTaskProjectId"
                  value={newTaskProjectId}
                  onChange={(event) => setNewTask((current) => ({ ...current, projectId: event.target.value }))}
                  className="w-full rounded-md border border-[var(--border)] bg-[var(--input)] px-2 py-2 text-sm"
                >
                  {activeProjectChoices.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input
                  name="newTaskOwner"
                  value={newTask.owner}
                  onChange={(event) => setNewTask((current) => ({ ...current, owner: event.target.value }))}
                  placeholder="负责人"
                  className="rounded-md border border-[var(--border)] bg-[var(--input)] px-3 py-2 text-sm"
                />
                <select
                  name="newTaskPriority"
                  value={newTask.priority}
                  onChange={(event) => setNewTask((current) => ({ ...current, priority: event.target.value as Priority }))}
                  className="rounded-md border border-[var(--border)] bg-[var(--input)] px-3 py-2 text-sm"
                >
                  <option value="high">高优先级</option>
                  <option value="medium">中优先级</option>
                  <option value="low">低优先级</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="space-y-1 text-sm text-[var(--muted)]">
                  <span>提测日期</span>
                  <input
                    name="newTaskTestDueDate"
                    type="date"
                    value={newTask.testDueDate}
                    onChange={(event) => setNewTask((current) => ({ ...current, testDueDate: event.target.value }))}
                    className="w-full rounded-md border border-[var(--border)] bg-[var(--input)] px-3 py-2 text-sm text-[var(--text)]"
                  />
                </label>
                <label className="space-y-1 text-sm text-[var(--muted)]">
                  <span>交付日期</span>
                  <input
                    name="newTaskDueDate"
                    type="date"
                    value={newTask.dueDate}
                    onChange={(event) => setNewTask((current) => ({ ...current, dueDate: event.target.value }))}
                    className="w-full rounded-md border border-[var(--border)] bg-[var(--input)] px-3 py-2 text-sm text-[var(--text)]"
                  />
                </label>
              </div>
              <input
                name="newTaskTags"
                value={newTask.tags}
                onChange={(event) => setNewTask((current) => ({ ...current, tags: event.target.value }))}
                placeholder="标签，用空格或逗号分隔"
                className="w-full rounded-md border border-[var(--border)] bg-[var(--input)] px-3 py-2 text-sm"
              />
              <button
                type="submit"
                className="flex w-full items-center justify-center gap-2 rounded-md bg-[var(--accent)] px-3 py-2 text-sm font-semibold text-white transition hover:bg-[var(--accent-hover)]"
              >
                <Plus size={15} />
                添加任务
              </button>
            </form>

            {archivedProjects.length > 0 ? (
              <div className="space-y-2 border-t border-[var(--border)] pt-4">
                <h2 className="text-sm font-semibold">归档项目</h2>
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
              </div>
            ) : null}
          </aside>

          <section className="min-w-0 overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--board-bg)]">
            <div className="flex h-full min-h-[760px] gap-3 overflow-x-auto p-3 2xl:min-h-[900px]">
              {board.columns.map((column) => {
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
                    draggingTaskId={draggingTaskId}
                    crossColumnTarget={dragOverColumn === column.id}
                    onOpenTask={openTask}
                  />
                );
              })}
            </div>
          </section>

        </section>

        {draggingTaskId ? <TrashDropZone armed={trashArmed} /> : null}
        <DragOverlay>
          {draggingTaskId ? (() => {
            const task = board.tasks.find((t) => t.id === draggingTaskId);
            if (!task) return null;
            return (
              <TaskCard
                task={task}
                todayKey={todayKey}
                dueSoonDays={dueSoonDays}
                project={projectById(board.projects, task.projectId)}
                selected={false}
                dragging={true}
                onSelect={() => {}}
              />
            );
          })() : null}
        </DragOverlay>
        </DndContext>
      </div>

      <footer className="border-t border-[var(--border)] text-sm text-[var(--muted)]">
        <div className="mx-auto flex w-full max-w-[2160px] flex-col items-center gap-3 px-5 py-5 sm:flex-row sm:justify-between 2xl:px-8">
          <div className="flex items-center gap-2">
            <Copyright size={14} />
            <span>&copy; 2026 <span className="font-semibold text-[var(--text)]">项目看板</span></span>
          </div>
          <div className="flex items-center gap-2">
            <Edit3 size={13} />
            <span className="text-[var(--text)]">署名</span>
            <span className="h-3 w-px bg-[var(--border)]" />
            <span className="font-medium text-[var(--text)]">kfzx-chenwh4</span>
            <span className="rounded bg-[var(--accent-soft)] px-1.5 py-0.5 text-xs font-medium text-[var(--accent)]">0000959918</span>
          </div>
        </div>
      </footer>

      <button
        type="button"
        title="活动记录"
        onClick={() => setDrawerMode("activity")}
        className="fixed bottom-5 right-5 z-30 inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--text)] px-4 py-3 text-sm font-semibold text-[var(--panel)] shadow-lg transition hover:opacity-90"
      >
        <Activity size={17} />
        活动记录
      </button>

      <ToastViewport toasts={toasts} />

      {drawerMode ? (
        <Drawer onClose={() => setDrawerMode(null)} side={drawerMode === "project" || drawerMode === "settings" ? "left" : "right"}>
          {drawerMode === "task" && selectedTask ? (
            <TaskDrawer
              key={selectedTask.id}
              task={selectedTask}
              projects={activeProjectChoices}
              newSubtaskTitle={newSubtaskTitle}
              setNewSubtaskTitle={setNewSubtaskTitle}
              columns={board.columns}
              onSave={(patch) => persistTask(selectedTask.id, patch)}
              onDelete={() => void removeTask(selectedTask.id)}
              onCreateSubtask={createSubtask}
              onToggleSubtask={(subtask) => void toggleSubtask(selectedTask.id, subtask)}
              onUpdateSubtask={(subtask, title) => void updateSubtaskTitle(selectedTask.id, subtask, title)}
              onDeleteSubtask={(subtask) => void deleteSubtaskItem(selectedTask.id, subtask)}
            />
          ) : null}
          {drawerMode === "project" ? (
            <ProjectDrawer
              project={selectedProject}
              draft={projectDraft}
              setDraft={setProjectDraft}
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
    </main>
  );
}

type DragBindingProps = {
  attributes: DraggableAttributes;
  listeners: DraggableSyntheticListeners;
};

function BoardColumnView({
  column,
  tasks,
  projects,
  selectedTaskId,
  todayKey,
  dueSoonDays,
  draggingTaskId,
  crossColumnTarget,
  onOpenTask,
}: {
  column: BoardData["columns"][number];
  tasks: BoardTask[];
  projects: Project[];
  selectedTaskId: string | null;
  todayKey: string;
  dueSoonDays: number;
  draggingTaskId: string | null;
  crossColumnTarget: boolean;
  onOpenTask: (taskId: string) => void;
}) {
  const { setNodeRef } = useDroppable({
    id: `column-${column.id}`,
    data: { type: "column", status: column.id } satisfies DragTargetData,
  });

  return (
    <div
      ref={setNodeRef}
      role="region"
      aria-label={`${column.title}列表`}
      className={`flex min-w-[300px] flex-[0_0_300px] flex-col rounded-lg border bg-[var(--column-bg)] transition 2xl:min-w-[320px] 2xl:flex-1 ${
        crossColumnTarget
          ? "border-[var(--accent)] ring-2 ring-[var(--accent-soft)]"
          : "border-[var(--border)]"
      }`}
    >
      <div className="border-b border-[var(--border)] px-3 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className={`h-2.5 w-2.5 rounded-full ${column.tone}`} />
            <h2 className="text-sm font-semibold 2xl:text-base">{column.title}</h2>
          </div>
          <span className="rounded-md bg-[var(--panel-soft)] px-2 py-1 text-xs text-[var(--muted)]">
            {tasks.length}
          </span>
        </div>
      </div>
      <SortableContext items={tasks.map((task) => task.id)} strategy={verticalListSortingStrategy}>
        <div className="flex min-h-[220px] flex-1 flex-col gap-3 overflow-y-auto p-3">
          {tasks.map((task) => (
            <SortableTaskCard
              key={task.id}
              task={task}
              todayKey={todayKey}
              dueSoonDays={dueSoonDays}
              project={projectById(projects, task.projectId)}
              selected={task.id === selectedTaskId}
              dragging={task.id === draggingTaskId}
              onSelect={() => onOpenTask(task.id)}
            />
          ))}
          {crossColumnTarget ? (
            <div className="rounded-md border-2 border-dashed border-[var(--accent)] bg-[var(--accent-soft)] px-3 py-8 text-center text-xs font-semibold text-[var(--accent)]">
              移至此处
            </div>
          ) : tasks.length === 0 ? (
            <div className="grid min-h-[160px] place-items-center rounded-md border border-dashed border-[var(--border)] text-xs text-[var(--muted)]">
              拖入任务
            </div>
          ) : null}
        </div>
      </SortableContext>
    </div>
  );
}

function SortableTaskCard({
  task,
  todayKey,
  dueSoonDays,
  project,
  selected,
  dragging,
  onSelect,
}: {
  task: BoardTask;
  todayKey: string;
  dueSoonDays: number;
  project: Project;
  selected: boolean;
  dragging: boolean;
  onSelect: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    isDragging,
  } = useSortable({
    id: task.id,
    data: { type: "task", status: task.status } satisfies DragTargetData,
  });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: SortableCSS.Transform.toString(transform),
        transition: isDragging ? "unset" : "transform 500ms ease",
        touchAction: "none",
        opacity: isDragging ? 0 : 1,
      }}
      className="touch-none"
    >
      <TaskCard
        task={task}
        todayKey={todayKey}
        dueSoonDays={dueSoonDays}
        project={project}
        selected={selected}
        dragging={dragging || isDragging}
        onSelect={onSelect}
        dragBinding={{ attributes, listeners }}
      />
    </div>
  );
}

function TrashDropZone({ armed }: { armed: boolean }) {
  const { setNodeRef, isOver } = useDroppable({
    id: "trash",
    data: { type: "trash" } satisfies DragTargetData,
  });
  const active = armed || isOver;

  return (
    <div
      ref={setNodeRef}
      className={`fixed bottom-6 right-6 z-40 flex h-[120px] w-[280px] flex-col items-center justify-center gap-2 rounded-lg border-2 text-sm font-semibold shadow-xl transition-all duration-200 ${
        active
          ? "scale-105 border-[var(--danger)] bg-[var(--danger)] text-white"
          : "border-dashed border-[var(--muted)] bg-[var(--panel)] text-[var(--muted)]"
      }`}
    >
      <Trash2 size={22} />
      <span>拖到这里删除</span>
    </div>
  );
}

function Metric({
  label,
  value,
  alert,
}: {
  label: string;
  value: number | string;
  alert?: boolean;
}) {
  return (
    <div
      className={`rounded-lg border px-3 py-2 ${
        alert
          ? "border-[var(--danger)] bg-[var(--danger-soft)] text-[var(--danger)]"
          : "border-[var(--border)] bg-[var(--panel)]"
      }`}
    >
      <p className="text-xs text-[var(--muted)]">{label}</p>
      <p className="mt-1 text-lg font-semibold 2xl:text-2xl">{value}</p>
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
  onEdit,
  onArchive,
}: {
  project: Project;
  selected: boolean;
  taskCount: number;
  onSelect: () => void;
  onEdit: () => void;
  onArchive: () => void;
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
      className={`cursor-pointer rounded-md px-2 py-2 transition ${
        selected ? "bg-[var(--text)] text-[var(--panel)]" : "hover:bg-[var(--panel-soft)]"
      }`}
    >
      <div className="flex w-full cursor-pointer items-center gap-2 text-left">
        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: project.color }} />
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{project.name}</span>
        <span className="text-xs opacity-70">{taskCount}</span>
      </div>
      <div className="mt-2 flex items-center justify-between text-xs opacity-80">
        <div className="flex items-center gap-2">
          <span>{project.owner}</span>
          <span className={`rounded px-1.5 py-0.5 ${healthTone[project.health]}`}>
            {healthLabels[project.health]}
          </span>
        </div>
        <div className="flex gap-1">
          <button
            type="button"
            title="编辑项目"
            onClick={(event) => {
              event.stopPropagation();
              onEdit();
            }}
            className="rounded p-1 hover:bg-white/20"
          >
            <Edit3 size={13} />
          </button>
          <button
            type="button"
            title="归档项目"
            onClick={(event) => {
              event.stopPropagation();
              onArchive();
            }}
            className="rounded p-1 hover:bg-white/20"
          >
            <Archive size={13} />
          </button>
        </div>
      </div>
    </div>
  );
}

function TaskCard({
  task,
  todayKey,
  dueSoonDays,
  project,
  selected,
  dragging,
  onSelect,
  dragBinding,
}: {
  task: BoardTask;
  todayKey: string;
  dueSoonDays: number;
  project: Project;
  selected: boolean;
  dragging: boolean;
  onSelect: () => void;
  dragBinding?: DragBindingProps;
}) {
  const markers = deadlineMarkers(task, todayKey, dueSoonDays);
  const hasDateAlert = markers.some((marker) => marker.state !== "normal");
  const subtaskDone = task.subtasks.filter((step) => step.done).length;
  const progress = progressFromSubtasks(task.subtasks, task.progress);

  return (
    <article
      onClick={onSelect}
      {...dragBinding?.attributes}
      {...dragBinding?.listeners}
      className={`group rounded-lg border bg-[var(--card)] p-3 shadow-sm transition ${
        selected ? "border-[var(--accent)] ring-2 ring-[var(--accent-soft)]" : "border-[var(--card-border)]"
      } ${hasDateAlert ? "border-[var(--danger)] bg-[var(--danger-soft)]" : ""} ${
        dragBinding ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"
      } ${dragging ? "" : "hover:-translate-y-0.5 hover:shadow-md"}`}
    >
      <div className="flex items-start gap-2">
        <span
          title="拖拽任务"
          className="mt-0.5 shrink-0 rounded p-0.5 text-[var(--muted)] opacity-60 transition group-hover:bg-[var(--panel-soft)] group-hover:opacity-100"
        >
          <GripVertical size={16} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <h3 className="text-sm font-semibold leading-5 2xl:text-[15px]">{task.title}</h3>
            <span className={`shrink-0 rounded-md border px-2 py-0.5 text-xs ${priorityTone[task.priority]}`}>
              {priorityLabels[task.priority]}
            </span>
          </div>
          <p className="mt-2 line-clamp-2 text-xs leading-5 text-[var(--muted)]">
            {task.description || "暂无描述"}
          </p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-1">
        {task.tags.slice(0, 4).map((tag) => (
          <span key={tag} className="inline-flex items-center gap-1 rounded-md bg-[var(--tag-bg)] px-2 py-0.5 text-[11px] text-[var(--muted)]">
            <Tag size={10} />
            {tag}
          </span>
        ))}
      </div>

      <div className="mt-3 flex items-center gap-2 text-xs text-[var(--muted)]">
        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: project.color }} />
        <span className="truncate">{project.name}</span>
        <span>·</span>
        <OwnerTag name={task.owner} />
      </div>

      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[var(--panel-soft)]">
        <div
          className="h-full rounded-full bg-[var(--accent)] transition-all"
          style={{ width: `${progress}%` }}
        />
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5 text-xs text-[var(--muted)]">
        {markers.length ? (
          markers.map((marker) => (
            <span
              key={`${marker.label}-${marker.date}`}
              className={`rounded-md border px-2 py-0.5 ${
                marker.state === "normal"
                  ? "border-[var(--border)] bg-[var(--panel-soft)]"
                  : "border-[var(--danger)] bg-white/55 font-semibold text-[var(--danger)]"
              }`}
            >
              {marker.label}: {marker.date}
              {marker.note ? ` · ${marker.note}` : ""}
            </span>
          ))
        ) : (
          <span className="rounded-md border border-[var(--border)] bg-[var(--panel-soft)] px-2 py-0.5">未排期</span>
        )}
      </div>

      <div className="mt-3 flex items-center justify-between text-xs text-[var(--muted)]">
        <span>{progress}%</span>
        <span className={task.blockers > 0 ? "font-semibold text-[var(--danger)]" : ""}>
          {task.blockers > 0
            ? `${task.blockers} 个阻塞`
            : task.subtasks.length
              ? `${subtaskDone}/${task.subtasks.length} 步`
              : "无拆解"}
        </span>
      </div>
    </article>
  );
}

function Drawer({ children, onClose, side = "right" }: { children: ReactNode; onClose: () => void; side?: "left" | "right" }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/20">
      <button type="button" aria-label="关闭抽屉" className="absolute inset-0 cursor-default" onClick={onClose} />
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
  dueDate: string;
  owner: string;
  progress: number;
  blockers: number;
  blockedReason: string;
  tagsText: string;
};

function taskDraftFromTask(task: BoardTask): TaskDraft {
  return {
    title: task.title,
    description: task.description,
    projectId: task.projectId,
    status: task.status,
    priority: task.priority,
    testDueDate: task.testDueDate,
    dueDate: task.dueDate,
    owner: task.owner,
    progress: task.progress,
    blockers: task.blockers,
    blockedReason: task.blockedReason,
    tagsText: task.tags.join(" "),
  };
}

function TaskDrawer({
  task,
  projects,
  columns,
  newSubtaskTitle,
  setNewSubtaskTitle,
  onSave,
  onDelete,
  onCreateSubtask,
  onToggleSubtask,
  onUpdateSubtask,
  onDeleteSubtask,
}: {
  task: BoardTask;
  projects: Project[];
  columns: BoardData["columns"];
  newSubtaskTitle: string;
  setNewSubtaskTitle: (value: string) => void;
  onSave: (patch: Partial<BoardTask>) => Promise<boolean>;
  onDelete: () => void;
  onCreateSubtask: (event: FormEvent<HTMLFormElement>) => void;
  onToggleSubtask: (subtask: Subtask) => void;
  onUpdateSubtask: (subtask: Subtask, title: string) => void;
  onDeleteSubtask: (subtask: Subtask) => void;
}) {
  const [draft, setDraft] = useState<TaskDraft>(() => taskDraftFromTask(task));
  const [saving, setSaving] = useState(false);
  const [editingSubtaskId, setEditingSubtaskId] = useState<string | null>(null);
  const [editingSubtaskTitle, setEditingSubtaskTitle] = useState("");

  async function saveTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft.title.trim()) {
      return;
    }

    setSaving(true);
    await onSave({
      title: draft.title,
      description: draft.description,
      projectId: draft.projectId,
      status: draft.status,
      priority: draft.priority,
      testDueDate: draft.testDueDate,
      dueDate: draft.dueDate,
      owner: draft.owner,
      progress: draft.progress,
      blockers: draft.blockers,
      blockedReason: draft.blockedReason,
      tags: parseTags(draft.tagsText),
    });
    setSaving(false);
  }

  return (
    <section className="space-y-5 pr-10">
      <div>
        <h2 className="text-base font-semibold">编辑任务信息</h2>
      </div>

      <form id="task-edit-form" onSubmit={saveTask} className="flex flex-col gap-5">
        <Field label="任务名称">
          <input
            name="taskTitle"
            value={draft.title}
            onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
          />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="项目">
            <select
              name="taskProjectId"
              value={draft.projectId}
              onChange={(event) => setDraft((current) => ({ ...current, projectId: event.target.value }))}
            >
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="状态">
            <select
              name="taskStatus"
              value={draft.status}
              onChange={(event) => setDraft((current) => ({ ...current, status: event.target.value as BoardStatus }))}
            >
              {columns.map((column) => (
                <option key={column.id} value={column.id}>
                  {column.title}
                </option>
              ))}
            </select>
          </Field>
          <Field label="优先级">
            <select
              name="taskPriority"
              value={draft.priority}
              onChange={(event) => setDraft((current) => ({ ...current, priority: event.target.value as Priority }))}
            >
              <option value="high">高</option>
              <option value="medium">中</option>
              <option value="low">低</option>
            </select>
          </Field>
          <Field label="负责人">
            <input
              name="taskOwner"
              value={draft.owner}
              onChange={(event) => setDraft((current) => ({ ...current, owner: event.target.value }))}
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

        <Field label="描述">
          <textarea
            name="taskDescription"
            value={draft.description}
            onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))}
            rows={3}
            className="resize-none leading-6"
          />
        </Field>

        <div className="grid grid-cols-[1fr_100px] gap-4">
          <Field label={`进度 ${draft.progress}%`}>
            <input
              type="range"
              name="taskProgress"
              min="0"
              max="100"
              value={draft.progress}
              onChange={(event) => setDraft((current) => ({ ...current, progress: Number(event.target.value) }))}
              className="accent-[var(--accent)]"
            />
          </Field>
          <Field label="阻塞项">
            <input
              type="number"
              name="taskBlockers"
              min="0"
              max="99"
              value={draft.blockers}
              onChange={(event) => setDraft((current) => ({ ...current, blockers: Number(event.target.value) }))}
            />
          </Field>
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
      </form>

      <section className="flex flex-col gap-4 border-t border-[var(--border)] pt-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">任务拆解</h2>
          {task.subtasks.length > 0 ? (
            <span className="rounded-full bg-[var(--accent-soft)] px-2.5 py-0.5 text-xs font-semibold text-[var(--accent)]">
              {task.subtasks.filter((step) => step.done).length}/{task.subtasks.length}
            </span>
          ) : null}
        </div>
        {task.subtasks.length > 0 ? (
          <div className="h-2 overflow-hidden rounded-full bg-[var(--panel-soft)]">
            <div
              className="h-full rounded-full bg-[var(--accent)] transition-all"
              style={{ width: `${Math.round((task.subtasks.filter((s) => s.done).length / task.subtasks.length) * 100)}%` }}
            />
          </div>
        ) : null}
        <div className="flex flex-col gap-2">
          {task.subtasks.filter((s) => !s.done).map((step) => (
            <div key={step.id} className="flex items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--input)] px-3 py-2">
              <button
                type="button"
                onClick={() => onToggleSubtask(step)}
                className="grid h-5 w-5 shrink-0 place-items-center rounded-full border border-[var(--border)] transition hover:border-[var(--accent)]"
              >
                <Check size={11} className="opacity-0" />
              </button>
              {editingSubtaskId === step.id ? (
                <input
                  value={editingSubtaskTitle}
                  onChange={(e) => setEditingSubtaskTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") { onUpdateSubtask(step, editingSubtaskTitle); setEditingSubtaskId(null); }
                    if (e.key === "Escape") { setEditingSubtaskId(null); }
                  }}
                  onBlur={() => {
                    if (editingSubtaskTitle.trim()) { onUpdateSubtask(step, editingSubtaskTitle); }
                    setEditingSubtaskId(null);
                  }}
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
                onClick={(e) => { e.stopPropagation(); onDeleteSubtask(step); }}
                title="删除拆解"
                className="shrink-0 rounded p-1 text-[var(--muted)] transition hover:bg-[var(--panel-soft)] hover:text-[var(--danger)]"
              >
                <X size={13} />
              </button>
            </div>
          ))}
          {task.subtasks.filter((s) => s.done).map((step) => (
            <div key={step.id} className="flex items-center gap-2 rounded-md border border-[#c8d8bf] bg-[#edf6ea] px-3 py-2">
              <button
                type="button"
                onClick={() => onToggleSubtask(step)}
                className="grid h-5 w-5 shrink-0 place-items-center rounded-full border border-[#4f7a45] bg-[#4f7a45] text-white transition"
              >
                <Check size={11} />
              </button>
              {editingSubtaskId === step.id ? (
                <input
                  value={editingSubtaskTitle}
                  onChange={(e) => setEditingSubtaskTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") { onUpdateSubtask(step, editingSubtaskTitle); setEditingSubtaskId(null); }
                    if (e.key === "Escape") { setEditingSubtaskId(null); }
                  }}
                  onBlur={() => {
                    if (editingSubtaskTitle.trim()) { onUpdateSubtask(step, editingSubtaskTitle); }
                    setEditingSubtaskId(null);
                  }}
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
                onClick={(e) => { e.stopPropagation(); onDeleteSubtask(step); }}
                title="删除拆解"
                className="shrink-0 rounded p-1 text-[#6d8064] transition hover:bg-white/50 hover:text-[var(--danger)]"
              >
                <X size={13} />
              </button>
            </div>
          ))}
        </div>
        <form onSubmit={onCreateSubtask} className="grid grid-cols-[minmax(0,1fr)_42px] gap-2">
          <input
            value={newSubtaskTitle}
            name="newSubtaskTitle"
            onChange={(event) => setNewSubtaskTitle(event.target.value)}
            placeholder="添加新拆解项"
            className="h-10 rounded-md border border-[var(--border)] bg-[var(--input)] px-3 text-sm outline-none transition placeholder:text-[var(--muted)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)]"
          />
          <button type="submit" title="添加任务拆解" className="grid h-10 place-items-center rounded-md bg-[var(--accent)] text-white transition hover:bg-[var(--accent-hover)]">
            <Plus size={16} />
          </button>
        </form>
      </section>

      <div className="grid grid-cols-2 gap-3 border-t border-[var(--border)] pt-4">
        <button
          type="submit"
          form="task-edit-form"
          disabled={saving}
          className="flex items-center justify-center gap-2 rounded-md bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[var(--accent-hover)] disabled:opacity-60"
        >
          <CheckCircle2 size={16} />
          {saving ? "保存中" : "保存任务"}
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="flex items-center justify-center gap-2 rounded-md border border-[var(--danger)] px-4 py-2.5 text-sm font-semibold text-[var(--danger)] transition hover:bg-[var(--danger-soft)]"
        >
          <Trash2 size={16} />
          删除任务
        </button>
      </div>
    </section>
  );
}

function ProjectDrawer({
  project,
  draft,
  setDraft,
  onSubmit,
  onArchive,
  onRestore,
  onDelete,
}: {
  project: Project | null;
  draft: ProjectForm;
  setDraft: (draft: ProjectForm) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onArchive: (summary: string) => void;
  onRestore: () => void;
  onDelete: () => void;
}) {
  return (
    <section className="space-y-5 pr-10">
      <div>
        <h2 className="text-base font-semibold">{project ? "项目修改" : "创建项目"}</h2>
      </div>

      <form onSubmit={onSubmit} className="space-y-5">
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
        <div className="grid grid-cols-2 gap-4">
          <Field label="负责人">
            <input name="projectOwner" value={draft.owner} onChange={(event) => setDraft({ ...draft, owner: event.target.value })} />
          </Field>
          <Field label="健康度">
            <select name="projectHealth" value={draft.health} onChange={(event) => setDraft({ ...draft, health: event.target.value as ProjectHealth })}>
              <option value="good">正常</option>
              <option value="normal">关注</option>
              <option value="risk">风险</option>
            </select>
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
        <button type="submit" className="flex w-full items-center justify-center gap-2 rounded-md bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[var(--accent-hover)]">
          <CheckCircle2 size={16} />
          保存项目
        </button>
      </form>

      {project ? (
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

  const [paramSearch, setParamSearch] = useState("");
  const [paramDropdownOpen, setParamDropdownOpen] = useState(false);
  const paramContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (paramContainerRef.current && !paramContainerRef.current.contains(event.target as Node)) {
        setParamDropdownOpen(false);
      }
    }
    if (paramDropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [paramDropdownOpen]);

  const filteredParams = paramSearch.trim()
    ? settings.parameters.filter((p) =>
        `${p.group} ${p.label}`.toLowerCase().includes(paramSearch.trim().toLowerCase())
      )
    : settings.parameters;

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
          <div ref={paramContainerRef} className="relative flex-1">
            <button
              type="button"
              onClick={() => setParamDropdownOpen(!paramDropdownOpen)}
              className="flex w-full items-center rounded-md border border-[var(--border)] bg-[var(--input)] px-2 py-2 text-sm text-left"
            >
              <span className={selectedParameter ? "" : "text-[var(--muted)]"}>
                {selectedParameter ? `${selectedParameter.group} / ${selectedParameter.label}` : "选择参数"}
              </span>
            </button>
            {paramDropdownOpen ? (
              <div className="absolute left-0 top-full z-30 mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--panel)] shadow-lg">
                <div className="border-b border-[var(--border)] p-2">
                  <input
                    value={paramSearch}
                    onChange={(e) => setParamSearch(e.target.value)}
                    placeholder="搜索..."
                    className="w-full rounded border border-[var(--border)] bg-[var(--input)] px-2 py-1.5 text-sm outline-none"
                    autoFocus
                  />
                </div>
                <div className="max-h-[180px] overflow-y-auto p-1">
                  {filteredParams.length === 0 ? (
                    <p className="px-3 py-2 text-sm text-[var(--muted)]">无匹配参数</p>
                  ) : (
                    filteredParams.map((p) => (
                      <button
                        key={p.key}
                        type="button"
                        onClick={() => {
                          setSelectedKey(p.key);
                          setParamDropdownOpen(false);
                          setParamSearch("");
                        }}
                        className={`flex w-full items-center rounded px-3 py-1.5 text-left text-sm transition ${
                          selectedKey === p.key
                            ? "bg-[var(--accent-soft)] text-[var(--accent)]"
                            : "hover:bg-[var(--panel-soft)]"
                        }`}
                      >
                        {p.group} / {p.label}
                      </button>
                    ))
                  )}
                </div>
              </div>
            ) : null}
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
          return (
            <div key={item.id} className="border-l-2 border-[var(--accent)] pl-3">
              <p className="text-sm leading-5 text-[var(--text)]">{item.message}</p>
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

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5 text-sm text-[var(--muted)] [&_input]:w-full [&_input]:rounded-md [&_input]:border [&_input]:border-[var(--border)] [&_input]:bg-[var(--input)] [&_input]:px-2 [&_input]:py-2 [&_input]:text-sm [&_select]:w-full [&_select]:rounded-md [&_select]:border [&_select]:border-[var(--border)] [&_select]:bg-[var(--input)] [&_select]:px-2 [&_select]:py-2 [&_select]:text-sm [&_textarea]:w-full [&_textarea]:rounded-md [&_textarea]:border [&_textarea]:border-[var(--border)] [&_textarea]:bg-[var(--input)] [&_textarea]:px-2 [&_textarea]:py-2 [&_textarea]:text-sm">
      <span>{label}</span>
      {children}
    </label>
  );
}

function TagMultiSelect({
  allTags,
  selected,
  onChange,
  search,
  onSearchChange,
}: {
  allTags: string[];
  selected: string[];
  onChange: (tags: string[]) => void;
  search: string;
  onSearchChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [open]);

  const filtered = search.trim()
    ? allTags.filter((tag) => tag.toLowerCase().includes(search.trim().toLowerCase()))
    : allTags;

  const toggle = (tag: string) => {
    if (selected.includes(tag)) {
      onChange(selected.filter((t) => t !== tag));
    } else {
      onChange([...selected, tag]);
    }
  };

  const clearAll = () => {
    onChange([]);
    onSearchChange("");
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--input)] px-3 py-2 text-sm text-left transition"
      >
        {selected.length === 0 ? (
          <span className="text-[var(--muted)]">全部标签</span>
        ) : (
          <span className="flex flex-wrap gap-1">
            {selected.map((tag) => (
              <span key={tag} className="inline-flex items-center gap-0.5 rounded bg-[var(--accent-soft)] px-1.5 py-0.5 text-xs text-[var(--accent)]">
                {tag}
              </span>
            ))}
          </span>
        )}
      </button>
      {selected.length > 0 ? (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); clearAll(); }}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--muted)] hover:text-[var(--text)]"
        >
          <X size={14} />
        </button>
      ) : null}
      {open ? (
        <div className="absolute left-0 top-full z-30 mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--panel)] shadow-lg">
          <div className="border-b border-[var(--border)] p-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-2 text-[var(--muted)]" size={14} />
              <input
                value={search}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder="搜索标签..."
                className="w-full rounded border border-[var(--border)] bg-[var(--input)] py-1.5 pl-8 pr-3 text-sm outline-none"
                autoFocus
              />
            </div>
          </div>
          <div className="max-h-[180px] overflow-y-auto p-1">
            {filtered.length === 0 ? (
              <p className="px-3 py-2 text-sm text-[var(--muted)]">无匹配标签</p>
            ) : (
              filtered.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => toggle(tag)}
                  className={`flex w-full items-center gap-2 rounded px-3 py-1.5 text-left text-sm transition ${
                    selected.includes(tag)
                      ? "bg-[var(--accent-soft)] text-[var(--accent)]"
                      : "hover:bg-[var(--panel-soft)]"
                  }`}
                >
                  <span
                    className={`grid h-4 w-4 shrink-0 place-items-center rounded border transition ${
                      selected.includes(tag)
                        ? "border-[var(--accent)] bg-[var(--accent)] text-white"
                        : "border-[var(--border)]"
                    }`}
                  >
                    {selected.includes(tag) ? <Check size={11} /> : null}
                  </span>
                  {tag}
                </button>
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
