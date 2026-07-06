import { DatabaseSync } from "node:sqlite";
import { webcrypto } from "node:crypto";
import { resolveDatabasePath } from "./sqlite-migration-lib.mjs";

if (!globalThis.crypto) {
  globalThis.crypto = webcrypto;
}

const NOW = "2026-06-25T09:30:00.000Z";
const DEFAULT_PASSWORD = "Kanban123!";
const DEMO_IDS = {
  users: [
    "demo-user-pm",
    "demo-user-dm",
    "demo-user-po",
    "demo-user-design",
    "demo-user-dev-a",
    "demo-user-dev-b",
    "demo-user-qa-a",
    "demo-user-qa-b",
  ],
  teams: ["demo-team-product", "demo-team-platform"],
  boards: ["demo-board-regression", "demo-board-release"],
  projects: [
    "demo-project-alpha",
    "demo-project-beta",
    "demo-project-gamma",
    "demo-project-delta",
  ],
  tasks: Array.from({ length: 24 }, (_, index) => `demo-task-${String(index + 1).padStart(3, "0")}`),
};

const users = [
  { id: "demo-user-pm", username: "pm_demo", role: "project_manager", displayName: "项目经理A", phone: "13800001001", avatarKey: "zodiac-aries", jobTitle: "project_manager", techStacks: ["全栈", "项目管理", "需求分析"] },
  { id: "demo-user-dm", username: "dm_demo", role: "development_manager", displayName: "开发经理A", phone: "13800001002", avatarKey: "zodiac-capricorn", jobTitle: "development_manager", techStacks: ["全栈", "TypeScript", "架构设计", "CI/CD"] },
  { id: "demo-user-po", username: "po_demo", role: "team_member", displayName: "产品经理A", phone: "13800001003", avatarKey: "zodiac-taurus", jobTitle: "product_manager", techStacks: ["需求分析", "原型设计"] },
  { id: "demo-user-design", username: "designer_demo", role: "team_member", displayName: "设计师A", phone: "13800001004", avatarKey: "zodiac-gemini", jobTitle: "team_lead", techStacks: ["设计系统", "交互设计"] },
  { id: "demo-user-dev-a", username: "dev_demo_a", role: "team_member", displayName: "开发A", phone: "13800001005", avatarKey: "zodiac-leo", jobTitle: "developer", techStacks: ["React", "TypeScript", "Node.js"] },
  { id: "demo-user-dev-b", username: "dev_demo_b", role: "team_member", displayName: "开发B", phone: "13800001006", avatarKey: "zodiac-virgo", jobTitle: "developer", techStacks: ["Java", "Spring Boot", "PostgreSQL"] },
  { id: "demo-user-qa-a", username: "qa_demo_a", role: "team_member", displayName: "测试A", phone: "13800001007", avatarKey: "zodiac-libra", jobTitle: "tester", techStacks: ["测试自动化", "接口测试"] },
  { id: "demo-user-qa-b", username: "qa_demo_b", role: "team_member", displayName: "测试B", phone: "13800001008", avatarKey: "zodiac-scorpio", jobTitle: "tester", techStacks: ["性能优化", "回归测试"] },
];

const teams = [
  {
    id: "demo-team-product",
    name: "演示团队-产品交付组",
    description: "用于测试团队筛选、看板授权和负责人联动。",
    color: "#0f766e",
    ownerUserId: "demo-user-pm",
    memberIds: ["demo-user-pm", "demo-user-dm", "demo-user-po", "demo-user-design", "demo-user-dev-a", "demo-user-qa-a"],
  },
  {
    id: "demo-team-platform",
    name: "演示团队-平台研发组",
    description: "用于测试多团队、多看板和工作饱和度面板。",
    color: "#7c3aed",
    ownerUserId: "demo-user-pm",
    memberIds: ["demo-user-pm", "demo-user-dm", "demo-user-dev-b", "demo-user-qa-b"],
  },
];

const boards = [
  {
    id: "demo-board-regression",
    name: "演示看板-功能回归",
    description: "用于卡片视图、列表视图、Excel 导出和活动记录测试。",
    ownerUserId: "demo-user-pm",
    teamIds: ["demo-team-product"],
  },
  {
    id: "demo-board-release",
    name: "演示看板-版本交付",
    description: "用于看板切换、多项目和工作饱和度测试。",
    ownerUserId: "demo-user-pm",
    teamIds: ["demo-team-product", "demo-team-platform"],
  },
];

const projects = [
  {
    id: "demo-project-alpha",
    boardId: "demo-board-regression",
    teamId: "demo-team-product",
    name: "演示项目-商城改版",
    description: "用于测试需求池到完成的完整流转。",
    ownerUserId: "demo-user-pm",
    owner: "项目经理A",
    color: "#0f766e",
    health: "normal",
    status: "active",
    summary: "首页、详情、下单链路改版",
    orderIndex: 10,
  },
  {
    id: "demo-project-beta",
    boardId: "demo-board-regression",
    teamId: "demo-team-product",
    name: "演示项目-移动端升级",
    description: "用于测试标签、提测日期和交付日期显示。",
    ownerUserId: "demo-user-po",
    owner: "产品经理A",
    color: "#d97706",
    health: "risk",
    status: "active",
    summary: "客户端能力升级",
    orderIndex: 20,
  },
  {
    id: "demo-project-gamma",
    boardId: "demo-board-release",
    teamId: "demo-team-platform",
    name: "演示项目-数据治理",
    description: "用于测试工作饱和度与团队筛选。",
    ownerUserId: "demo-user-pm",
    owner: "项目经理A",
    color: "#7c3aed",
    health: "good",
    status: "active",
    summary: "主数据和报表口径治理",
    orderIndex: 10,
  },
  {
    id: "demo-project-delta",
    boardId: "demo-board-release",
    teamId: "demo-team-platform",
    name: "演示项目-基础设施优化",
    description: "用于测试多看板、多团队的任务分布。",
    ownerUserId: "demo-user-dev-b",
    owner: "开发B",
    color: "#2563eb",
    health: "normal",
    status: "active",
    summary: "性能、稳定性、监控优化",
    orderIndex: 20,
  },
];

function buildTasks() {
  const specs = [
    ["demo-project-alpha", "backlog", "需求梳理-商品详情页", "产品经理A", "demo-user-po", "", "", "2026-06-28", "2026-07-01", "2026-07-04", ["业务需求"], 0, 0],
    ["demo-project-alpha", "backlog", "需求梳理-购物车重构", "产品经理A", "demo-user-po", "", "", "2026-06-29", "2026-07-02", "2026-07-05", ["业务需求"], 0, 0],
    ["demo-project-alpha", "design", "视觉方案-首页首屏", "设计师A", "demo-user-design", "", "", "2026-06-26", "2026-06-30", "2026-07-03", ["设计"], 25, 0],
    ["demo-project-alpha", "design", "交互稿-下单流程", "设计师A", "demo-user-design", "", "", "2026-06-27", "2026-07-01", "2026-07-06", ["设计"], 60, 1],
    ["demo-project-alpha", "dev", "前端开发-首页改版", "开发A", "demo-user-dev-a", "测试A", "demo-user-qa-a", "2026-06-20", "2026-06-26", "2026-06-30", ["业务需求", "前端"], 55, 0],
    ["demo-project-alpha", "dev", "服务端开发-下单接口", "开发B", "demo-user-dev-b", "测试B", "demo-user-qa-b", "2026-06-21", "2026-06-25", "2026-06-29", ["业务需求", "后端"], 70, 2],
    ["demo-project-alpha", "test", "联调测试-购物车链路", "开发A", "demo-user-dev-a", "测试A", "demo-user-qa-a", "2026-06-18", "2026-06-24", "2026-06-27", ["回归"], 85, 0],
    ["demo-project-alpha", "done", "上线验收-首页改版", "开发B", "demo-user-dev-b", "测试B", "demo-user-qa-b", "2026-06-16", "2026-06-20", "2026-06-23", ["已完成"], 100, 0],
    ["demo-project-beta", "backlog", "移动端埋点补齐", "产品经理A", "demo-user-po", "", "", "2026-06-30", "2026-07-03", "2026-07-06", ["技改需求"], 0, 0],
    ["demo-project-beta", "design", "组件库样式统一", "设计师A", "demo-user-design", "", "", "2026-06-29", "2026-07-02", "2026-07-05", ["设计", "技改需求"], 40, 0],
    ["demo-project-beta", "dev", "APP 启动性能优化", "开发A", "demo-user-dev-a", "测试A", "demo-user-qa-a", "2026-06-22", "2026-06-27", "2026-07-02", ["技改需求"], 35, 1],
    ["demo-project-beta", "test", "灰度验证-消息中心", "开发B", "demo-user-dev-b", "测试B", "demo-user-qa-b", "2026-06-19", "2026-06-24", "2026-06-28", ["灰度"], 92, 0],
    ["demo-project-gamma", "backlog", "主数据口径梳理", "项目经理A", "demo-user-pm", "", "", "2026-07-02", "2026-07-05", "2026-07-09", ["数据治理"], 0, 0],
    ["demo-project-gamma", "design", "报表原型搭建", "设计师A", "demo-user-design", "", "", "2026-06-28", "2026-07-04", "2026-07-07", ["报表"], 30, 0],
    ["demo-project-gamma", "dev", "ETL 重构一期", "开发B", "demo-user-dev-b", "测试B", "demo-user-qa-b", "2026-06-20", "2026-06-26", "2026-07-01", ["数据治理", "后端"], 45, 1],
    ["demo-project-gamma", "dev", "监控告警规则优化", "开发A", "demo-user-dev-a", "测试A", "demo-user-qa-a", "2026-06-23", "2026-06-29", "2026-07-03", ["运维"], 50, 0],
    ["demo-project-gamma", "test", "报表核对", "开发B", "demo-user-dev-b", "测试B", "demo-user-qa-b", "2026-06-18", "2026-06-25", "2026-06-30", ["报表"], 75, 0],
    ["demo-project-gamma", "done", "主数据字典整理", "项目经理A", "demo-user-pm", "测试B", "demo-user-qa-b", "2026-06-10", "2026-06-18", "2026-06-22", ["数据治理"], 100, 0],
    ["demo-project-delta", "backlog", "K8S 节点扩容", "项目经理A", "demo-user-pm", "", "", "2026-07-01", "2026-07-06", "2026-07-10", ["基础设施"], 0, 0],
    ["demo-project-delta", "design", "日志采集方案", "设计师A", "demo-user-design", "", "", "2026-06-27", "2026-07-03", "2026-07-06", ["运维"], 20, 0],
    ["demo-project-delta", "dev", "Nginx 配置整理", "开发B", "demo-user-dev-b", "测试B", "demo-user-qa-b", "2026-06-20", "2026-06-26", "2026-06-30", ["基础设施"], 80, 0],
    ["demo-project-delta", "dev", "Prometheus 告警降噪", "开发A", "demo-user-dev-a", "测试A", "demo-user-qa-a", "2026-06-21", "2026-06-28", "2026-07-02", ["监控"], 65, 1],
    ["demo-project-delta", "test", "备份恢复演练", "开发B", "demo-user-dev-b", "测试B", "demo-user-qa-b", "2026-06-17", "2026-06-24", "2026-06-29", ["演练"], 88, 0],
    ["demo-project-delta", "done", "链路压测", "开发A", "demo-user-dev-a", "测试A", "demo-user-qa-a", "2026-06-12", "2026-06-19", "2026-06-21", ["性能"], 100, 0],
  ];

  return specs.map((spec, index) => {
    const [projectId, status, title, owner, ownerUserId, tester, testerUserId, designDueDate, testDueDate, dueDate, tags, progress, blockers] = spec;
    const id = DEMO_IDS.tasks[index];
    const done = status === "done";
    return {
      id,
      projectId,
      title,
      description: `${title}，用于人工验证卡片、列表、活动记录与导出展示。`,
      status,
      priority: index % 3 === 0 ? "high" : index % 3 === 1 ? "medium" : "low",
      owner,
      ownerUserId,
      tester,
      testerUserId,
      startDate: "2026-06-18",
      designDueDate,
      testDueDate,
      dueDate,
      estimate: 2 + (index % 4),
      workloadDays: [0.5, 1, 1.5, 2, 3, 5][index % 6],
      progress,
      blockers,
      blockedReason: blockers > 0 ? "待接口确认" : "",
      tags,
      orderIndex: (index % 8) * 10 + 10,
      createdAt: NOW,
      updatedAt: NOW,
      deletedAt: null,
      completedAt: done ? "2026-06-24T10:00:00.000Z" : null,
    };
  });
}

const subtasks = buildTasks().flatMap((task) =>
  [1, 2, 3].map((step) => ({
    id: `${task.id}-subtask-${step}`,
    taskId: task.id,
    title: `拆解${step}`,
    done: task.progress >= step * 34 ? 1 : 0,
    orderIndex: step * 10,
    createdAt: NOW,
    updatedAt: NOW,
  }))
);

const activities = buildTasks().slice(0, 12).map((task, index) => {
  const project = projects.find((item) => item.id === task.projectId);
  return {
    id: `demo-activity-${String(index + 1).padStart(3, "0")}`,
    entityType: "task",
    entityId: task.id,
    projectId: task.projectId,
    taskId: task.id,
    action: "task.seed",
    message: `导入测试任务「${task.title}」到${task.status === "done" ? "已完成" : "演示流程"}阶段。`,
    meta: JSON.stringify({ status: task.status, projectName: project?.name ?? "" }),
    createdAt: NOW,
    boardId: project?.boardId ?? "demo-board-regression",
  };
});

async function hashPassword(password) {
  const encoder = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt,
      iterations: 210000,
    },
    key,
    32 * 8
  );
  const hash = new Uint8Array(bits);
  return `pbkdf2$210000$${base64UrlEncode(salt)}$${base64UrlEncode(hash)}`;
}

function base64UrlEncode(value) {
  const binary = Array.from(value, (byte) => String.fromCharCode(byte)).join("");
  return Buffer.from(binary, "binary").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function run() {
  const databasePath = resolveDatabasePath();
  const db = new DatabaseSync(databasePath);
  const passwordPromise = hashPassword(DEFAULT_PASSWORD);

  Promise.resolve(passwordPromise).then((passwordHash) => {
    db.exec("BEGIN");
    try {
      cleanup(db);
      insertUsers(db, passwordHash);
      insertTeams(db);
      insertBoards(db);
      insertProjects(db);
      insertTasks(db);
      insertSubtasks(db);
      insertActivities(db);
      db.exec("COMMIT");
      console.log(`[kanban-demo-seed] database: ${databasePath}`);
      console.log(`[kanban-demo-seed] password: ${DEFAULT_PASSWORD}`);
      console.log(`[kanban-demo-seed] users: ${users.length}, teams: ${teams.length}, boards: ${boards.length}, projects: ${projects.length}, tasks: ${buildTasks().length}`);
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    } finally {
      db.close();
    }
  }).catch((error) => {
    console.error("[kanban-demo-seed] failed:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}

function cleanup(db) {
  const q = (sql, values) => db.prepare(sql).run(...values);
  q(`DELETE FROM subtasks WHERE task_id IN (${placeholders(DEMO_IDS.tasks.length)})`, DEMO_IDS.tasks);
  q(`DELETE FROM task_activity WHERE id LIKE 'demo-activity-%' OR task_id IN (${placeholders(DEMO_IDS.tasks.length)})`, DEMO_IDS.tasks);
  q(`DELETE FROM tasks WHERE id IN (${placeholders(DEMO_IDS.tasks.length)})`, DEMO_IDS.tasks);
  q(`DELETE FROM projects WHERE id IN (${placeholders(DEMO_IDS.projects.length)})`, DEMO_IDS.projects);
  q(`DELETE FROM board_teams WHERE board_id IN (${placeholders(DEMO_IDS.boards.length)})`, DEMO_IDS.boards);
  q(`DELETE FROM board_members WHERE board_id IN (${placeholders(DEMO_IDS.boards.length)})`, DEMO_IDS.boards);
  q(`DELETE FROM boards WHERE id IN (${placeholders(DEMO_IDS.boards.length)})`, DEMO_IDS.boards);
  q(`DELETE FROM team_members WHERE team_id IN (${placeholders(DEMO_IDS.teams.length)})`, DEMO_IDS.teams);
  q(`DELETE FROM teams WHERE id IN (${placeholders(DEMO_IDS.teams.length)})`, DEMO_IDS.teams);
  q(`DELETE FROM users WHERE id IN (${placeholders(DEMO_IDS.users.length)})`, DEMO_IDS.users);
}

function insertUsers(db, passwordHash) {
  const stmt = db.prepare(
    "INSERT INTO users (id, username, password_hash, role, timezone, is_active, created_at, updated_at, display_name, phone, avatar_key, job_title, tech_stacks) VALUES (?, ?, ?, ?, 'Asia/Shanghai', 1, ?, ?, ?, ?, ?, ?, ?)"
  );
  for (const user of users) {
    stmt.run(user.id, user.username, passwordHash, user.role, NOW, NOW, user.displayName, user.phone, user.avatarKey, user.jobTitle, JSON.stringify(user.techStacks));
  }
}

function insertTeams(db) {
  const teamStmt = db.prepare(
    "INSERT INTO teams (id, name, description, owner_user_id, color, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
  );
  const memberStmt = db.prepare("INSERT INTO team_members (team_id, user_id, created_at) VALUES (?, ?, ?)");
  for (const team of teams) {
    teamStmt.run(team.id, team.name, team.description, team.ownerUserId, team.color, NOW, NOW);
    for (const memberId of team.memberIds) {
      memberStmt.run(team.id, memberId, NOW);
    }
  }
}

function insertBoards(db) {
  const boardStmt = db.prepare(
    "INSERT INTO boards (id, name, description, owner_user_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)"
  );
  const memberStmt = db.prepare("INSERT INTO board_members (board_id, user_id, role, created_at) VALUES (?, ?, ?, ?)");
  const teamStmt = db.prepare("INSERT INTO board_teams (board_id, team_id, created_at) VALUES (?, ?, ?)");
  for (const board of boards) {
    boardStmt.run(board.id, board.name, board.description, board.ownerUserId, NOW, NOW);
    const grants = new Map([
      [board.ownerUserId, "owner"],
      ["demo-user-pm", "admin"],
      ["demo-user-po", "viewer"],
    ]);
    grants.set(board.ownerUserId, "owner");
    for (const [userId, role] of grants) {
      memberStmt.run(board.id, userId, role, NOW);
    }
    for (const teamId of board.teamIds) {
      teamStmt.run(board.id, teamId, NOW);
    }
  }
}

function insertProjects(db) {
  const stmt = db.prepare(
    "INSERT INTO projects (id, name, owner_user_id, owner, color, health, created_at, updated_at, description, status, summary, archived_at, order_index, board_id, team_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  );
  for (const project of projects) {
    stmt.run(
      project.id,
      project.name,
      project.ownerUserId,
      project.owner,
      project.color,
      project.health,
      NOW,
      NOW,
      project.description,
      project.status,
      project.summary,
      null,
      project.orderIndex,
      project.boardId,
      project.teamId
    );
  }
}

function insertTasks(db) {
  const stmt = db.prepare(
    "INSERT INTO tasks (id, project_id, title, description, status, priority, owner_user_id, owner, tester_user_id, tester, workload_days, start_date, design_due_date, design_completed_at, test_due_date, dev_completed_at, due_date, completed_at, estimate, progress, blockers, blocked_reason, tags, order_index, deleted_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  );
  for (const task of buildTasks()) {
    stmt.run(
      task.id,
      task.projectId,
      task.title,
      task.description,
      task.status,
      task.priority,
      task.ownerUserId,
      task.owner,
      task.testerUserId,
      task.tester,
      task.workloadDays,
      task.startDate,
      task.designDueDate,
      null,
      task.testDueDate,
      null,
      task.dueDate,
      task.completedAt,
      task.estimate,
      task.progress,
      task.blockers,
      task.blockedReason,
      JSON.stringify(task.tags),
      task.orderIndex,
      task.deletedAt,
      task.createdAt,
      task.updatedAt
    );
  }
}

function insertSubtasks(db) {
  const stmt = db.prepare(
    "INSERT INTO subtasks (id, task_id, title, done, order_index, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
  );
  for (const subtask of subtasks) {
    stmt.run(subtask.id, subtask.taskId, subtask.title, subtask.done, subtask.orderIndex, subtask.createdAt, subtask.updatedAt);
  }
}

function insertActivities(db) {
  const stmt = db.prepare(
    "INSERT INTO task_activity (id, entity_type, entity_id, project_id, task_id, action, message, meta, created_at, board_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  );
  for (const activity of activities) {
    stmt.run(
      activity.id,
      activity.entityType,
      activity.entityId,
      activity.projectId,
      activity.taskId,
      activity.action,
      activity.message,
      activity.meta,
      activity.createdAt,
      activity.boardId
    );
  }
}

function placeholders(length) {
  return Array.from({ length }, () => "?").join(", ");
}

run();
