"use client";

import {
  Activity,
  Archive,
  ArchiveRestore,
  Check,
  CheckCircle2,
  Edit3,
  FolderPlus,
  GripVertical,
  PanelRightOpen,
  Plus,
  Search,
  Tag,
  Trash2,
  X,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type FormEvent,
  type ReactNode,
} from "react";
import {
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
} from "@/lib/board-data";

type SyncState = "synced" | "syncing" | "local";
type DrawerMode = "task" | "project" | "activity" | null;

type NewTaskForm = {
  title: string;
  description: string;
  projectId: string;
  owner: string;
  priority: Priority;
  status: BoardStatus;
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

const statusNames: Record<BoardStatus, string> = {
  backlog: "需求池",
  dev: "开发中",
  test: "测试中",
  done: "已完成",
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
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/);
  return match ? `${match[2]}/${match[3]} ${match[4]}:${match[5]}` : value;
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

function projectById(projects: Project[], projectId: string) {
  return (
    projects.find((project) => project.id === projectId) ??
    projects[0] ??
    fallbackProject
  );
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

function withReorderedTask(
  tasks: BoardTask[],
  taskId: string,
  targetStatus: BoardStatus,
  beforeTaskId?: string
) {
  const moving = tasks.find((task) => task.id === taskId);
  if (!moving) {
    return tasks;
  }

  const groups = new Map<BoardStatus, BoardTask[]>();
  for (const status of ["backlog", "dev", "test", "done"] as BoardStatus[]) {
    groups.set(status, sortTasks(tasks.filter((task) => task.status === status && task.id !== taskId)));
  }

  const targetGroup = groups.get(targetStatus) ?? [];
  const movingTask = { ...moving, status: targetStatus };
  const beforeIndex = beforeTaskId
    ? targetGroup.findIndex((task) => task.id === beforeTaskId)
    : -1;

  if (beforeIndex >= 0) {
    targetGroup.splice(beforeIndex, 0, movingTask);
  } else {
    targetGroup.push(movingTask);
  }

  const updates = new Map<string, BoardTask>();
  for (const [status, group] of groups.entries()) {
    group.forEach((task, index) => {
      updates.set(task.id, {
        ...task,
        status,
        orderIndex: (index + 1) * 10,
        updatedAt: new Date().toISOString(),
      });
    });
  }

  return tasks.map((task) => updates.get(task.id) ?? task);
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
  const [syncState, setSyncState] = useState<SyncState>("syncing");
  const [search, setSearch] = useState("");
  const [projectFilter, setProjectFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState<Priority | "all">("all");
  const [tagFilter, setTagFilter] = useState("all");
  const [drawerMode, setDrawerMode] = useState<DrawerMode>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
    initialBoard.projects[0]?.id ?? null
  );
  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null);
  const [trashArmed, setTrashArmed] = useState(false);
  const [newSubtaskTitle, setNewSubtaskTitle] = useState("");
  const localIdCounter = useRef(0);
  const [newTask, setNewTask] = useState<NewTaskForm>({
    title: "",
    description: "",
    projectId: initialBoard.projects.find((project) => project.status === "active")?.id ?? "",
    owner: "",
    priority: "medium",
    status: "backlog",
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
    () =>
      Array.from(new Set(board.tasks.flatMap((task) => task.tags))).sort((a, b) =>
        a > b ? 1 : a < b ? -1 : 0
      ),
    [board.tasks]
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
      const matchesTag = tagFilter === "all" || task.tags.includes(tagFilter);
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
  }, [activeProjects, board.projects, board.tasks, priorityFilter, projectFilter, search, tagFilter]);

  const metrics = useMemo(() => {
    const activeProjectIds = new Set(activeProjects.map((project) => project.id));
    const activeTasks = board.tasks.filter((task) => activeProjectIds.has(task.projectId));
    const blocked = activeTasks.filter((task) => task.blockers > 0);
    const dueSoon = activeTasks.filter((task) => {
      const days = daysUntil(task.dueDate, todayKey);
      return days !== null && days >= 0 && days <= 3 && task.status !== "done";
    });
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
  }, [activeProjects, board.tasks, todayKey]);

  const syncLabel = {
    synced: "已保存",
    syncing: "同步中",
    local: "本地预览",
  }[syncState];

  function openTask(taskId: string) {
    setSelectedTaskId(taskId);
    setDrawerMode("task");
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

  async function persistProject(projectId: string, patch: Partial<Project>) {
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
        `本地更新项目「${patch.name ?? previous?.name ?? "未命名项目"}」。`,
        "project"
      );
      setSyncState("local");
      return;
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
    } catch {
      appendLocalActivity(
        `本地更新项目「${patch.name ?? previous?.name ?? "未命名项目"}」。`,
        "project"
      );
      setSyncState("local");
    }
  }

  async function saveProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!projectDraft.name.trim()) {
      return;
    }

    if (selectedProject) {
      await persistProject(selectedProject.id, projectDraft);
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
    setSyncState("syncing");

    if (isLocalPreview) {
      appendLocalActivity(`本地创建项目「${optimistic.name}」。`, "project");
      setSyncState("local");
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
      await refreshBoard();
    } catch {
      appendLocalActivity(`本地创建项目「${optimistic.name}」。`, "project");
      setSyncState("local");
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
      appendLocalActivity(`本地删除项目「${project.name}」。`, "project");
      setSyncState("local");
      return;
    }

    try {
      await apiRequest(`/api/projects/${projectId}`, "DELETE");
      await refreshBoard();
    } catch {
      appendLocalActivity(`本地删除项目「${project.name}」。`, "project");
      setSyncState("local");
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
        `本地更新任务「${patch.title ?? previous?.title ?? "未命名任务"}」。`
      );
      setSyncState("local");
      return;
    }

    try {
      const saved = await apiRequest<BoardTask>(`/api/tasks/${taskId}`, "PATCH", patch);
      setBoard((current) => ({
        ...current,
        tasks: current.tasks.map((task) => (task.id === taskId ? saved : task)),
      }));
      await refreshBoard();
    } catch {
      appendLocalActivity(
        `本地更新任务「${patch.title ?? previous?.title ?? "未命名任务"}」。`
      );
      setSyncState("local");
    }
  }

  async function createTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!newTask.title.trim() || !newTask.projectId) {
      return;
    }

    const optimistic: BoardTask = {
      id: nextLocalId("local-task"),
      projectId: newTask.projectId,
      title: newTask.title.trim(),
      description: newTask.description.trim(),
      status: newTask.status,
      priority: newTask.priority,
      owner: newTask.owner.trim() || "未分配",
      startDate: "",
      dueDate: newTask.dueDate,
      estimate: 1,
      progress: 0,
      blockers: 0,
      blockedReason: "",
      tags: parseTags(newTask.tags),
      subtasks: [],
      orderIndex: board.tasks.length * 10 + 10,
      deletedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    setBoard((current) => ({ ...current, tasks: [...current.tasks, optimistic] }));
    setNewTask((current) => ({
      ...current,
      title: "",
      description: "",
      owner: "",
      dueDate: "",
      tags: "",
    }));
    openTask(optimistic.id);
    setSyncState("syncing");

    if (isLocalPreview) {
      appendLocalActivity(`本地创建任务「${optimistic.title}」。`);
      setSyncState("local");
      return;
    }

    try {
      const saved = await apiRequest<BoardTask>("/api/tasks", "POST", {
        ...newTask,
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
    } catch {
      appendLocalActivity(`本地创建任务「${optimistic.title}」。`);
      setSyncState("local");
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
      appendLocalActivity(`本地删除任务「${task.title}」。`);
      setSyncState("local");
      return;
    }

    try {
      await apiRequest(`/api/tasks/${taskId}`, "DELETE");
      await refreshBoard();
    } catch {
      appendLocalActivity(`本地删除任务「${task.title}」。`);
      setSyncState("local");
    }
  }

  function moveDuringDrag(taskId: string, targetStatus: BoardStatus, beforeTaskId?: string) {
    setBoard((current) => ({
      ...current,
      tasks: withReorderedTask(current.tasks, taskId, targetStatus, beforeTaskId),
    }));
  }

  async function persistCurrentOrder() {
    setSyncState("syncing");
    if (isLocalPreview) {
      appendLocalActivity("本地调整看板卡片顺序。", "board");
      setSyncState("local");
      return;
    }

    try {
      await apiRequest("/api/tasks/reorder", "POST", {
        updates: taskUpdates(board.tasks),
      });
      await refreshBoard();
    } catch {
      appendLocalActivity("本地调整看板卡片顺序。", "board");
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
      appendLocalActivity(`本地添加子步骤「${optimistic.title}」。`, "subtask");
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
      appendLocalActivity(`本地添加子步骤「${optimistic.title}」。`, "subtask");
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
        `${subtask.done ? "本地取消完成" : "本地完成"}子步骤「${subtask.title}」。`,
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

  const activeProjectChoices = activeProjects.length ? activeProjects : board.projects;

  return (
    <main className="min-h-screen bg-[#f4f1ea] text-[#171513]">
      <div className="mx-auto grid min-h-screen w-full max-w-[2160px] grid-rows-[auto_1fr] gap-4 px-5 py-4 2xl:px-8">
        <header className="flex flex-col gap-4 border-b border-[#d7d0c3] pb-4 2xl:flex-row 2xl:items-end 2xl:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-3 text-xs font-semibold uppercase text-[#6d655a]">
              <span className="h-2 w-2 rounded-full bg-[#1f6f68]" />
              <span>Project Operations</span>
              <span className="rounded-md border border-[#d7d0c3] px-2 py-1 normal-case text-[#3d3831]">
                {syncLabel}
              </span>
            </div>
            <h1 className="mt-3 text-3xl font-semibold 2xl:text-5xl">项目看板</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[#6d655a] 2xl:text-base">
              项目、任务、子步骤、阻塞和审计记录在一个工作台中闭环。
            </p>
          </div>
          <div className="grid grid-cols-5 gap-2 text-right">
            <Metric label="项目" value={metrics.projects} />
            <Metric label="活跃" value={metrics.active} />
            <Metric label="临期" value={metrics.dueSoon} alert={metrics.dueSoon > 0} />
            <Metric label="阻塞" value={metrics.blocked} alert={metrics.blocked > 0} />
            <Metric label="完成" value={`${metrics.completion}%`} />
          </div>
        </header>

        <section className="grid min-h-0 gap-4 lg:grid-cols-[320px_minmax(0,1fr)] 2xl:grid-cols-[340px_minmax(0,1fr)_360px]">
          <aside className="min-h-0 space-y-4 overflow-y-auto rounded-lg border border-[#d7d0c3] bg-[#fffaf2] p-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold">项目</h2>
                <button
                  type="button"
                  title="新建项目"
                  onClick={() => openProject(null)}
                  className="rounded-md border border-[#d7d0c3] p-2 text-[#3d3831] transition hover:bg-[#ece5d7]"
                >
                  <FolderPlus size={16} />
                </button>
              </div>
              <button
                type="button"
                onClick={() => setProjectFilter("all")}
                className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm transition ${
                  projectFilter === "all"
                    ? "bg-[#171513] text-[#fffaf2]"
                    : "text-[#3d3831] hover:bg-[#ece5d7]"
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
                  onArchive={() => void persistProject(project.id, { status: "archived" })}
                />
              ))}
            </div>

            <div className="space-y-2 border-t border-[#d7d0c3] pt-4">
              <h2 className="text-sm font-semibold">筛选</h2>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-2.5 text-[#81786c]" size={15} />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="任务、描述、负责人"
                  className="w-full rounded-md border border-[#d7d0c3] bg-white py-2 pl-9 pr-3 text-sm outline-none transition focus:border-[#1f6f68] focus:ring-2 focus:ring-[#1f6f68]/20"
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
                        ? "bg-[#171513] text-[#fffaf2]"
                        : "bg-[#f7efe2] text-[#3d3831] hover:bg-[#ece5d7]"
                    }`}
                  >
                    {priority === "all" ? "全部" : priorityLabels[priority]}
                  </button>
                ))}
              </div>
              <select
                value={tagFilter}
                onChange={(event) => setTagFilter(event.target.value)}
                className="w-full rounded-md border border-[#d7d0c3] bg-white px-3 py-2 text-sm"
              >
                <option value="all">全部标签</option>
                {allTags.map((tag) => (
                  <option key={tag} value={tag}>
                    {tag}
                  </option>
                ))}
              </select>
            </div>

            <form onSubmit={createTask} className="space-y-3 border-t border-[#d7d0c3] pt-4">
              <div className="flex items-center gap-2">
                <Plus size={16} />
                <h2 className="text-sm font-semibold">新任务</h2>
              </div>
              <input
                value={newTask.title}
                onChange={(event) => setNewTask((current) => ({ ...current, title: event.target.value }))}
                placeholder="任务标题"
                className="w-full rounded-md border border-[#d7d0c3] bg-white px-3 py-2 text-sm outline-none focus:border-[#1f6f68] focus:ring-2 focus:ring-[#1f6f68]/20"
              />
              <textarea
                value={newTask.description}
                onChange={(event) => setNewTask((current) => ({ ...current, description: event.target.value }))}
                placeholder="任务描述"
                rows={3}
                className="w-full resize-none rounded-md border border-[#d7d0c3] bg-white px-3 py-2 text-sm leading-6 outline-none focus:border-[#1f6f68] focus:ring-2 focus:ring-[#1f6f68]/20"
              />
              <div className="grid grid-cols-2 gap-2">
                <select
                  value={newTask.projectId}
                  onChange={(event) => setNewTask((current) => ({ ...current, projectId: event.target.value }))}
                  className="rounded-md border border-[#d7d0c3] bg-white px-2 py-2 text-sm"
                >
                  {activeProjectChoices.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </select>
                <select
                  value={newTask.status}
                  onChange={(event) => setNewTask((current) => ({ ...current, status: event.target.value as BoardStatus }))}
                  className="rounded-md border border-[#d7d0c3] bg-white px-2 py-2 text-sm"
                >
                  {board.columns.map((column) => (
                    <option key={column.id} value={column.id}>
                      {column.title}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input
                  value={newTask.owner}
                  onChange={(event) => setNewTask((current) => ({ ...current, owner: event.target.value }))}
                  placeholder="负责人"
                  className="rounded-md border border-[#d7d0c3] bg-white px-3 py-2 text-sm"
                />
                <input
                  type="date"
                  value={newTask.dueDate}
                  onChange={(event) => setNewTask((current) => ({ ...current, dueDate: event.target.value }))}
                  className="rounded-md border border-[#d7d0c3] bg-white px-3 py-2 text-sm"
                />
              </div>
              <input
                value={newTask.tags}
                onChange={(event) => setNewTask((current) => ({ ...current, tags: event.target.value }))}
                placeholder="标签，用空格或逗号分隔"
                className="w-full rounded-md border border-[#d7d0c3] bg-white px-3 py-2 text-sm"
              />
              <button
                type="submit"
                className="flex w-full items-center justify-center gap-2 rounded-md bg-[#1f6f68] px-3 py-2 text-sm font-semibold text-white transition hover:bg-[#185b55]"
              >
                <Plus size={15} />
                添加任务
              </button>
            </form>

            {archivedProjects.length > 0 ? (
              <div className="space-y-2 border-t border-[#d7d0c3] pt-4">
                <h2 className="text-sm font-semibold">归档项目</h2>
                {archivedProjects.map((project) => (
                  <button
                    key={project.id}
                    type="button"
                    onClick={() => openProject(project)}
                    className="flex w-full items-center justify-between rounded-md bg-[#f7efe2] px-3 py-2 text-left text-sm text-[#6d655a] hover:bg-[#ece5d7]"
                  >
                    <span>{project.name}</span>
                    <Archive size={14} />
                  </button>
                ))}
              </div>
            ) : null}
          </aside>

          <section className="min-w-0 overflow-hidden rounded-lg border border-[#d7d0c3] bg-[#fbf6ec]">
            <div className="grid h-full min-h-[760px] grid-cols-4 gap-3 overflow-x-auto p-3 2xl:min-h-[900px]">
              {board.columns.map((column) => {
                const columnTasks = sortTasks(
                  filteredTasks.filter((task) => task.status === column.id)
                );

                return (
                  <div
                    key={column.id}
                    onDragOver={(event) => {
                      event.preventDefault();
                      if (draggingTaskId) {
                        moveDuringDrag(draggingTaskId, column.id);
                      }
                    }}
                    onDrop={() => {
                      void persistCurrentOrder();
                      setDraggingTaskId(null);
                    }}
                    className="flex min-w-[280px] flex-col rounded-lg border border-[#d7d0c3] bg-[#f7efe2]"
                  >
                    <div className="border-b border-[#d7d0c3] px-3 py-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className={`h-2.5 w-2.5 rounded-full ${column.tone}`} />
                          <h2 className="text-sm font-semibold 2xl:text-base">{column.title}</h2>
                        </div>
                        <span className="rounded-md bg-[#e5dccd] px-2 py-1 text-xs text-[#6d655a]">
                          {columnTasks.length}
                        </span>
                      </div>
                      <p className="mt-2 text-xs leading-5 text-[#81786c]">{column.description}</p>
                    </div>
                    <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-3">
                      {columnTasks.map((task) => (
                        <TaskCard
                          key={task.id}
                          task={task}
                          todayKey={todayKey}
                          project={projectById(board.projects, task.projectId)}
                          selected={task.id === selectedTaskId}
                          onSelect={() => openTask(task.id)}
                          onDragStart={(event) => {
                            event.dataTransfer.effectAllowed = "move";
                            setDraggingTaskId(task.id);
                          }}
                          onDragOver={(event) => {
                            event.preventDefault();
                            if (draggingTaskId && draggingTaskId !== task.id) {
                              moveDuringDrag(draggingTaskId, column.id, task.id);
                            }
                          }}
                          onDragEnd={() => {
                            setDraggingTaskId(null);
                            setTrashArmed(false);
                          }}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <aside className="hidden min-h-0 overflow-hidden rounded-lg border border-[#d7d0c3] bg-[#fffaf2] 2xl:block">
            <ActivityPanel
              activity={board.activity}
              projects={board.projects}
              tasks={board.tasks}
              onOpen={() => setDrawerMode("activity")}
            />
          </aside>
        </section>
      </div>

      {draggingTaskId ? (
        <div
          onDragOver={(event) => {
            event.preventDefault();
            setTrashArmed(true);
          }}
          onDragLeave={() => setTrashArmed(false)}
          onDrop={() => {
            if (draggingTaskId) {
              void removeTask(draggingTaskId);
            }
            setDraggingTaskId(null);
            setTrashArmed(false);
          }}
          className={`fixed bottom-6 left-1/2 z-40 flex -translate-x-1/2 items-center gap-3 rounded-full border px-5 py-3 text-sm font-semibold shadow-lg transition ${
            trashArmed
              ? "border-[#b53624] bg-[#b53624] text-white"
              : "border-[#d7d0c3] bg-[#171513] text-[#fffaf2]"
          }`}
        >
          <Trash2 size={18} />
          拖到这里删除
        </div>
      ) : null}

      {drawerMode ? (
        <Drawer onClose={() => setDrawerMode(null)}>
          {drawerMode === "task" && selectedTask ? (
            <TaskDrawer
              task={selectedTask}
              projects={activeProjectChoices}
              newSubtaskTitle={newSubtaskTitle}
              setNewSubtaskTitle={setNewSubtaskTitle}
              onChange={(patch) => void persistTask(selectedTask.id, patch)}
              onDelete={() => void removeTask(selectedTask.id)}
              onCreateSubtask={createSubtask}
              onToggleSubtask={(subtask) => void toggleSubtask(selectedTask.id, subtask)}
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
                  });
                }
              }}
              onRestore={() => {
                if (selectedProject) {
                  void persistProject(selectedProject.id, { status: "active" });
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
        </Drawer>
      ) : null}
    </main>
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
          ? "border-[#c7523d] bg-[#fff2ed] text-[#8f2f20]"
          : "border-[#d7d0c3] bg-[#fffaf2]"
      }`}
    >
      <p className="text-xs text-[#6d655a]">{label}</p>
      <p className="mt-1 text-lg font-semibold 2xl:text-2xl">{value}</p>
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
      className={`rounded-md px-2 py-2 transition ${
        selected ? "bg-[#171513] text-[#fffaf2]" : "hover:bg-[#ece5d7]"
      }`}
    >
      <button type="button" onClick={onSelect} className="flex w-full items-center gap-2 text-left">
        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: project.color }} />
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{project.name}</span>
        <span className="text-xs opacity-70">{taskCount}</span>
      </button>
      <div className="mt-2 flex items-center justify-between text-xs opacity-80">
        <div className="flex items-center gap-2">
          <span>{project.owner}</span>
          <span className={`rounded px-1.5 py-0.5 ${healthTone[project.health]}`}>
            {healthLabels[project.health]}
          </span>
        </div>
        <div className="flex gap-1">
          <button type="button" title="编辑项目" onClick={onEdit} className="rounded p-1 hover:bg-white/20">
            <Edit3 size={13} />
          </button>
          <button type="button" title="归档项目" onClick={onArchive} className="rounded p-1 hover:bg-white/20">
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
  project,
  selected,
  onSelect,
  onDragStart,
  onDragOver,
  onDragEnd,
}: {
  task: BoardTask;
  todayKey: string;
  project: Project;
  selected: boolean;
  onSelect: () => void;
  onDragStart: (event: DragEvent<HTMLElement>) => void;
  onDragOver: (event: DragEvent<HTMLElement>) => void;
  onDragEnd: () => void;
}) {
  const due = daysUntil(task.dueDate, todayKey);
  const dueSoon = due !== null && due >= 0 && due <= 3 && task.status !== "done";
  const overdue = due !== null && due < 0 && task.status !== "done";
  const subtaskDone = task.subtasks.filter((step) => step.done).length;
  const progress = progressFromSubtasks(task.subtasks, task.progress);

  return (
    <article
      draggable
      onClick={onSelect}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      className={`group cursor-pointer rounded-lg border bg-white p-3 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${
        selected ? "border-[#1f6f68] ring-2 ring-[#1f6f68]/20" : "border-[#ded6c8]"
      } ${dueSoon || overdue ? "border-[#c7523d] bg-[#fff8f4]" : ""}`}
    >
      <div className="flex items-start gap-2">
        <GripVertical className="mt-0.5 shrink-0 text-[#b7aa98] opacity-60 group-hover:opacity-100" size={16} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <h3 className="text-sm font-semibold leading-5 2xl:text-[15px]">{task.title}</h3>
            <span className={`shrink-0 rounded-md border px-2 py-0.5 text-xs ${priorityTone[task.priority]}`}>
              {priorityLabels[task.priority]}
            </span>
          </div>
          <p className="mt-2 line-clamp-2 text-xs leading-5 text-[#6d655a]">
            {task.description || "暂无描述"}
          </p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-1">
        {task.tags.slice(0, 4).map((tag) => (
          <span key={tag} className="inline-flex items-center gap-1 rounded-md bg-[#f0e6d7] px-2 py-0.5 text-[11px] text-[#6d655a]">
            <Tag size={10} />
            {tag}
          </span>
        ))}
      </div>

      <div className="mt-3 flex items-center gap-2 text-xs text-[#6d655a]">
        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: project.color }} />
        <span className="truncate">{project.name}</span>
        <span>·</span>
        <span>{task.owner}</span>
      </div>

      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[#ece5d7]">
        <div
          className="h-full rounded-full bg-[#1f6f68] transition-all"
          style={{ width: `${progress}%` }}
        />
      </div>

      <div className="mt-3 flex items-center justify-between text-xs text-[#81786c]">
        <span className={dueSoon || overdue ? "font-semibold text-[#a63d2d]" : ""}>
          {task.dueDate || "无截止日"}
          {dueSoon ? " · 临期" : ""}
          {overdue ? " · 逾期" : ""}
        </span>
        <span className={task.blockers > 0 ? "font-semibold text-[#a63d2d]" : ""}>
          {task.blockers > 0
            ? `${task.blockers} 个阻塞`
            : task.subtasks.length
              ? `${subtaskDone}/${task.subtasks.length} 步`
              : due === null
                ? "未排期"
                : `${due} 天`}
        </span>
      </div>
    </article>
  );
}

function Drawer({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/20">
      <button type="button" aria-label="关闭抽屉" className="absolute inset-0 cursor-default" onClick={onClose} />
      <aside className="absolute right-0 top-0 h-full w-full max-w-[560px] overflow-y-auto border-l border-[#d7d0c3] bg-[#fffaf2] p-5 shadow-2xl">
        <button
          type="button"
          title="关闭"
          onClick={onClose}
          className="absolute right-4 top-4 rounded-md border border-[#d7d0c3] p-2 hover:bg-[#ece5d7]"
        >
          <X size={16} />
        </button>
        {children}
      </aside>
    </div>
  );
}

function TaskDrawer({
  task,
  projects,
  newSubtaskTitle,
  setNewSubtaskTitle,
  onChange,
  onDelete,
  onCreateSubtask,
  onToggleSubtask,
}: {
  task: BoardTask;
  projects: Project[];
  newSubtaskTitle: string;
  setNewSubtaskTitle: (value: string) => void;
  onChange: (patch: Partial<BoardTask>) => void;
  onDelete: () => void;
  onCreateSubtask: (event: FormEvent<HTMLFormElement>) => void;
  onToggleSubtask: (subtask: Subtask) => void;
}) {
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description);
  const [tagsText, setTagsText] = useState(task.tags.join(" "));

  return (
    <section className="space-y-5 pr-10">
      <div>
        <p className="text-xs font-semibold uppercase text-[#6d655a]">任务详情</p>
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          onBlur={() => onChange({ title })}
          className="mt-2 w-full rounded-md border border-[#d7d0c3] bg-white px-3 py-2 text-xl font-semibold outline-none focus:border-[#1f6f68] focus:ring-2 focus:ring-[#1f6f68]/20"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="项目">
          <select value={task.projectId} onChange={(event) => onChange({ projectId: event.target.value })}>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="状态">
          <select value={task.status} onChange={(event) => onChange({ status: event.target.value as BoardStatus })}>
            {Object.entries(statusNames).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="优先级">
          <select value={task.priority} onChange={(event) => onChange({ priority: event.target.value as Priority })}>
            <option value="high">高</option>
            <option value="medium">中</option>
            <option value="low">低</option>
          </select>
        </Field>
        <Field label="截止日">
          <input type="date" value={task.dueDate} onChange={(event) => onChange({ dueDate: event.target.value })} />
        </Field>
      </div>

      <Field label="负责人">
        <input value={task.owner} onChange={(event) => onChange({ owner: event.target.value })} />
      </Field>

      <Field label="描述">
        <textarea
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          onBlur={() => onChange({ description })}
          rows={5}
          className="resize-none leading-6"
        />
      </Field>

      <div className="grid grid-cols-[1fr_110px] gap-3">
        <Field label={`进度 ${task.progress}%`}>
          <input
            type="range"
            min="0"
            max="100"
            value={task.progress}
            onChange={(event) => onChange({ progress: Number(event.target.value) })}
            className="accent-[#1f6f68]"
          />
        </Field>
        <Field label="阻塞项">
          <input
            type="number"
            min="0"
            max="99"
            value={task.blockers}
            onChange={(event) => onChange({ blockers: Number(event.target.value) })}
          />
        </Field>
      </div>

      <Field label="阻塞说明">
        <input
          value={task.blockedReason}
          onChange={(event) => onChange({ blockedReason: event.target.value })}
          placeholder="没有阻塞时可留空"
        />
      </Field>

      <Field label="标签">
        <input
          value={tagsText}
          onChange={(event) => setTagsText(event.target.value)}
          onBlur={() => onChange({ tags: parseTags(tagsText) })}
          placeholder="例如：接口 复盘 移动端"
        />
      </Field>

      <section className="space-y-3 border-t border-[#d7d0c3] pt-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">子步骤</h2>
          <span className="text-xs text-[#81786c]">
            {task.subtasks.filter((step) => step.done).length}/{task.subtasks.length}
          </span>
        </div>
        <div className="space-y-2">
          {task.subtasks.map((step) => (
            <button
              key={step.id}
              type="button"
              onClick={() => onToggleSubtask(step)}
              className={`flex w-full items-center gap-3 rounded-md border px-3 py-2 text-left text-sm transition ${
                step.done
                  ? "border-[#c8d8bf] bg-[#edf6ea] text-[#58704e]"
                  : "border-[#d7d0c3] bg-white hover:bg-[#f7efe2]"
              }`}
            >
              <span
                className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border transition ${
                  step.done
                    ? "scale-105 border-[#4f7a45] bg-[#4f7a45] text-white"
                    : "border-[#b7aa98] bg-white"
                }`}
              >
                {step.done ? <Check size={13} /> : null}
              </span>
              <span className={`transition ${step.done ? "text-[#6d8064] line-through opacity-70" : ""}`}>
                {step.title}
              </span>
            </button>
          ))}
        </div>
        <form onSubmit={onCreateSubtask} className="flex gap-2">
          <input
            value={newSubtaskTitle}
            onChange={(event) => setNewSubtaskTitle(event.target.value)}
            placeholder="添加子步骤"
            className="flex-1"
          />
          <button type="submit" title="添加子步骤" className="rounded-md bg-[#1f6f68] px-3 text-white">
            <Plus size={16} />
          </button>
        </form>
      </section>

      <button
        type="button"
        onClick={onDelete}
        className="flex w-full items-center justify-center gap-2 rounded-md border border-[#c7523d] px-3 py-2 text-sm font-semibold text-[#9a3d24] transition hover:bg-[#fff2ed]"
      >
        <Trash2 size={16} />
        删除任务
      </button>
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
        <p className="text-xs font-semibold uppercase text-[#6d655a]">
          {project ? "项目设置" : "新建项目"}
        </p>
        <h2 className="mt-2 text-2xl font-semibold">{project?.name ?? "创建项目"}</h2>
      </div>

      <form onSubmit={onSubmit} className="space-y-4">
        <Field label="项目名称">
          <input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
        </Field>
        <Field label="项目描述">
          <textarea
            value={draft.description}
            onChange={(event) => setDraft({ ...draft, description: event.target.value })}
            rows={4}
            className="resize-none leading-6"
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="负责人">
            <input value={draft.owner} onChange={(event) => setDraft({ ...draft, owner: event.target.value })} />
          </Field>
          <Field label="健康度">
            <select value={draft.health} onChange={(event) => setDraft({ ...draft, health: event.target.value as ProjectHealth })}>
              <option value="good">正常</option>
              <option value="normal">关注</option>
              <option value="risk">风险</option>
            </select>
          </Field>
        </div>
        <Field label="颜色">
          <input type="color" value={draft.color} onChange={(event) => setDraft({ ...draft, color: event.target.value })} />
        </Field>
        <Field label="归档总结">
          <textarea
            value={draft.summary}
            onChange={(event) => setDraft({ ...draft, summary: event.target.value })}
            rows={5}
            placeholder="项目完成后记录结果、经验和后续建议"
            className="resize-none leading-6"
          />
        </Field>
        <button type="submit" className="flex w-full items-center justify-center gap-2 rounded-md bg-[#1f6f68] px-3 py-2 text-sm font-semibold text-white">
          <CheckCircle2 size={16} />
          保存项目
        </button>
      </form>

      {project ? (
        <div className="grid grid-cols-2 gap-2 border-t border-[#d7d0c3] pt-4">
          {project.status === "archived" ? (
            <button type="button" onClick={onRestore} className="flex items-center justify-center gap-2 rounded-md border border-[#d7d0c3] px-3 py-2 text-sm">
              <ArchiveRestore size={15} />
              恢复
            </button>
          ) : (
            <button type="button" onClick={() => onArchive(draft.summary)} className="flex items-center justify-center gap-2 rounded-md border border-[#d7d0c3] px-3 py-2 text-sm">
              <Archive size={15} />
              归档
            </button>
          )}
          <button type="button" onClick={onDelete} className="flex items-center justify-center gap-2 rounded-md border border-[#c7523d] px-3 py-2 text-sm text-[#9a3d24]">
            <Trash2 size={15} />
            删除
          </button>
        </div>
      ) : null}
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
      <div className="flex items-center justify-between border-b border-[#d7d0c3] px-4 py-3">
        <div className="flex items-center gap-2">
          <Activity size={16} />
          <h2 className="text-sm font-semibold">活动记录</h2>
        </div>
        {onOpen ? (
          <button type="button" title="打开活动抽屉" onClick={onOpen} className="rounded-md p-2 hover:bg-[#ece5d7]">
            <PanelRightOpen size={15} />
          </button>
        ) : null}
      </div>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
        {activity.slice(0, expanded ? 80 : 18).map((item) => {
          const project = item.projectId ? projects.find((candidate) => candidate.id === item.projectId) : null;
          const task = item.taskId ? tasks.find((candidate) => candidate.id === item.taskId) : null;
          return (
            <div key={item.id} className="border-l-2 border-[#1f6f68] pl-3">
              <p className="text-sm leading-5 text-[#3d3831]">{item.message}</p>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[#81786c]">
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

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="space-y-1 text-xs font-semibold text-[#6d655a] [&_input]:w-full [&_input]:rounded-md [&_input]:border [&_input]:border-[#d7d0c3] [&_input]:bg-white [&_input]:px-3 [&_input]:py-2 [&_input]:text-sm [&_select]:w-full [&_select]:rounded-md [&_select]:border [&_select]:border-[#d7d0c3] [&_select]:bg-white [&_select]:px-3 [&_select]:py-2 [&_select]:text-sm [&_textarea]:w-full [&_textarea]:rounded-md [&_textarea]:border [&_textarea]:border-[#d7d0c3] [&_textarea]:bg-white [&_textarea]:px-3 [&_textarea]:py-2 [&_textarea]:text-sm">
      <span>{label}</span>
      {children}
    </label>
  );
}
