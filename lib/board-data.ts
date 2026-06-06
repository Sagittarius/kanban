export type BoardStatus = "backlog" | "dev" | "test" | "done";
export type Priority = "high" | "medium" | "low";
export type ProjectHealth = "good" | "normal" | "risk";
export type ProjectStatus = "active" | "archived";

export type BoardColumn = {
  id: BoardStatus;
  title: string;
  tone: string;
  description: string;
};

export type Project = {
  id: string;
  name: string;
  description: string;
  owner: string;
  color: string;
  health: ProjectHealth;
  status: ProjectStatus;
  summary: string;
  archivedAt: string | null;
  orderIndex: number;
  createdAt: string;
  updatedAt: string;
};

export type Subtask = {
  id: string;
  taskId: string;
  title: string;
  done: boolean;
  orderIndex: number;
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
  blockedReason: string;
  tags: string[];
  subtasks: Subtask[];
  orderIndex: number;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ActivityLog = {
  id: string;
  entityType: "project" | "task" | "subtask" | "board";
  entityId: string;
  projectId: string | null;
  taskId: string | null;
  action: string;
  message: string;
  meta: Record<string, unknown>;
  createdAt: string;
};

export type BoardData = {
  columns: BoardColumn[];
  projects: Project[];
  tasks: BoardTask[];
  activity: ActivityLog[];
  storageMode?: "d1" | "local";
};

const seedTime = "2026-06-06T09:00:00.000Z";

export const boardColumns: BoardColumn[] = [
  {
    id: "backlog",
    title: "需求池",
    tone: "bg-[#6f6a5f]",
    description: "待拆分、待确认或尚未排期的任务。",
  },
  {
    id: "dev",
    title: "开发中",
    tone: "bg-[#1f6f68]",
    description: "正在设计、开发、联调或内容生产。",
  },
  {
    id: "test",
    title: "测试中",
    tone: "bg-[#7b4f82]",
    description: "进入测试、验收、复核和交付确认。",
  },
  {
    id: "done",
    title: "已完成",
    tone: "bg-[#4f7a45]",
    description: "已交付、已复盘或可进入项目归档。",
  },
];

export const priorityLabels: Record<Priority, string> = {
  high: "高",
  medium: "中",
  low: "低",
};

export const healthLabels: Record<ProjectHealth, string> = {
  good: "正常",
  normal: "关注",
  risk: "风险",
};

export const seedProjects: Project[] = [
  {
    id: "core-platform",
    name: "核心平台",
    description: "平台能力、接口稳定性、数据出口和部署质量。",
    owner: "Vincent",
    color: "#1f6f68",
    health: "good",
    status: "active",
    summary: "",
    archivedAt: null,
    orderIndex: 10,
    createdAt: seedTime,
    updatedAt: seedTime,
  },
  {
    id: "mobile-delivery",
    name: "移动端交付",
    description: "移动端页面、验收流程、缺陷分级和交互体验。",
    owner: "产品组",
    color: "#b45f3c",
    health: "normal",
    status: "active",
    summary: "",
    archivedAt: null,
    orderIndex: 20,
    createdAt: seedTime,
    updatedAt: seedTime,
  },
  {
    id: "growth-ops",
    name: "增长运营",
    description: "运营活动、案例素材、发布复盘和增长资产沉淀。",
    owner: "运营组",
    color: "#7b4f82",
    health: "risk",
    status: "active",
    summary: "",
    archivedAt: null,
    orderIndex: 30,
    createdAt: seedTime,
    updatedAt: seedTime,
  },
];

const seedSubtasks: Subtask[] = [
  {
    id: "step-001",
    taskId: "task-001",
    title: "列出平台、数据、客户端三条依赖链",
    done: true,
    orderIndex: 10,
    createdAt: seedTime,
    updatedAt: seedTime,
  },
  {
    id: "step-002",
    taskId: "task-001",
    title: "确认每条依赖的责任人和日期",
    done: false,
    orderIndex: 20,
    createdAt: seedTime,
    updatedAt: seedTime,
  },
  {
    id: "step-003",
    taskId: "task-002",
    title: "接入接口异常率和 P95 延迟",
    done: true,
    orderIndex: 10,
    createdAt: seedTime,
    updatedAt: seedTime,
  },
  {
    id: "step-004",
    taskId: "task-002",
    title: "补齐最近部署事件关联",
    done: false,
    orderIndex: 20,
    createdAt: seedTime,
    updatedAt: seedTime,
  },
  {
    id: "step-005",
    taskId: "task-003",
    title: "移动端首屏字段排序验收",
    done: false,
    orderIndex: 10,
    createdAt: seedTime,
    updatedAt: seedTime,
  },
  {
    id: "step-006",
    taskId: "task-006",
    title: "定义线上阻断缺陷处理时限",
    done: false,
    orderIndex: 10,
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
    status: "dev",
    priority: "high",
    owner: "Vincent",
    startDate: "2026-06-08",
    dueDate: "2026-06-12",
    estimate: 5,
    progress: 30,
    blockers: 0,
    blockedReason: "",
    tags: ["规划", "依赖"],
    subtasks: seedSubtasks.filter((step) => step.taskId === "task-001"),
    orderIndex: 10,
    deletedAt: null,
    createdAt: seedTime,
    updatedAt: seedTime,
  },
  {
    id: "task-002",
    projectId: "core-platform",
    title: "接口健康度巡检面板",
    description: "把异常率、延迟和最近部署事件放到同一个视图里。",
    status: "dev",
    priority: "high",
    owner: "后端组",
    startDate: "2026-06-03",
    dueDate: "2026-06-10",
    estimate: 8,
    progress: 62,
    blockers: 1,
    blockedReason: "部署事件源仍缺少环境标识。",
    tags: ["监控", "API"],
    subtasks: seedSubtasks.filter((step) => step.taskId === "task-002"),
    orderIndex: 20,
    deletedAt: null,
    createdAt: seedTime,
    updatedAt: seedTime,
  },
  {
    id: "task-003",
    projectId: "mobile-delivery",
    title: "移动端任务详情重排",
    description: "把负责人、截止时间和阻塞原因放到首屏可见区域。",
    status: "test",
    priority: "medium",
    owner: "前端组",
    startDate: "2026-06-01",
    dueDate: "2026-06-07",
    estimate: 3,
    progress: 88,
    blockers: 0,
    blockedReason: "",
    tags: ["移动端", "体验"],
    subtasks: seedSubtasks.filter((step) => step.taskId === "task-003"),
    orderIndex: 10,
    deletedAt: null,
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
    blockedReason: "",
    tags: ["复盘"],
    subtasks: [],
    orderIndex: 10,
    deletedAt: null,
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
    blockedReason: "",
    tags: ["数据", "验收"],
    subtasks: [],
    orderIndex: 10,
    deletedAt: null,
    createdAt: seedTime,
    updatedAt: seedTime,
  },
  {
    id: "task-006",
    projectId: "mobile-delivery",
    title: "缺陷分级规则补充",
    description: "补齐线上阻断、普通缺陷和体验问题的处理时限。",
    status: "dev",
    priority: "high",
    owner: "QA",
    startDate: "2026-06-04",
    dueDate: "2026-06-09",
    estimate: 3,
    progress: 45,
    blockers: 1,
    blockedReason: "需要产品确认 P0 与 P1 的升级口径。",
    tags: ["QA", "流程"],
    subtasks: seedSubtasks.filter((step) => step.taskId === "task-006"),
    orderIndex: 30,
    deletedAt: null,
    createdAt: seedTime,
    updatedAt: seedTime,
  },
  {
    id: "task-007",
    projectId: "growth-ops",
    title: "客户案例素材池",
    description: "沉淀可复用案例、截图和行业标签，支持后续活动页面。",
    status: "backlog",
    priority: "low",
    owner: "市场组",
    startDate: "2026-06-11",
    dueDate: "2026-06-20",
    estimate: 5,
    progress: 12,
    blockers: 0,
    blockedReason: "",
    tags: ["素材", "活动"],
    subtasks: [],
    orderIndex: 20,
    deletedAt: null,
    createdAt: seedTime,
    updatedAt: seedTime,
  },
];

export const seedActivity: ActivityLog[] = [
  {
    id: "activity-001",
    entityType: "task",
    entityId: "task-002",
    projectId: "core-platform",
    taskId: "task-002",
    action: "task.blocked",
    message: "后端组为「接口健康度巡检面板」登记 1 个阻塞项。",
    meta: { blockers: 1 },
    createdAt: "2026-06-06T08:20:00.000Z",
  },
  {
    id: "activity-002",
    entityType: "task",
    entityId: "task-003",
    projectId: "mobile-delivery",
    taskId: "task-003",
    action: "task.status",
    message: "「移动端任务详情重排」移动到测试中。",
    meta: { status: "test" },
    createdAt: "2026-06-06T07:15:00.000Z",
  },
  {
    id: "activity-003",
    entityType: "task",
    entityId: "task-005",
    projectId: "core-platform",
    taskId: "task-005",
    action: "task.completed",
    message: "「验收数据导出规则」已完成。",
    meta: { status: "done" },
    createdAt: "2026-06-05T14:45:00.000Z",
  },
];

export function createSeedBoard(): BoardData {
  return {
    columns: boardColumns,
    projects: seedProjects.map((project) => ({ ...project })),
    tasks: seedTasks.map((task) => ({
      ...task,
      tags: [...task.tags],
      subtasks: task.subtasks.map((step) => ({ ...step })),
    })),
    activity: seedActivity.map((item) => ({ ...item, meta: { ...item.meta } })),
    storageMode: "local",
  };
}

export function isBoardStatus(value: unknown): value is BoardStatus {
  return boardColumns.some((column) => column.id === value);
}

export function normalizeBoardStatus(value: unknown): BoardStatus {
  if (value === "planned" || value === "progress") {
    return "dev";
  }
  if (value === "review") {
    return "test";
  }
  return isBoardStatus(value) ? value : "backlog";
}

export function isPriority(value: unknown): value is Priority {
  return value === "high" || value === "medium" || value === "low";
}

export function isProjectHealth(value: unknown): value is ProjectHealth {
  return value === "good" || value === "normal" || value === "risk";
}

export function isProjectStatus(value: unknown): value is ProjectStatus {
  return value === "active" || value === "archived";
}
