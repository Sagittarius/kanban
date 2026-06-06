export type BoardStatus = "backlog" | "planned" | "progress" | "review" | "done";
export type Priority = "high" | "medium" | "low";

export type BoardColumn = {
  id: BoardStatus;
  title: string;
  tone: string;
};

export type Project = {
  id: string;
  name: string;
  owner: string;
  color: string;
  health: "good" | "normal" | "risk";
  createdAt: string;
  updatedAt: string;
};

export type BoardTask = {
  id: string;
  projectId: string;
  title: string;
  description: string;
  status: BoardStatus;
  priority: Priority;
  owner: string;
  startDate: string;
  dueDate: string;
  estimate: number;
  progress: number;
  blockers: number;
  tags: string[];
  orderIndex: number;
  createdAt: string;
  updatedAt: string;
};

export type TaskActivity = {
  id: string;
  taskId: string;
  message: string;
  createdAt: string;
};

export type BoardData = {
  columns: BoardColumn[];
  projects: Project[];
  tasks: BoardTask[];
  activity: TaskActivity[];
};

const seedTime = "2026-06-06T09:00:00.000Z";

export const boardColumns: BoardColumn[] = [
  { id: "backlog", title: "需求池", tone: "bg-[#6f6a5f]" },
  { id: "planned", title: "计划中", tone: "bg-[#b45f3c]" },
  { id: "progress", title: "进行中", tone: "bg-[#1f6f68]" },
  { id: "review", title: "验收中", tone: "bg-[#7b4f82]" },
  { id: "done", title: "已完成", tone: "bg-[#4f7a45]" },
];

export const priorityLabels: Record<Priority, string> = {
  high: "高",
  medium: "中",
  low: "低",
};

export const seedProjects: Project[] = [
  {
    id: "core-platform",
    name: "核心平台",
    owner: "Vincent",
    color: "#1f6f68",
    health: "good",
    createdAt: seedTime,
    updatedAt: seedTime,
  },
  {
    id: "mobile-delivery",
    name: "移动端交付",
    owner: "产品组",
    color: "#b45f3c",
    health: "normal",
    createdAt: seedTime,
    updatedAt: seedTime,
  },
  {
    id: "growth-ops",
    name: "增长运营",
    owner: "运营组",
    color: "#7b4f82",
    health: "risk",
    createdAt: seedTime,
    updatedAt: seedTime,
  },
];

export const seedTasks: BoardTask[] = [
  {
    id: "task-001",
    projectId: "core-platform",
    title: "梳理 Q3 里程碑和依赖",
    description: "确认平台、数据、客户端三条线的关键依赖，形成可执行排期。",
    status: "planned",
    priority: "high",
    owner: "Vincent",
    startDate: "2026-06-08",
    dueDate: "2026-06-12",
    estimate: 5,
    progress: 30,
    blockers: 0,
    tags: ["规划", "依赖"],
    orderIndex: 10,
    createdAt: seedTime,
    updatedAt: seedTime,
  },
  {
    id: "task-002",
    projectId: "core-platform",
    title: "接口健康度巡检面板",
    description: "把异常率、延迟和最近部署事件放到同一个视图里。",
    status: "progress",
    priority: "high",
    owner: "后端组",
    startDate: "2026-06-03",
    dueDate: "2026-06-10",
    estimate: 8,
    progress: 62,
    blockers: 1,
    tags: ["监控", "API"],
    orderIndex: 20,
    createdAt: seedTime,
    updatedAt: seedTime,
  },
  {
    id: "task-003",
    projectId: "mobile-delivery",
    title: "移动端任务详情重排",
    description: "把负责人、截止时间和阻塞原因放到首屏可见区域。",
    status: "review",
    priority: "medium",
    owner: "前端组",
    startDate: "2026-06-01",
    dueDate: "2026-06-07",
    estimate: 3,
    progress: 88,
    blockers: 0,
    tags: ["移动端", "体验"],
    orderIndex: 30,
    createdAt: seedTime,
    updatedAt: seedTime,
  },
  {
    id: "task-004",
    projectId: "growth-ops",
    title: "发布节奏复盘",
    description: "整理最近四次发布中延期、返工和审批卡点。",
    status: "backlog",
    priority: "medium",
    owner: "运营组",
    startDate: "",
    dueDate: "2026-06-18",
    estimate: 2,
    progress: 0,
    blockers: 0,
    tags: ["复盘"],
    orderIndex: 40,
    createdAt: seedTime,
    updatedAt: seedTime,
  },
  {
    id: "task-005",
    projectId: "core-platform",
    title: "验收数据导出规则",
    description: "明确字段口径、权限边界和异常数据处理方式。",
    status: "done",
    priority: "low",
    owner: "数据组",
    startDate: "2026-05-28",
    dueDate: "2026-06-05",
    estimate: 4,
    progress: 100,
    blockers: 0,
    tags: ["数据", "验收"],
    orderIndex: 50,
    createdAt: seedTime,
    updatedAt: seedTime,
  },
  {
    id: "task-006",
    projectId: "mobile-delivery",
    title: "缺陷分级规则补充",
    description: "补齐线上阻断、普通缺陷和体验问题的处理时限。",
    status: "progress",
    priority: "high",
    owner: "QA",
    startDate: "2026-06-04",
    dueDate: "2026-06-09",
    estimate: 3,
    progress: 45,
    blockers: 1,
    tags: ["QA", "流程"],
    orderIndex: 60,
    createdAt: seedTime,
    updatedAt: seedTime,
  },
  {
    id: "task-007",
    projectId: "growth-ops",
    title: "客户案例素材池",
    description: "沉淀可复用案例、截图和行业标签，支持后续活动页面。",
    status: "planned",
    priority: "low",
    owner: "市场组",
    startDate: "2026-06-11",
    dueDate: "2026-06-20",
    estimate: 5,
    progress: 12,
    blockers: 0,
    tags: ["素材", "活动"],
    orderIndex: 70,
    createdAt: seedTime,
    updatedAt: seedTime,
  },
];

export const seedActivity: TaskActivity[] = [
  {
    id: "activity-001",
    taskId: "task-002",
    message: "后端组标记 1 个接口依赖为阻塞。",
    createdAt: "2026-06-06T08:20:00.000Z",
  },
  {
    id: "activity-002",
    taskId: "task-003",
    message: "前端组提交移动端任务详情验收版本。",
    createdAt: "2026-06-06T07:15:00.000Z",
  },
  {
    id: "activity-003",
    taskId: "task-005",
    message: "数据组完成导出字段口径确认。",
    createdAt: "2026-06-05T14:45:00.000Z",
  },
];

export function createSeedBoard(): BoardData {
  return {
    columns: boardColumns,
    projects: seedProjects.map((project) => ({ ...project })),
    tasks: seedTasks.map((task) => ({ ...task, tags: [...task.tags] })),
    activity: seedActivity.map((item) => ({ ...item })),
  };
}

export function isBoardStatus(value: unknown): value is BoardStatus {
  return boardColumns.some((column) => column.id === value);
}

export function isPriority(value: unknown): value is Priority {
  return value === "high" || value === "medium" || value === "low";
}
