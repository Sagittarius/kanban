import { getDbAdapter, getStorageMode, type DatabaseAdapter, type SqlValue } from "@/db/sql-adapter";
import type { BoardSummary, CurrentUser, ManagedUser } from "@/lib/auth-models";
import { columnsFromSettings, defaultSystemParameters, defaultSystemSettings, isPriority, isProjectHealth, isProjectStatus, normalizeBoardStatus, type ActivityLog, type BoardStatus, type Subtask, type SystemParameter, type SystemSettings } from "@/lib/board-data";
import { hashPassword } from "@/lib/password";
import { DEFAULT_TIMEZONE, normalizeTimeZone, todayKeyInTimeZone } from "@/lib/timezone";

export type CreateUserInput = { username?: unknown; password?: unknown; timezone?: unknown };
export type CreateBoardInput = { name?: unknown; description?: unknown };
export type UpdateBoardInput = Partial<CreateBoardInput>;
export type UpdateUserProfileInput = Partial<{ displayName: unknown; timezone: unknown; avatarKey: unknown }>;
export type CreateProjectInput = { name?: unknown; description?: unknown; owner?: unknown; color?: unknown; health?: unknown };
export type UpdateProjectInput = Partial<CreateProjectInput & { status: unknown; summary: unknown }>;
export type CreateTaskInput = { title?: unknown; description?: unknown; projectId?: unknown; priority?: unknown; owner?: unknown; tester?: unknown; testDueDate?: unknown; designDueDate?: unknown; dueDate?: unknown; tags?: unknown };
export type UpdateTaskInput = Partial<CreateTaskInput & { status: unknown; startDate: unknown; estimate: unknown; progress: unknown; blockers: unknown; blockedReason: unknown }>;
export type ReorderTaskInput = { updates?: unknown };
export type CreateSubtaskInput = { title?: unknown };
export type UpdateSubtaskInput = Partial<{ title: unknown; done: unknown }>;
export type UpdateSystemSettingsInput = Partial<{ dueSoonDays: unknown; activityRetentionDays: unknown; parameters: unknown }>;

export const USERNAME_PATTERN = /^[A-Za-z0-9]+$/;
export const DEFAULT_BOARD_ID = "default-board";
let repositoryPromise: Promise<KanbanRepository> | null = null;

function statusLabel(status: BoardStatus) {
  return (
    {
      backlog: "需求池",
      design: "设计中",
      dev: "开发中",
      test: "测试中",
      done: "已完成",
    } satisfies Record<BoardStatus, string>
  )[status];
}

export async function getKanbanRepository(): Promise<KanbanRepository> {
  if (!repositoryPromise) {
    repositoryPromise = getDbAdapter().then((db) => new KanbanRepository(db));
  }
  return repositoryPromise;
}

export class KanbanRepository {
  constructor(private readonly db: DatabaseAdapter) {}
  async q(sql: string, params: SqlValue[] = []) { return this.db.query(sql, params); }
  async x(sql: string, params: SqlValue[] = []) { return this.db.execute(sql, params); }

  async ensureBootstrapData() { await this.ensureSuperAdmin(); await this.ensureDefaultBoardForLegacyData(); await this.ensureSystemParameters(); }
  async getBootstrapUser(): Promise<CurrentUser> {
    await this.ensureBootstrapData();
    const user = await this.getUserById("super-admin");
    if (!user) {
      throw new Error("Bootstrap user not found");
    }
    return user;
  }

  async findUserByUsername(username: string) { await this.ensureBootstrapData(); return (await this.q("SELECT * FROM users WHERE lower(username)=lower(?) LIMIT 1", [username]))[0] ?? null; }
  async getUserById(id: string): Promise<CurrentUser | null> { await this.ensureBootstrapData(); const r = (await this.q("SELECT * FROM users WHERE id=? AND is_active=1 LIMIT 1", [id]))[0]; return r ? user(r) : null; }
  async listUsers(): Promise<ManagedUser[]> { await this.ensureBootstrapData(); return (await this.q("SELECT * FROM users ORDER BY role ASC, username ASC")).map(managedUser); }
  async createUser(input: CreateUserInput): Promise<ManagedUser> {
    await this.ensureBootstrapData(); const username = normalizeUsername(input.username); if (await this.findUserByUsername(username)) throw new Error("Username already exists");
    const now = iso(); const row = { id: crypto.randomUUID(), username, password_hash: await hashPassword(text(input.password, `${username}@123`)), role: "user", display_name: "", avatar_key: "", timezone: normalizeTimeZone(input.timezone), is_active: 1, created_at: now, updated_at: now };
    await this.x("INSERT INTO users (id,username,password_hash,role,display_name,avatar_key,timezone,is_active,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)", [row.id,row.username,row.password_hash,row.role,row.display_name,row.avatar_key,row.timezone,row.is_active,row.created_at,row.updated_at]);
    return managedUser(row);
  }
  async resetUserPassword(userId: string) { await this.ensureBootstrapData(); const u = (await this.q("SELECT * FROM users WHERE id=? LIMIT 1", [userId]))[0]; if (!u || u.role === "super_admin") throw new Error("User not found"); const password = `${u.username}@123`; await this.x("UPDATE users SET password_hash=?,updated_at=? WHERE id=?", [await hashPassword(password), iso(), userId]); return { username: u.username, password }; }
  async updateUserProfile(userId: string, input: UpdateUserProfileInput): Promise<CurrentUser> {
    await this.ensureBootstrapData();
    const current = await this.getUserById(userId);
    if (!current) throw new Error("User not found");
    await this.x("UPDATE users SET display_name=?,avatar_key=?,timezone=?,updated_at=? WHERE id=?", [
      opt(input.displayName, current.displayName),
      opt(input.avatarKey, current.avatarKey),
      normalizeTimeZone(input.timezone ?? current.timezone),
      iso(),
      userId,
    ]);
    const updated = await this.getUserById(userId);
    if (!updated) throw new Error("User not found");
    return updated;
  }
  async updateUserPassword(userId: string, nextPassword: string) {
    await this.ensureBootstrapData();
    await this.x("UPDATE users SET password_hash=?,updated_at=? WHERE id=?", [await hashPassword(nextPassword), iso(), userId]);
    return { ok: true as const };
  }

  async listBoardsForUser(u: CurrentUser): Promise<BoardSummary[]> {
    await this.ensureBootstrapData();
    const rows = await this.q(u.role === "super_admin"
      ? "SELECT b.*,u.username AS owner_username,'admin' AS access_role FROM boards b LEFT JOIN users u ON u.id=b.owner_user_id ORDER BY b.updated_at DESC,b.created_at DESC"
      : "SELECT b.*,u.username AS owner_username,CASE WHEN b.owner_user_id=? THEN 'owner' ELSE COALESCE(bm.role,'viewer') END AS access_role FROM boards b LEFT JOIN users u ON u.id=b.owner_user_id LEFT JOIN board_members bm ON bm.board_id=b.id AND bm.user_id=? WHERE b.owner_user_id=? OR bm.user_id=? ORDER BY b.updated_at DESC,b.created_at DESC",
      u.role === "super_admin" ? [] : [u.id,u.id,u.id,u.id]);
    return rows.map((r) => board(r, typeof r.access_role === "string" ? r.access_role : undefined));
  }
  async resolveBoardForUser(u: CurrentUser, requestedBoardId?: string | null) { const boards = await this.listBoardsForUser(u); return (requestedBoardId && boards.find((b) => b.id === requestedBoardId)) || boards[0] || this.createBoard(u, { name: `${u.displayName || u.username} 的看板` }); }
  async createBoard(u: CurrentUser, input: CreateBoardInput): Promise<BoardSummary> { await this.ensureBootstrapData(); const now = iso(); const row = { id: crypto.randomUUID(), name: text(input.name, "我的看板"), description: opt(input.description), owner_user_id: u.id, created_at: now, updated_at: now }; await this.x("INSERT INTO boards (id,name,description,owner_user_id,created_at,updated_at) VALUES (?,?,?,?,?,?)", [row.id,row.name,row.description,row.owner_user_id,row.created_at,row.updated_at]); await this.x("INSERT INTO board_members (board_id,user_id,role,created_at) VALUES (?,?,'owner',?) ON CONFLICT(board_id,user_id) DO UPDATE SET role='owner'", [row.id,u.id,now]); await this.ensureBoardDefaults(row.id, u.username); return board({ ...row, owner_username: u.username }, u.role === "super_admin" ? "admin" : "owner"); }
  async updateBoard(u: CurrentUser, boardId: string, input: UpdateBoardInput): Promise<BoardSummary> {
    await this.requireBoardWrite(u, boardId);
    const current = await this.getBoardSummaryById(u, boardId);
    if (!current) throw new Error("Board not found");
    const nextName = text(input.name, current.name);
    const nextDescription = opt(input.description, current.description);
    await this.x("UPDATE boards SET name=?,description=?,updated_at=? WHERE id=?", [nextName, nextDescription, iso(), boardId]);
    const updated = await this.getBoardSummaryById(u, boardId);
    if (!updated) throw new Error("Board not found");
    return updated;
  }
  async listBoardsForAdmin() { return this.listBoardsForUser({ id: "super-admin", username: "admin", role: "super_admin", timezone: DEFAULT_TIMEZONE, displayName: "admin", avatarKey: "" }); }
  async listBoardMembers(boardId: string) { await this.ensureBootstrapData(); return this.q("SELECT bm.user_id,u.username,bm.role FROM board_members bm JOIN users u ON u.id=bm.user_id WHERE bm.board_id=? ORDER BY u.username ASC", [boardId]); }
  async grantBoardViewer(boardId: string, userId: string) { await this.ensureBootstrapData(); await this.x("INSERT INTO board_members (board_id,user_id,role,created_at) VALUES (?,?,'viewer',?) ON CONFLICT(board_id,user_id) DO UPDATE SET role='viewer'", [boardId,userId,iso()]); return { ok: true as const }; }
  async revokeBoardViewer(boardId: string, userId: string) { await this.ensureBootstrapData(); await this.x("DELETE FROM board_members WHERE board_id=? AND user_id=? AND role='viewer'", [boardId,userId]); return { ok: true as const }; }

  async getBoard(u: CurrentUser, boardId: string) {
    await this.requireBoardRead(u, boardId); await this.ensureBoardDefaults(boardId, u.username); await this.ensureSystemParameters();
    const projects = (await this.q("SELECT * FROM projects WHERE board_id=? ORDER BY status ASC,order_index ASC", [boardId])).map(project);
    const tasks = await this.q("SELECT t.* FROM tasks t JOIN projects p ON p.id=t.project_id WHERE p.board_id=? AND t.deleted_at IS NULL ORDER BY t.status ASC,t.order_index ASC,t.updated_at DESC", [boardId]);
    const steps = await this.q("SELECT s.* FROM subtasks s JOIN tasks t ON t.id=s.task_id JOIN projects p ON p.id=t.project_id WHERE p.board_id=? ORDER BY s.order_index ASC", [boardId]);
    const byTask = new Map(); for (const s of steps) { const list = byTask.get(s.task_id) ?? []; list.push(subtask(s)); byTask.set(s.task_id, list); }
    const settings = settingsFromRows(await this.q("SELECT * FROM system_parameters ORDER BY order_index ASC,key ASC")); await this.cleanupExpiredActivity(boardId, settings);
    const activity = (await this.q("SELECT * FROM task_activity WHERE board_id=? ORDER BY created_at DESC LIMIT 80", [boardId])).map(activityRow);
    const boards = await this.listBoardsForUser(u);
    const activeBoard = boards.find((item) => item.id === boardId);
    return { columns: columnsFromSettings(settings), projects, tasks: tasks.map((t) => task(t, byTask.get(t.id) ?? [])), activity, settings, storageMode: getStorageMode(), boardName: activeBoard?.name ?? "", currentUser: u, boards, activeBoardId: boardId, ...(activeBoard ? { activeBoard } : {}), todayKey: todayKeyInTimeZone(u.timezone) };
  }
  async getSystemSettings(u: CurrentUser) { adminOnly(u); await this.ensureSystemParameters(); return settingsFromRows(await this.q("SELECT * FROM system_parameters ORDER BY order_index ASC,key ASC")); }
  async updateSystemSettings(u: CurrentUser, input: UpdateSystemSettingsInput) { adminOnly(u); await this.ensureSystemParameters(); const current = await this.getSystemSettings(u); const defaults = new Map(defaultSystemParameters.map((p) => [p.key, p])); const cur = new Map(current.parameters.map((p) => [p.key, p])); const req = new Map(); if (input.dueSoonDays !== undefined) req.set("due_soon_days", input.dueSoonDays); if (input.activityRetentionDays !== undefined) req.set("activity_retention_days", input.activityRetentionDays); if (Array.isArray(input.parameters)) for (const it of input.parameters) if (it && typeof it === "object" && defaults.has(it.key)) req.set(it.key, it.value); for (const [key, raw] of req) { const d = defaults.get(key), c = cur.get(key); if (d && c) await this.x("UPDATE system_parameters SET value=?,updated_at=? WHERE key=?", [parameterValue(d, c.value, raw), iso(), key]); } return this.getSystemSettings(u); }

  async createProject(u: CurrentUser, boardId: string, input: CreateProjectInput) { await this.requireBoardWrite(u, boardId); const now = iso(); const row = { id: crypto.randomUUID(), board_id: boardId, name: text(input.name, "未命名项目"), description: opt(input.description), owner: text(input.owner, "未分配"), color: text(input.color, "#1f6f68"), health: isProjectHealth(input.health) ? input.health : "normal", status: "active", summary: "", archived_at: null, order_index: await this.nextProjectOrderIndex(boardId), created_at: now, updated_at: now }; await this.x("INSERT INTO projects (id,board_id,name,description,owner,color,health,status,summary,archived_at,order_index,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)", [row.id,row.board_id,row.name,row.description,row.owner,row.color,row.health,row.status,row.summary,row.archived_at,row.order_index,row.created_at,row.updated_at]); await this.recordActivity(boardId,{entityType:"project",entityId:row.id,projectId:row.id,action:"project.create",message:`创建项目「${row.name}」。`}); return project(row); }
  async updateProject(u: CurrentUser, boardId: string, id: string, input: UpdateProjectInput) { await this.requireBoardWrite(u, boardId); const old = await this.getProjectRow(boardId, id); if (!old) throw new Error("Project not found"); const current = project(old); const status = isProjectStatus(input.status) ? input.status : current.status; const row = { name: text(input.name, current.name), description: opt(input.description, current.description), owner: text(input.owner, current.owner), color: text(input.color, current.color), health: isProjectHealth(input.health) ? input.health : current.health, status, summary: opt(input.summary, current.summary), archived_at: status === "archived" && current.status !== "archived" ? iso() : status === "active" ? null : current.archivedAt, updated_at: iso() }; await this.x("UPDATE projects SET name=?,description=?,owner=?,color=?,health=?,status=?,summary=?,archived_at=?,updated_at=? WHERE id=? AND board_id=?", [row.name,row.description,row.owner,row.color,row.health,row.status,row.summary,row.archived_at,row.updated_at,id,boardId]); await this.recordActivity(boardId,{entityType:"project",entityId:id,projectId:id,action:status!==current.status?(status==="archived"?"project.archive":"project.restore"):"project.update",message:`更新项目「${row.name}」。`,meta:{before:current.status,after:status}}); return project(await this.getProjectRow(boardId, id)); }
  async deleteProject(u: CurrentUser, boardId: string, id: string) { await this.requireBoardWrite(u, boardId); const old = await this.getProjectRow(boardId, id); if (!old) throw new Error("Project not found"); await this.x("UPDATE tasks SET deleted_at=?,updated_at=? WHERE project_id=?", [iso(), iso(), id]); await this.x("DELETE FROM projects WHERE id=? AND board_id=?", [id,boardId]); await this.recordActivity(boardId,{entityType:"project",entityId:id,projectId:id,action:"project.delete",message:`删除项目「${old.name}」及其任务。`}); return { id }; }

  async createTask(u: CurrentUser, boardId: string, input: CreateTaskInput) { await this.requireBoardWrite(u, boardId); const p = text(input.projectId) ? await this.getProjectRow(boardId, text(input.projectId)) : await this.firstProjectRow(boardId); if (!p) throw new Error("Project not found"); const projectId = String(p.id); const now = iso(); const row = { id: crypto.randomUUID(), project_id: projectId, title: text(input.title, "未命名任务"), description: opt(input.description), status: "backlog", priority: isPriority(input.priority) ? input.priority : "medium", owner: text(input.owner, "未分配"), tester: opt(input.tester), start_date: "", test_due_date: opt(input.testDueDate), design_due_date: opt(input.designDueDate), due_date: opt(input.dueDate), estimate: 1, progress: 0, blockers: 0, blocked_reason: "", tags: JSON.stringify(tags(input.tags, [])), order_index: await this.nextTaskOrderIndex("backlog", projectId), deleted_at: null, completed_at: null, created_at: now, updated_at: now }; await this.x("INSERT INTO tasks (id,project_id,title,description,status,priority,owner,tester,start_date,test_due_date,design_due_date,due_date,estimate,progress,blockers,blocked_reason,tags,order_index,deleted_at,completed_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", [row.id,row.project_id,row.title,row.description,row.status,row.priority,row.owner,row.tester,row.start_date,row.test_due_date,row.design_due_date,row.due_date,row.estimate,row.progress,row.blockers,row.blocked_reason,row.tags,row.order_index,row.deleted_at,row.completed_at,row.created_at,row.updated_at]); await this.recordActivity(boardId,{entityType:"task",entityId:row.id,projectId:projectId,taskId:row.id,action:"task.create",message:`创建任务「${row.title}」。`,meta:{status:row.status}}); return task(row, []); }
  async createReworkTask(u: CurrentUser, boardId: string, id: string) {
    await this.requireBoardWrite(u, boardId);
    const old = await this.getTaskRow(boardId, id);
    if (!old || old.deleted_at) throw new Error("Task not found");

    const current = task(old, (await this.getSubtasks(id)).map(subtask));
    if (current.status !== "done") {
      throw new Error("Only completed tasks can be reworked");
    }

    const now = iso();
    const newTaskId = crypto.randomUUID();
    const nextTitle = current.title.endsWith("（返工）") ? current.title : `${current.title}（返工）`;
    const nextTags = Array.from(new Set([...current.tags, "返工"]));

    await this.x("INSERT INTO tasks (id,project_id,title,description,status,priority,owner,tester,start_date,test_due_date,design_due_date,due_date,estimate,progress,blockers,blocked_reason,tags,order_index,deleted_at,completed_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", [
      newTaskId,
      current.projectId,
      nextTitle,
      current.description,
      "backlog",
      current.priority,
      current.owner,
      current.tester,
      "",
      current.testDueDate,
      current.designDueDate,
      current.dueDate,
      current.estimate,
      0,
      0,
      "",
      JSON.stringify(nextTags),
      await this.nextTaskOrderIndex("backlog", current.projectId),
      null,
      null,
      now,
      now,
    ]);

    for (const [index, step] of current.subtasks.entries()) {
      await this.x("INSERT INTO subtasks (id,task_id,title,done,order_index,created_at,updated_at) VALUES (?,?,?,?,?,?,?)", [
        crypto.randomUUID(),
        newTaskId,
        step.title,
        0,
        (index + 1) * 10,
        now,
        now,
      ]);
    }

    await this.recordActivity(boardId, {
      entityType: "task",
      entityId: newTaskId,
      projectId: current.projectId,
      taskId: newTaskId,
      action: "task.rework",
      message: `基于已完成任务「${current.title}」发起返工，新任务「${nextTitle}」已进入${statusLabel("backlog")}。`,
      meta: {
        sourceTaskId: current.id,
        sourceStatus: current.status,
        afterStatus: "backlog",
      },
    });

    return task(await this.getTaskRow(boardId, newTaskId), (await this.getSubtasks(newTaskId)).map(subtask));
  }
  async updateTask(u: CurrentUser, boardId: string, id: string, input: UpdateTaskInput) { await this.requireBoardWrite(u, boardId); const old = await this.getTaskRow(boardId, id); if (!old || old.deleted_at) throw new Error("Task not found"); const cur = task(old, await this.getSubtasks(id).then((rows) => rows.map(subtask))); const status = input.status === undefined ? cur.status : normalizeBoardStatus(input.status); const p = text(input.projectId, cur.projectId); if (!(await this.getProjectRow(boardId,p))) throw new Error("Project not found"); const nextTags = JSON.stringify(tags(input.tags, cur.tags)); const completed = status === "done" ? (cur.status === "done" ? cur.completedAt : iso()) : null; const order = status !== cur.status ? await this.nextTaskOrderIndex(status, p) : cur.orderIndex; await this.x("UPDATE tasks SET title=?,description=?,project_id=?,status=?,priority=?,owner=?,tester=?,start_date=?,test_due_date=?,design_due_date=?,due_date=?,estimate=?,progress=?,blockers=?,blocked_reason=?,tags=?,order_index=?,completed_at=?,updated_at=? WHERE id=?", [text(input.title,cur.title),opt(input.description,cur.description),p,status,isPriority(input.priority)?input.priority:cur.priority,text(input.owner,cur.owner),opt(input.tester,cur.tester),opt(input.startDate,cur.startDate),opt(input.testDueDate,cur.testDueDate),opt(input.designDueDate,cur.designDueDate),opt(input.dueDate,cur.dueDate),num(input.estimate,cur.estimate,1,99),num(input.progress,cur.progress,0,100),num(input.blockers,cur.blockers,0,99),opt(input.blockedReason,cur.blockedReason),nextTags,order,completed,iso(),id]); await this.recordActivity(boardId,{entityType:"task",entityId:id,projectId:p,taskId:id,action:status!==cur.status?"task.status":"task.update",message:status!==cur.status?`移动任务「${text(input.title,cur.title)}」：${statusLabel(cur.status)} -> ${statusLabel(status)}。`:`更新任务「${text(input.title,cur.title)}」。`,meta:{beforeStatus:cur.status,afterStatus:status}}); return task(await this.getTaskRow(boardId,id), (await this.getSubtasks(id)).map(subtask)); }
  async deleteTask(u: CurrentUser, boardId: string, id: string) { await this.requireBoardWrite(u, boardId); const old = await this.getTaskRow(boardId,id); if (!old || old.deleted_at) throw new Error("Task not found"); await this.x("UPDATE tasks SET deleted_at=?,updated_at=? WHERE id=?", [iso(),iso(),id]); await this.recordActivity(boardId,{entityType:"task",entityId:id,projectId:old.project_id,taskId:id,action:"task.delete",message:`删除任务「${old.title}」。`}); return { id }; }
  async reorderTasks(u: CurrentUser, boardId: string, input: ReorderTaskInput) { await this.requireBoardWrite(u, boardId); const items = Array.isArray(input.updates) ? input.updates.map(reorderItem).filter(isReorderItem) : []; if (!items.length) return { ok: true as const }; const rows = await this.getTaskRowsByIds(boardId, items.map((i) => i.id)); const byId = new Map(rows.map((r) => [r.id,r])); for (const it of items) { const old = byId.get(it.id); const oldStatus = normalizeBoardStatus(old?.status); const completed = it.status === "done" ? (oldStatus === "done" ? old?.completed_at ?? iso() : iso()) : null; await this.x("UPDATE tasks SET status=?,order_index=?,completed_at=?,updated_at=? WHERE id=?", [it.status,it.orderIndex,completed as string | null,iso(),it.id]); if (old && oldStatus !== it.status) { await this.recordActivity(boardId,{entityType:"task",entityId:it.id,projectId:old.project_id as string,taskId:it.id,action:"task.status",message:`移动任务「${old.title as string}」：${statusLabel(oldStatus)} -> ${statusLabel(it.status)}。`,meta:{beforeStatus:oldStatus,afterStatus:it.status}}); } } return { ok: true as const }; }
  async createSubtask(u: CurrentUser, boardId: string, taskId: string, input: CreateSubtaskInput) { await this.requireBoardWrite(u, boardId); const t = await this.getTaskRow(boardId,taskId); if (!t || t.deleted_at) throw new Error("Task not found"); const now=iso(); const row={id:crypto.randomUUID(),task_id:taskId,title:text(input.title,"新拆解项"),done:0,order_index:await this.nextSubtaskOrderIndex(taskId),created_at:now,updated_at:now}; await this.x("INSERT INTO subtasks (id,task_id,title,done,order_index,created_at,updated_at) VALUES (?,?,?,?,?,?,?)", [row.id,row.task_id,row.title,row.done,row.order_index,row.created_at,row.updated_at]); await this.recalculateTaskProgress(taskId); await this.recordActivity(boardId,{entityType:"subtask",entityId:row.id,projectId:t.project_id,taskId,action:"subtask.create",message:`为「${t.title}」添加任务拆解「${row.title}」。`}); return subtask(row); }
  async updateSubtask(u: CurrentUser, boardId: string, taskId: string, subtaskId: string, input: UpdateSubtaskInput) { await this.requireBoardWrite(u, boardId); const t=await this.getTaskRow(boardId,taskId), old=await this.getSubtask(taskId,subtaskId); if (!t || t.deleted_at || !old) throw new Error("Subtask not found"); const oldTitle = String(old.title ?? ""); const done=typeof input.done==="boolean"?(input.done?1:0):old.done; await this.x("UPDATE subtasks SET title=?,done=?,updated_at=? WHERE id=? AND task_id=?", [text(input.title,oldTitle),done as SqlValue,iso(),subtaskId,taskId]); await this.recalculateTaskProgress(taskId); await this.recordActivity(boardId,{entityType:"subtask",entityId:subtaskId,projectId:t.project_id,taskId,action:done!==old.done?"subtask.toggle":"subtask.update",message:`更新任务拆解「${text(input.title,oldTitle)}」。`,meta:{done:Boolean(done)}}); return subtask(await this.getSubtask(taskId,subtaskId)); }
  async deleteSubtask(u: CurrentUser, boardId: string, taskId: string, subtaskId: string) { await this.requireBoardWrite(u, boardId); const t=await this.getTaskRow(boardId,taskId), old=await this.getSubtask(taskId,subtaskId); if (!t || t.deleted_at || !old) throw new Error("Subtask not found"); await this.x("DELETE FROM subtasks WHERE id=? AND task_id=?", [subtaskId,taskId]); await this.recalculateTaskProgress(taskId); await this.recordActivity(boardId,{entityType:"subtask",entityId:subtaskId,projectId:t.project_id,taskId,action:"subtask.delete",message:`删除任务拆解「${old.title}」。`}); return { id: subtaskId }; }

  async ensureSuperAdmin() { if (Number((await this.q("SELECT COUNT(*) AS count FROM users"))[0]?.count) > 0) return; const now=iso(); const username = process.env.KANBAN_SUPER_ADMIN_USERNAME??"admin"; await this.x("INSERT INTO users (id,username,password_hash,role,display_name,avatar_key,timezone,is_active,created_at,updated_at) VALUES (?,?,?,'super_admin','','',?,1,?,?)", ["super-admin",username,await hashPassword(process.env.KANBAN_SUPER_ADMIN_PASSWORD??"admin@123"),normalizeTimeZone(process.env.KANBAN_DEFAULT_TIMEZONE),now,now]); }
  async ensureDefaultBoardForLegacyData() { const admin=(await this.q("SELECT * FROM users WHERE role='super_admin' ORDER BY created_at ASC LIMIT 1"))[0]; if (!admin) return; const adminId=String(admin.id); const now=iso(); if (!(await this.q("SELECT id FROM boards WHERE id=? LIMIT 1", [DEFAULT_BOARD_ID]))[0]) await this.x("INSERT INTO boards (id,name,description,owner_user_id,created_at,updated_at) VALUES (?,'默认看板','系统初始化生成的默认看板',?,?,?)", [DEFAULT_BOARD_ID,adminId,now,now]); await this.x("INSERT INTO board_members (board_id,user_id,role,created_at) VALUES (?,?,'owner',?) ON CONFLICT(board_id,user_id) DO UPDATE SET role='owner'", [DEFAULT_BOARD_ID,adminId,now]); await this.x("UPDATE projects SET board_id=? WHERE board_id='' OR board_id IS NULL", [DEFAULT_BOARD_ID]); await this.x("UPDATE task_activity SET board_id=? WHERE board_id='' OR board_id IS NULL", [DEFAULT_BOARD_ID]); }
  async ensureSystemParameters() { const now=iso(); for (const p of defaultSystemParameters) { if ((await this.q("SELECT key FROM system_parameters WHERE key=?", [p.key]))[0]) await this.x("UPDATE system_parameters SET label=?,value_type=?,parameter_group=?,unit=?,min_value=?,max_value=?,order_index=? WHERE key=?", [p.label,p.valueType,p.group,p.unit,p.minValue,p.maxValue,p.orderIndex,p.key]); else await this.x("INSERT INTO system_parameters (key,value,label,value_type,parameter_group,unit,min_value,max_value,order_index,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)", [p.key,p.value,p.label,p.valueType,p.group,p.unit,p.minValue,p.maxValue,p.orderIndex,now]); } }
  async ensureBoardDefaults(boardId: string, ownerName: string) { if (Number((await this.q("SELECT COUNT(*) AS count FROM projects WHERE board_id=?", [boardId]))[0]?.count) > 0) return; const now=iso(); await this.x("INSERT INTO projects (id,board_id,name,description,owner,color,health,status,summary,archived_at,order_index,created_at,updated_at) VALUES (?,?,'默认项目','用于承载本看板的默认任务集合。',?,'#1f6f68','normal','active','',NULL,10,?,?)", [crypto.randomUUID(),boardId,ownerName||"未分配",now,now]); }
  async getBoardSummaryById(u: CurrentUser, boardId: string) {
    const boards = await this.listBoardsForUser(u);
    return boards.find((item) => item.id === boardId) ?? null;
  }
  async requireBoardRead(u: CurrentUser, boardId: string) { if (u.role === "super_admin") return; if (!(await this.q("SELECT b.id FROM boards b LEFT JOIN board_members bm ON bm.board_id=b.id AND bm.user_id=? WHERE b.id=? AND (b.owner_user_id=? OR bm.user_id=?) LIMIT 1", [u.id,boardId,u.id,u.id]))[0]) throw new Error("Forbidden"); }
  async requireBoardWrite(u: CurrentUser, boardId: string) { if (u.role === "super_admin") return; if (!(await this.q("SELECT id FROM boards WHERE id=? AND owner_user_id=? LIMIT 1", [boardId,u.id]))[0]) throw new Error("Forbidden"); }
  async firstProjectRow(boardId: string) { return (await this.q("SELECT * FROM projects WHERE board_id=? AND status='active' ORDER BY order_index ASC LIMIT 1", [boardId]))[0] ?? null; }
  async getProjectRow(boardId: string, id: string) { return (await this.q("SELECT * FROM projects WHERE id=? AND board_id=? LIMIT 1", [id,boardId]))[0] ?? null; }
  async getTaskRow(boardId: string, id: string) { return (await this.q("SELECT t.* FROM tasks t JOIN projects p ON p.id=t.project_id WHERE t.id=? AND p.board_id=? LIMIT 1", [id,boardId]))[0] ?? null; }
  async getTaskRowsByIds(boardId: string, ids: string[]) { return ids.length ? this.q(`SELECT t.* FROM tasks t JOIN projects p ON p.id=t.project_id WHERE p.board_id=? AND t.id IN (${ids.map(()=>"?").join(",")})`, [boardId,...ids]) : []; }
  async getSubtasks(taskId: string) { return this.q("SELECT * FROM subtasks WHERE task_id=? ORDER BY order_index ASC", [taskId]); }
  async getSubtask(taskId: string, subtaskId: string) { return (await this.q("SELECT * FROM subtasks WHERE id=? AND task_id=? LIMIT 1", [subtaskId,taskId]))[0] ?? null; }
  async nextProjectOrderIndex(boardId: string) { return Math.max(0,...(await this.q("SELECT order_index FROM projects WHERE board_id=?", [boardId])).map((r)=>Number(r.order_index)))+10; }
  async nextTaskOrderIndex(status: string, projectId: string) { return Math.max(0,...(await this.q("SELECT order_index FROM tasks WHERE status=? AND project_id=? AND deleted_at IS NULL", [status,projectId])).map((r)=>Number(r.order_index)))+10; }
  async nextSubtaskOrderIndex(taskId: string) { return Math.max(0,...(await this.getSubtasks(taskId)).map((r)=>Number(r.order_index)))+10; }
  async recalculateTaskProgress(taskId: string) { const rows=await this.getSubtasks(taskId); if (!rows.length) return null; const progress=Math.round((rows.filter((r)=>r.done===1||r.done===true).length/rows.length)*100); await this.x("UPDATE tasks SET progress=?,updated_at=? WHERE id=?", [progress,iso(),taskId]); return progress; }
  async cleanupExpiredActivity(boardId: string, settings: SystemSettings) { await this.x("DELETE FROM task_activity WHERE board_id=? AND created_at<?", [boardId,new Date(Date.now()-num(settings.activityRetentionDays,defaultSystemSettings.activityRetentionDays,1,3650)*86400000).toISOString()]); }
  async recordActivity(boardId: string, a: Record<string, unknown>) { await this.x("INSERT INTO task_activity (id,board_id,entity_type,entity_id,project_id,task_id,action,message,meta,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)", [crypto.randomUUID(),boardId,text(a.entityType,"board"),text(a.entityId),typeof a.projectId==="string"?a.projectId:null,typeof a.taskId==="string"?a.taskId:null,text(a.action),text(a.message),JSON.stringify(a.meta??{}),iso()]); }
}

function user(r: Record<string, unknown>): CurrentUser { return { id: r.id as string, username: r.username as string, role: r.role === "super_admin" ? "super_admin" : "user", timezone: normalizeTimeZone(r.timezone as string), displayName: typeof r.display_name === "string" ? r.display_name : "", avatarKey: typeof r.avatar_key === "string" ? r.avatar_key : "" }; }
function managedUser(r: Record<string, unknown>): ManagedUser { return { ...user(r), isActive: r.is_active === 1 || r.is_active === true, createdAt: r.created_at as string, updatedAt: r.updated_at as string }; }
function board(r: Record<string, unknown>, role?: string): BoardSummary { return { id: r.id as string, name: r.name as string, description: r.description as string, ownerUserId: r.owner_user_id as string, ownerUsername: (r.owner_username as string) ?? "", role: role === "owner" || role === "viewer" || role === "admin" ? role : "viewer", createdAt: r.created_at as string, updatedAt: r.updated_at as string }; }
function project(r: Record<string, unknown>) { return { id: r.id as string, name: r.name as string, description: r.description as string, owner: r.owner as string, color: r.color as string, health: isProjectHealth(r.health) ? r.health : "normal", status: isProjectStatus(r.status) ? r.status : "active", summary: r.summary as string, archivedAt: r.archived_at as string | null, orderIndex: Number(r.order_index ?? 0), createdAt: r.created_at as string, updatedAt: r.updated_at as string }; }
function subtask(r: Record<string, unknown>) { return { id: r.id as string, taskId: r.task_id as string, title: r.title as string, done: r.done === 1 || r.done === true, orderIndex: Number(r.order_index ?? 0), createdAt: r.created_at as string, updatedAt: r.updated_at as string }; }
function task(r: Record<string, unknown>, steps: Subtask[]) { return { id: r.id as string, projectId: r.project_id as string, title: r.title as string, description: r.description as string, status: normalizeBoardStatus(r.status), priority: isPriority(r.priority) ? r.priority : "medium", owner: r.owner as string, tester: typeof r.tester === "string" ? r.tester : "", startDate: r.start_date as string, testDueDate: r.test_due_date as string, designDueDate: typeof r.design_due_date === "string" ? r.design_due_date : "", dueDate: r.due_date as string, estimate: Number(r.estimate ?? 1), progress: Number(r.progress ?? 0), blockers: Number(r.blockers ?? 0), blockedReason: r.blocked_reason as string, tags: parseTags(r.tags as string), subtasks: steps, orderIndex: Number(r.order_index ?? 0), deletedAt: r.deleted_at as string | null, completedAt: r.completed_at as string | null, createdAt: r.created_at as string, updatedAt: r.updated_at as string }; }
function activityRow(r: Record<string, unknown>) { return { id: r.id as string, entityType: ["project", "task", "subtask", "board"].includes(r.entity_type as string) ? r.entity_type as ActivityLog["entityType"] : "board", entityId: r.entity_id as string, projectId: r.project_id as string | null, taskId: r.task_id as string | null, action: r.action as string, message: r.message as string, meta: json(r.meta as string), createdAt: r.created_at as string }; }
function parameter(r: Record<string, unknown>) { return { key: r.key as string, value: r.value as string, label: r.label as string, valueType: r.value_type === "number" || r.value_type === "boolean" ? r.value_type as SystemParameter["valueType"] : "text", group: r.parameter_group as string, unit: r.unit as string, minValue: r.min_value as number | null, maxValue: r.max_value as number | null, orderIndex: r.order_index as number, updatedAt: r.updated_at as string }; }
function settingsFromRows(rows: Record<string, unknown>[]) { const parameters = rows.map(parameter); return { dueSoonDays: num(parameters.find((p) => p.key === "due_soon_days")?.value, defaultSystemSettings.dueSoonDays, 0, 30), activityRetentionDays: num(parameters.find((p) => p.key === "activity_retention_days")?.value, defaultSystemSettings.activityRetentionDays, 1, 3650), parameters }; }
function parameterValue(p: SystemParameter, current: string, raw: unknown) { if (p.valueType === "number") return String(num(raw, Number(current) || Number(p.value), p.minValue ?? 0, p.maxValue ?? 100000)); if (p.valueType === "boolean") return String(raw === true || raw === "true"); return opt(raw, current); }
function normalizeUsername(v:unknown){ const u=text(v); if(!USERNAME_PATTERN.test(u)) throw new Error("Username must contain only letters and numbers"); return u; }
function adminOnly(u:CurrentUser){ if(u.role!=="super_admin") throw new Error("Forbidden"); }
function iso(){ return new Date().toISOString(); }
function text(v:unknown, fallback=""){ return typeof v==="string"&&v.trim()?v.trim():fallback; }
function opt(v:unknown, fallback=""){ return typeof v==="string"?v.trim():fallback; }
function num(v:unknown, fallback:number, min:number, max:number){ const n=typeof v==="number"?v:Number(v); return Number.isFinite(n)?Math.min(max,Math.max(min,Math.round(n))):fallback; }
function json(v:string){ try{ const p=JSON.parse(v); return p&&typeof p==="object"&&!Array.isArray(p)?p:{}; }catch{return{};} }
function parseTags(v:string){ try{ const p=JSON.parse(v); return Array.isArray(p)?p.filter((x)=>typeof x==="string"):[]; }catch{return[];} }
function tags(v:unknown, fallback:string[]){ const raw=typeof v==="string"?v.split(/[,\s，、]+/):Array.isArray(v)?v:fallback; return raw.filter((x)=>typeof x==="string").map((x)=>x.trim()).filter(Boolean).filter((x,i,a)=>a.indexOf(x)===i).slice(0,8); }
function reorderItem(v:unknown){ if(!v||typeof v!=="object") return null; const r=v as Record<string,unknown>; const id=text(r.id); return id?{id,status:normalizeBoardStatus(r.status),orderIndex:num(r.orderIndex,0,0,100000)}:null; }
function isReorderItem(v: ReturnType<typeof reorderItem>): v is NonNullable<ReturnType<typeof reorderItem>> { return v !== null; }
