"use client";

import {
  useEffect,
  useMemo,
  useState,
  type DragEvent,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  priorityLabels,
  type BoardData,
  type BoardStatus,
  type BoardTask,
  type Priority,
  type Project,
} from "@/lib/board-data";

type SyncState = "synced" | "syncing" | "local";

type NewTaskForm = {
  title: string;
  projectId: string;
  owner: string;
  priority: Priority;
  status: BoardStatus;
  dueDate: string;
};

const statusNames: Record<BoardStatus, string> = {
  backlog: "需求池",
  planned: "计划中",
  progress: "进行中",
  review: "验收中",
  done: "已完成",
};

const priorityTone: Record<Priority, string> = {
  high: "border-[#c7523d] bg-[#fff2ed] text-[#8f2f20]",
  medium: "border-[#c69b38] bg-[#fff8df] text-[#7c5b13]",
  low: "border-[#5a8752] bg-[#eff8ed] text-[#35612f]",
};

const fallbackProject: Project = {
  id: "unassigned",
  name: "未归属",
  owner: "未分配",
  color: "#6f6a5f",
  health: "normal",
  createdAt: "",
  updatedAt: "",
};

function daysUntil(date: string) {
  if (!date) {
    return null;
  }

  const due = new Date(`${date}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
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

function formatActivityTime(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/);
  if (!match) {
    return value;
  }

  return `${match[2]}/${match[3]} ${match[4]}:${match[5]}`;
}

export default function KanbanApp({ initialBoard }: { initialBoard: BoardData }) {
  const [board, setBoard] = useState(initialBoard);
  const [selectedTaskId, setSelectedTaskId] = useState(
    initialBoard.tasks[0]?.id ?? ""
  );
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [syncState, setSyncState] = useState<SyncState>("syncing");
  const [search, setSearch] = useState("");
  const [projectFilter, setProjectFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState<Priority | "all">("all");
  const [newTask, setNewTask] = useState<NewTaskForm>({
    title: "",
    projectId: initialBoard.projects[0]?.id ?? "",
    owner: "",
    priority: "medium",
    status: "backlog",
    dueDate: "",
  });

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
        setSelectedTaskId(data.tasks[0]?.id ?? "");
        setSyncState("synced");
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

  const filteredTasks = useMemo(() => {
    const query = search.trim().toLowerCase();

    return board.tasks.filter((task) => {
      const matchesProject =
        projectFilter === "all" || task.projectId === projectFilter;
      const matchesPriority =
        priorityFilter === "all" || task.priority === priorityFilter;
      const matchesSearch =
        !query ||
        task.title.toLowerCase().includes(query) ||
        task.owner.toLowerCase().includes(query) ||
        task.tags.some((tag) => tag.toLowerCase().includes(query));

      return matchesProject && matchesPriority && matchesSearch;
    });
  }, [board.tasks, priorityFilter, projectFilter, search]);

  const selectedTask =
    board.tasks.find((task) => task.id === selectedTaskId) ??
    filteredTasks[0] ??
    board.tasks[0];

  const metrics = useMemo(() => {
    const activeTasks = board.tasks.filter((task) => task.status !== "done");
    const blocked = board.tasks.filter((task) => task.blockers > 0);
    const dueSoon = board.tasks.filter((task) => {
      const days = daysUntil(task.dueDate);
      return days !== null && days >= 0 && days <= 7 && task.status !== "done";
    });
    const completed = board.tasks.filter((task) => task.status === "done");

    return {
      active: activeTasks.length,
      blocked: blocked.length,
      dueSoon: dueSoon.length,
      completion: board.tasks.length
        ? Math.round((completed.length / board.tasks.length) * 100)
        : 0,
    };
  }, [board.tasks]);

  function applyTaskUpdate(id: string, patch: Partial<BoardTask>) {
    setBoard((current) => ({
      ...current,
      tasks: current.tasks.map((task) =>
        task.id === id
          ? { ...task, ...patch, updatedAt: new Date().toISOString() }
          : task
      ),
    }));
  }

  async function persistTask(id: string, patch: Partial<BoardTask>) {
    const previous = board.tasks.find((task) => task.id === id);
    applyTaskUpdate(id, patch);
    setSyncState("syncing");

    try {
      const response = await fetch(`/api/tasks/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });

      if (!response.ok) {
        throw new Error("Unable to save task");
      }

      const saved = (await response.json()) as BoardTask;
      setBoard((current) => ({
        ...current,
        tasks: current.tasks.map((task) => (task.id === id ? saved : task)),
      }));
      setSyncState("synced");
    } catch {
      if (previous) {
        setBoard((current) => ({
          ...current,
          tasks: current.tasks.map((task) => (task.id === id ? previous : task)),
        }));
      }
      setSyncState("local");
    }
  }

  function onDrop(status: BoardStatus) {
    if (!draggedTaskId) {
      return;
    }

    void persistTask(draggedTaskId, { status });
    setDraggedTaskId(null);
  }

  async function createTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!newTask.title.trim()) {
      return;
    }

    const optimistic: BoardTask = {
      id: `local-${Date.now()}`,
      projectId: newTask.projectId,
      title: newTask.title.trim(),
      description: "",
      status: newTask.status,
      priority: newTask.priority,
      owner: newTask.owner.trim() || "未分配",
      startDate: "",
      dueDate: newTask.dueDate,
      estimate: 1,
      progress: 0,
      blockers: 0,
      tags: [],
      orderIndex: board.tasks.length * 10 + 10,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    setBoard((current) => ({ ...current, tasks: [...current.tasks, optimistic] }));
    setSelectedTaskId(optimistic.id);
    setNewTask((current) => ({ ...current, title: "", owner: "", dueDate: "" }));
    setSyncState("syncing");

    try {
      const response = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newTask),
      });

      if (!response.ok) {
        throw new Error("Unable to create task");
      }

      const saved = (await response.json()) as BoardTask;
      setBoard((current) => ({
        ...current,
        tasks: current.tasks.map((task) =>
          task.id === optimistic.id ? saved : task
        ),
      }));
      setSelectedTaskId(saved.id);
      setSyncState("synced");
    } catch {
      setSyncState("local");
    }
  }

  const syncLabel = {
    synced: "已保存",
    syncing: "同步中",
    local: "本地预览",
  }[syncState];

  return (
    <main className="min-h-screen bg-[#f4f1ea] text-[#171513]">
      <div className="mx-auto flex min-h-screen w-full max-w-[1560px] flex-col gap-5 px-4 py-4 sm:px-6 lg:px-8">
        <header className="grid gap-4 border-b border-[#d7d0c3] pb-5 lg:grid-cols-[1fr_auto]">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-3 text-xs font-semibold uppercase text-[#6d655a]">
              <span className="h-2 w-2 rounded-full bg-[#1f6f68]" />
              <span>Project Operations</span>
              <span className="rounded-md border border-[#d7d0c3] px-2 py-1 normal-case text-[#3d3831]">
                {syncLabel}
              </span>
            </div>
            <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
              <div>
                <h1 className="text-3xl font-semibold sm:text-4xl">项目看板</h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-[#6d655a]">
                  汇总计划、执行、验收和风险，让每个项目的下一步都在同一屏可见。
                </p>
              </div>
              <div className="grid grid-cols-4 gap-2 text-right">
                <Metric label="活跃" value={metrics.active} />
                <Metric label="临期" value={metrics.dueSoon} />
                <Metric label="阻塞" value={metrics.blocked} />
                <Metric label="完成" value={`${metrics.completion}%`} />
              </div>
            </div>
          </div>
        </header>

        <section className="grid flex-1 gap-4 lg:grid-cols-[240px_minmax(0,1fr)] xl:grid-cols-[260px_minmax(0,1fr)_330px]">
          <aside className="space-y-4 rounded-lg border border-[#d7d0c3] bg-[#fffaf2] p-4">
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase text-[#6d655a]">
                搜索
              </label>
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="任务、负责人、标签"
                className="w-full rounded-md border border-[#d7d0c3] bg-white px-3 py-2 text-sm outline-none transition focus:border-[#1f6f68] focus:ring-2 focus:ring-[#1f6f68]/20"
              />
            </div>

            <FilterGroup title="项目">
              <button
                type="button"
                onClick={() => setProjectFilter("all")}
                className={`w-full rounded-md px-3 py-2 text-left text-sm transition ${
                  projectFilter === "all"
                    ? "bg-[#171513] text-[#fffaf2]"
                    : "text-[#3d3831] hover:bg-[#ece5d7]"
                }`}
              >
                全部项目
              </button>
              {board.projects.map((project) => (
                <button
                  key={project.id}
                  type="button"
                  onClick={() => setProjectFilter(project.id)}
                  className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition ${
                    projectFilter === project.id
                      ? "bg-[#171513] text-[#fffaf2]"
                      : "text-[#3d3831] hover:bg-[#ece5d7]"
                  }`}
                >
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: project.color }}
                  />
                  <span>{project.name}</span>
                </button>
              ))}
            </FilterGroup>

            <FilterGroup title="优先级">
              {(["all", "high", "medium", "low"] as const).map((priority) => (
                <button
                  key={priority}
                  type="button"
                  onClick={() => setPriorityFilter(priority)}
                  className={`rounded-md px-3 py-2 text-left text-sm transition ${
                    priorityFilter === priority
                      ? "bg-[#171513] text-[#fffaf2]"
                      : "text-[#3d3831] hover:bg-[#ece5d7]"
                  }`}
                >
                  {priority === "all"
                    ? "全部优先级"
                    : `${priorityLabels[priority]}优先级`}
                </button>
              ))}
            </FilterGroup>

            <form
              onSubmit={createTask}
              className="space-y-3 border-t border-[#d7d0c3] pt-4"
            >
              <h2 className="text-sm font-semibold">新任务</h2>
              <input
                value={newTask.title}
                onChange={(event) =>
                  setNewTask((current) => ({
                    ...current,
                    title: event.target.value,
                  }))
                }
                placeholder="任务标题"
                className="w-full rounded-md border border-[#d7d0c3] bg-white px-3 py-2 text-sm outline-none transition focus:border-[#1f6f68] focus:ring-2 focus:ring-[#1f6f68]/20"
              />
              <div className="grid grid-cols-2 gap-2">
                <select
                  value={newTask.projectId}
                  onChange={(event) =>
                    setNewTask((current) => ({
                      ...current,
                      projectId: event.target.value,
                    }))
                  }
                  className="rounded-md border border-[#d7d0c3] bg-white px-2 py-2 text-sm"
                >
                  {board.projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </select>
                <select
                  value={newTask.priority}
                  onChange={(event) =>
                    setNewTask((current) => ({
                      ...current,
                      priority: event.target.value as Priority,
                    }))
                  }
                  className="rounded-md border border-[#d7d0c3] bg-white px-2 py-2 text-sm"
                >
                  <option value="high">高</option>
                  <option value="medium">中</option>
                  <option value="low">低</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input
                  value={newTask.owner}
                  onChange={(event) =>
                    setNewTask((current) => ({
                      ...current,
                      owner: event.target.value,
                    }))
                  }
                  placeholder="负责人"
                  className="rounded-md border border-[#d7d0c3] bg-white px-3 py-2 text-sm"
                />
                <input
                  type="date"
                  value={newTask.dueDate}
                  onChange={(event) =>
                    setNewTask((current) => ({
                      ...current,
                      dueDate: event.target.value,
                    }))
                  }
                  className="rounded-md border border-[#d7d0c3] bg-white px-3 py-2 text-sm"
                />
              </div>
              <button
                type="submit"
                className="w-full rounded-md bg-[#1f6f68] px-3 py-2 text-sm font-semibold text-white transition hover:bg-[#185b55]"
              >
                添加任务
              </button>
            </form>
          </aside>

          <section className="min-w-0 overflow-hidden rounded-lg border border-[#d7d0c3] bg-[#fbf6ec]">
            <div className="flex h-full min-h-[620px] gap-3 overflow-x-auto p-3">
              {board.columns.map((column) => {
                const columnTasks = sortTasks(
                  filteredTasks.filter((task) => task.status === column.id)
                );

                return (
                  <div
                    key={column.id}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={() => onDrop(column.id)}
                    className="flex min-w-[240px] flex-1 flex-col rounded-lg border border-[#d7d0c3] bg-[#f7efe2]"
                  >
                    <div className="flex items-center justify-between border-b border-[#d7d0c3] px-3 py-3">
                      <div className="flex items-center gap-2">
                        <span
                          className={`h-2.5 w-2.5 rounded-full ${column.tone}`}
                        />
                        <h2 className="text-sm font-semibold">{column.title}</h2>
                      </div>
                      <span className="rounded-md bg-[#e5dccd] px-2 py-1 text-xs text-[#6d655a]">
                        {columnTasks.length}
                      </span>
                    </div>
                    <div className="flex flex-1 flex-col gap-3 p-3">
                      {columnTasks.map((task) => (
                        <TaskCard
                          key={task.id}
                          task={task}
                          project={projectById(board.projects, task.projectId)}
                          selected={task.id === selectedTask?.id}
                          onSelect={() => setSelectedTaskId(task.id)}
                          onDragStart={(event) => {
                            event.dataTransfer.effectAllowed = "move";
                            setDraggedTaskId(task.id);
                          }}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <aside className="space-y-4 rounded-lg border border-[#d7d0c3] bg-[#fffaf2] p-4 lg:col-span-2 xl:col-span-1">
            {selectedTask ? (
              <TaskInspector
                key={selectedTask.id}
                task={selectedTask}
                projects={board.projects}
                onChange={(patch) => void persistTask(selectedTask.id, patch)}
              />
            ) : null}

            <section className="space-y-3 border-t border-[#d7d0c3] pt-4">
              <h2 className="text-sm font-semibold">活动记录</h2>
              <div className="space-y-3">
                {board.activity.slice(0, 5).map((item) => (
                  <div key={item.id} className="border-l-2 border-[#1f6f68] pl-3">
                    <p className="text-sm leading-5 text-[#3d3831]">
                      {item.message}
                    </p>
                    <p className="mt-1 text-xs text-[#81786c]">
                      {formatActivityTime(item.createdAt)}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          </aside>
        </section>
      </div>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-lg border border-[#d7d0c3] bg-[#fffaf2] px-3 py-2">
      <p className="text-xs text-[#6d655a]">{label}</p>
      <p className="mt-1 text-lg font-semibold">{value}</p>
    </div>
  );
}

function FilterGroup({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-2">
      <h2 className="text-xs font-semibold uppercase text-[#6d655a]">{title}</h2>
      <div className="grid gap-1">{children}</div>
    </section>
  );
}

function TaskCard({
  task,
  project,
  selected,
  onSelect,
  onDragStart,
}: {
  task: BoardTask;
  project: Project;
  selected: boolean;
  onSelect: () => void;
  onDragStart: (event: DragEvent<HTMLElement>) => void;
}) {
  const due = daysUntil(task.dueDate);

  return (
    <article
      draggable
      onClick={onSelect}
      onDragStart={onDragStart}
      className={`cursor-pointer rounded-lg border bg-white p-3 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${
        selected
          ? "border-[#1f6f68] ring-2 ring-[#1f6f68]/20"
          : "border-[#ded6c8]"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-sm font-semibold leading-5">{task.title}</h3>
        <span
          className={`shrink-0 rounded-md border px-2 py-0.5 text-xs ${priorityTone[task.priority]}`}
        >
          {priorityLabels[task.priority]}
        </span>
      </div>
      <p className="mt-2 line-clamp-2 text-xs leading-5 text-[#6d655a]">
        {task.description || "暂无描述"}
      </p>
      <div className="mt-3 flex items-center gap-2 text-xs text-[#6d655a]">
        <span
          className="h-2 w-2 rounded-full"
          style={{ backgroundColor: project.color }}
        />
        <span>{project.name}</span>
        <span>·</span>
        <span>{task.owner}</span>
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[#ece5d7]">
        <div
          className="h-full rounded-full bg-[#1f6f68] transition-all"
          style={{ width: `${task.progress}%` }}
        />
      </div>
      <div className="mt-3 flex items-center justify-between text-xs text-[#81786c]">
        <span>{task.dueDate || "无截止日"}</span>
        <span
          className={task.blockers > 0 ? "font-semibold text-[#a63d2d]" : ""}
        >
          {task.blockers > 0
            ? `${task.blockers} 个阻塞`
            : due === null
              ? "未排期"
              : due < 0
                ? "已逾期"
                : `${due} 天`}
        </span>
      </div>
    </article>
  );
}

function TaskInspector({
  task,
  projects,
  onChange,
}: {
  task: BoardTask;
  projects: Project[];
  onChange: (patch: Partial<BoardTask>) => void;
}) {
  const [draftTitle, setDraftTitle] = useState(task.title);
  const [draftDescription, setDraftDescription] = useState(task.description);

  return (
    <section className="space-y-4">
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase text-[#6d655a]">
          任务详情
        </p>
        <input
          value={draftTitle}
          onChange={(event) => setDraftTitle(event.target.value)}
          onBlur={() => onChange({ title: draftTitle })}
          className="w-full rounded-md border border-[#d7d0c3] bg-white px-3 py-2 text-lg font-semibold outline-none focus:border-[#1f6f68] focus:ring-2 focus:ring-[#1f6f68]/20"
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Field label="项目">
          <select
            value={task.projectId}
            onChange={(event) => onChange({ projectId: event.target.value })}
            className="w-full rounded-md border border-[#d7d0c3] bg-white px-2 py-2 text-sm"
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
            value={task.status}
            onChange={(event) =>
              onChange({ status: event.target.value as BoardStatus })
            }
            className="w-full rounded-md border border-[#d7d0c3] bg-white px-2 py-2 text-sm"
          >
            {Object.entries(statusNames).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="优先级">
          <select
            value={task.priority}
            onChange={(event) =>
              onChange({ priority: event.target.value as Priority })
            }
            className="w-full rounded-md border border-[#d7d0c3] bg-white px-2 py-2 text-sm"
          >
            <option value="high">高</option>
            <option value="medium">中</option>
            <option value="low">低</option>
          </select>
        </Field>
        <Field label="截止日">
          <input
            type="date"
            value={task.dueDate}
            onChange={(event) => onChange({ dueDate: event.target.value })}
            className="w-full rounded-md border border-[#d7d0c3] bg-white px-2 py-2 text-sm"
          />
        </Field>
      </div>

      <Field label="负责人">
        <input
          value={task.owner}
          onChange={(event) => onChange({ owner: event.target.value })}
          className="w-full rounded-md border border-[#d7d0c3] bg-white px-3 py-2 text-sm"
        />
      </Field>

      <Field label="描述">
        <textarea
          value={draftDescription}
          onChange={(event) => setDraftDescription(event.target.value)}
          onBlur={() => onChange({ description: draftDescription })}
          rows={4}
          className="w-full resize-none rounded-md border border-[#d7d0c3] bg-white px-3 py-2 text-sm leading-6"
        />
      </Field>

      <div className="grid grid-cols-[1fr_88px] items-end gap-3">
        <Field label={`进度 ${task.progress}%`}>
          <input
            type="range"
            min="0"
            max="100"
            value={task.progress}
            onChange={(event) =>
              onChange({ progress: Number(event.target.value) })
            }
            className="w-full accent-[#1f6f68]"
          />
        </Field>
        <Field label="阻塞">
          <input
            type="number"
            min="0"
            max="9"
            value={task.blockers}
            onChange={(event) =>
              onChange({ blockers: Number(event.target.value) })
            }
            className="w-full rounded-md border border-[#d7d0c3] bg-white px-2 py-2 text-sm"
          />
        </Field>
      </div>

      <div className="flex flex-wrap gap-2">
        {task.tags.length ? (
          task.tags.map((tag) => (
            <span
              key={tag}
              className="rounded-md border border-[#d7d0c3] bg-[#f7efe2] px-2 py-1 text-xs text-[#6d655a]"
            >
              {tag}
            </span>
          ))
        ) : (
          <span className="text-xs text-[#81786c]">无标签</span>
        )}
      </div>
    </section>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="space-y-1 text-xs font-semibold text-[#6d655a]">
      <span>{label}</span>
      {children}
    </label>
  );
}
