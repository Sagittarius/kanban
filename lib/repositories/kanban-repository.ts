import { getDbAdapter, getStorageMode, type DatabaseAdapter, type SqlValue } from "@/db/sql-adapter";
import { isAuthFeatureEnabled } from "@/lib/auth-feature";
import type {
  AdminPermissions,
  AuditLogEntry,
  BoardSummary,
  CurrentUser,
  ManagedUser,
  TeamMemberSummary,
  TeamSummary,
  UserRole,
} from "@/lib/auth-models";
import {
  columnsFromSettings,
  defaultSystemParameters,
  defaultSystemSettings,
  isPriority,
  isProjectHealth,
  isProjectStatus,
  normalizeBoardStatus,
  type ActivityLog,
  type BoardStatus,
  type BoardTeamOption,
  type BoardUserOption,
  type Priority,
  type ProjectHealth,
  type ProjectStatus,
  type Subtask,
  type SystemParameter,
  type SystemSettings,
} from "@/lib/board-data";
import { currentLogContext, errorFields, getLogger } from "@/lib/logger";
import { hashPassword } from "@/lib/password";
import { DEFAULT_TIMEZONE, normalizeTimeZone, todayKeyInTimeZone } from "@/lib/timezone";

export type CreateUserInput = {
  username?: unknown;
  password?: unknown;
  timezone?: unknown;
  role?: unknown;
  displayName?: unknown;
  phone?: unknown;
  jobTitle?: unknown;
  techStacks?: unknown;
  isActive?: unknown;
};
export type UpdateManagedUserInput = Partial<CreateUserInput>;
export type CreateTeamInput = {
  name?: unknown;
  description?: unknown;
  color?: unknown;
  memberIds?: unknown;
};
export type UpdateTeamInput = Partial<CreateTeamInput>;
export type CreateBoardInput = { name?: unknown; description?: unknown; teamIds?: unknown };
export type UpdateBoardInput = Partial<CreateBoardInput>;
export type UpdateUserProfileInput = Partial<{ displayName: unknown; phone: unknown; timezone: unknown; avatarKey: unknown; jobTitle: unknown; techStacks: unknown }>;
export type CreateProjectInput = {
  name?: unknown;
  description?: unknown;
  owner?: unknown;
  color?: unknown;
  health?: unknown;
  teamId?: unknown;
};
export type UpdateProjectInput = Partial<CreateProjectInput & { status: unknown; summary: unknown }>;
export type CreateTaskInput = {
  title?: unknown;
  description?: unknown;
  projectId?: unknown;
  priority?: unknown;
  owner?: unknown;
  ownerUserId?: unknown;
  tester?: unknown;
  testerUserId?: unknown;
  workloadDays?: unknown;
  testDueDate?: unknown;
  designDueDate?: unknown;
  dueDate?: unknown;
  tags?: unknown;
};
export type UpdateTaskInput = Partial<
  CreateTaskInput & {
    status: unknown;
    startDate: unknown;
    estimate: unknown;
    workloadDays: unknown;
    progress: unknown;
    blockers: unknown;
    blockedReason: unknown;
  }
>;
export type ReorderTaskInput = { updates?: unknown };
export type CreateSubtaskInput = { title?: unknown };
export type UpdateSubtaskInput = Partial<{ title: unknown; done: unknown }>;
export type UpdateSystemSettingsInput = Partial<{ dueSoonDays: unknown; activityRetentionDays: unknown; parameters: unknown }>;
export type WorkloadDashboardInput = Partial<{ teamId: unknown; projectId: unknown; teamIds: unknown; projectIds: unknown }>;
export type AuditLogInput = {
  actor?: CurrentUser | null;
  actorUserId?: string;
  actorUsername?: string;
  actorRole?: string;
  action: string;
  resourceType?: string;
  resourceId?: string;
  boardId?: string;
  result?: "success" | "failure";
  message?: string;
  metadata?: Record<string, unknown>;
};

export const USERNAME_PATTERN = /^[A-Za-z0-9_]+$/;
export const DEFAULT_BOARD_ID = process.env.KANBAN_DEFAULT_BOARD_ID?.trim() || "default-board";
let repositoryPromise: Promise<KanbanRepository> | null = null;
const repositoryLogger = getLogger("repository");

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

  async q<T extends Record<string, unknown> = Record<string, unknown>>(sql: string, params: SqlValue[] = []) {
    return this.db.query<T>(sql, params);
  }

  async x(sql: string, params: SqlValue[] = []) {
    return this.db.execute(sql, params);
  }

  async ensureBootstrapData() {
    await this.ensureSuperAdmin();
    await this.ensureRoleCompatibility();
    await this.ensureSystemParameters();
    await this.ensureDefaultBoardForLegacyData();
  }

  async getBootstrapUser(): Promise<CurrentUser> {
    await this.ensureBootstrapData();
    const user = await this.getUserById("super-admin");
    if (!user) throw new Error("Bootstrap user not found");
    return user;
  }

  async findUserByUsername(username: string) {
    await this.ensureBootstrapData();
    return (await this.q("SELECT * FROM users WHERE lower(username)=lower(?) LIMIT 1", [username]))[0] ?? null;
  }

  async getUserById(id: string): Promise<CurrentUser | null> {
    await this.ensureBootstrapData();
    const row = (await this.q("SELECT * FROM users WHERE id=? AND is_active=1 LIMIT 1", [id]))[0];
    return row ? user(row) : null;
  }

  async listUsers(actor?: CurrentUser): Promise<ManagedUser[]> {
    await this.ensureBootstrapData();
    if (actor && isManagementRole(actor) && actor.role !== "super_admin") {
      return (await this.q("SELECT * FROM users WHERE role='team_member' ORDER BY username ASC")).map(managedUser);
    }
    return (await this.q("SELECT * FROM users ORDER BY role ASC, username ASC")).map(managedUser);
  }

  async listAuditLogs(actor: CurrentUser, limit = 120): Promise<AuditLogEntry[]> {
    this.requireAdminAccess(actor);
    const safeLimit = Math.min(500, Math.max(20, Math.round(limit)));
    const rows =
      actor.role === "super_admin"
        ? await this.q("SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT ?", [safeLimit])
        : await this.q("SELECT * FROM audit_logs WHERE actor_user_id=? ORDER BY created_at DESC LIMIT ?", [actor.id, safeLimit]);
    return rows.map(auditLogRow);
  }

  async adminPermissions(actor: CurrentUser): Promise<AdminPermissions> {
    await this.ensureBootstrapData();
    const pmCanManageUsers = await this.projectManagerUserManagementEnabled();
    return {
      canManageUsers: actor.role === "super_admin" || (isManagementRole(actor) && pmCanManageUsers),
      canCreateSuperAdmin: actor.role === "super_admin",
      canManageAllBoards: actor.role === "super_admin",
    };
  }

  async createUser(input: CreateUserInput, actor?: CurrentUser): Promise<ManagedUser> {
    await this.ensureBootstrapData();
    if (actor) await this.requireUserManagement(actor);

    const username = normalizeUsername(input.username);
    if (await this.findUserByUsername(username)) throw new Error("Username already exists");

    const desiredRole = normalizeUserRole(input.role, "team_member");
    if (actor && isManagementRole(actor) && actor.role !== "super_admin" && desiredRole !== "team_member") {
      throw new Error("Forbidden");
    }

    const now = iso();
    const row = {
      id: crypto.randomUUID(),
      username,
      password_hash: await hashPassword(text(input.password, `${username}@123`)),
      role: desiredRole,
      display_name: opt(input.displayName),
      phone: opt(input.phone),
      avatar_key: "",
      job_title: normalizeJobTitle(input.jobTitle, defaultJobTitleForRole(desiredRole)),
      tech_stacks: JSON.stringify(techStacks(input.techStacks, [])),
      timezone: normalizeTimeZone(input.timezone),
      is_active: input.isActive === false ? 0 : 1,
      created_at: now,
      updated_at: now,
    };
    await this.x(
      "INSERT INTO users (id,username,password_hash,role,display_name,phone,avatar_key,job_title,tech_stacks,timezone,is_active,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
      [
        row.id,
        row.username,
        row.password_hash,
        row.role,
        row.display_name,
        row.phone,
        row.avatar_key,
        row.job_title,
        row.tech_stacks,
        row.timezone,
        row.is_active,
        row.created_at,
        row.updated_at,
      ]
    );
    if (actor) {
      await this.recordAuditLog({
        actor,
        action: "admin.user.create",
        resourceType: "user",
        resourceId: row.id,
        message: `创建用户 ${row.username}`,
        metadata: { username: row.username, role: row.role },
      });
    }
    return managedUser(row);
  }

  async updateManagedUser(actor: CurrentUser, userId: string, input: UpdateManagedUserInput): Promise<ManagedUser> {
    await this.ensureBootstrapData();
    await this.requireUserManagement(actor);
    const current = await this.getManagedUserRow(userId);
    if (!current) throw new Error("User not found");
    const currentRole = normalizeUserRole(current.role);
    if (isManagementRole(actor) && actor.role !== "super_admin" && currentRole !== "team_member") throw new Error("Forbidden");

    const nextRole = input.role === undefined ? currentRole : normalizeUserRole(input.role, currentRole);
    if (isManagementRole(actor) && actor.role !== "super_admin" && nextRole !== "team_member") throw new Error("Forbidden");
    if (currentRole === "super_admin" && nextRole !== "super_admin") {
      await this.ensureAnotherActiveSuperAdmin(userId);
    }

    const nextUsername = input.username === undefined ? String(current.username) : normalizeUsername(input.username);
    if (nextUsername.toLowerCase() !== String(current.username).toLowerCase()) {
      const existing = await this.findUserByUsername(nextUsername);
      if (existing && existing.id !== userId) throw new Error("Username already exists");
    }

    const nextActive = input.isActive === undefined ? boolInt(current.is_active) : input.isActive === true ? 1 : 0;
    if (!nextActive && userId === actor.id) throw new Error("Cannot delete current user");
    if (!nextActive && currentRole === "super_admin") await this.ensureAnotherActiveSuperAdmin(userId);

    await this.x(
      "UPDATE users SET username=?,role=?,display_name=?,phone=?,job_title=?,tech_stacks=?,timezone=?,is_active=?,updated_at=? WHERE id=?",
      [
        nextUsername,
        nextRole,
        opt(input.displayName, String(current.display_name ?? "")),
        opt(input.phone, String(current.phone ?? "")),
        normalizeJobTitle(input.jobTitle, String(current.job_title ?? defaultJobTitleForRole(nextRole))),
        JSON.stringify(techStacks(input.techStacks, parseJsonStringArray(current.tech_stacks))),
        normalizeTimeZone(input.timezone ?? current.timezone),
        nextActive,
        iso(),
        userId,
      ]
    );
    const updated = await this.getManagedUserRow(userId);
    if (!updated) throw new Error("User not found");
    await this.recordAuditLog({
      actor,
      action: nextActive ? "admin.user.update" : "admin.user.disable",
      resourceType: "user",
      resourceId: userId,
      message: `${nextActive ? "更新" : "停用"}用户 ${String(updated.username)}`,
      metadata: { beforeRole: currentRole, afterRole: nextRole, active: Boolean(nextActive) },
    });
    return managedUser(updated);
  }

  async deleteManagedUser(actor: CurrentUser, userId: string) {
    await this.updateManagedUser(actor, userId, { isActive: false });
    return { id: userId };
  }

  async resetUserPassword(actor: CurrentUser, userId: string) {
    await this.ensureBootstrapData();
    await this.requireUserManagement(actor);
    const row = await this.getManagedUserRow(userId);
    if (!row) throw new Error("User not found");
    const role = normalizeUserRole(row.role);
    if (isManagementRole(actor) && actor.role !== "super_admin" && role !== "team_member") throw new Error("Forbidden");
    const username = String(row.username);
    const password = `${username}@123`;
    await this.x("UPDATE users SET password_hash=?,updated_at=? WHERE id=?", [await hashPassword(password), iso(), userId]);
    await this.recordAuditLog({
      actor,
      action: "admin.user.password.reset",
      resourceType: "user",
      resourceId: userId,
      message: `重置用户 ${username} 的密码`,
      metadata: { username },
    });
    return { username, password };
  }

  async updateUserProfile(userId: string, input: UpdateUserProfileInput): Promise<CurrentUser> {
    await this.ensureBootstrapData();
    const current = await this.getUserById(userId);
    if (!current) throw new Error("User not found");
    await this.x("UPDATE users SET display_name=?,phone=?,avatar_key=?,job_title=?,tech_stacks=?,timezone=?,updated_at=? WHERE id=?", [
      current.displayName,
      opt(input.phone, current.phone),
      opt(input.avatarKey, current.avatarKey),
      normalizeJobTitle(input.jobTitle, current.jobTitle),
      JSON.stringify(techStacks(input.techStacks, current.techStacks)),
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

  async listBoardsForUser(actor: CurrentUser): Promise<BoardSummary[]> {
    await this.ensureBootstrapData();
    const rows =
      actor.role === "super_admin"
        ? await this.q(
            "SELECT b.*,u.username AS owner_username,'admin' AS access_role FROM boards b LEFT JOIN users u ON u.id=b.owner_user_id ORDER BY b.updated_at DESC,b.created_at DESC"
          )
        : await this.q(
            "SELECT DISTINCT b.*,u.username AS owner_username,CASE WHEN b.owner_user_id=? THEN 'owner' ELSE COALESCE(bm.role,'viewer') END AS access_role FROM boards b LEFT JOIN users u ON u.id=b.owner_user_id LEFT JOIN board_members bm ON bm.board_id=b.id AND bm.user_id=? LEFT JOIN board_teams bt ON bt.board_id=b.id LEFT JOIN team_members tm ON tm.team_id=bt.team_id AND tm.user_id=? WHERE b.owner_user_id=? OR bm.user_id=? OR tm.user_id=? ORDER BY b.updated_at DESC,b.created_at DESC",
            [actor.id, actor.id, actor.id, actor.id, actor.id, actor.id]
          );
    const teamIds = await this.boardTeamIds(rows.map((row) => String(row.id)));
    return rows.map((row) =>
      board(
        row,
        actor.role === "team_member" ? "viewer" : typeof row.access_role === "string" ? row.access_role : undefined,
        teamIds.get(String(row.id)) ?? []
      )
    );
  }

  async resolveBoardForUser(actor: CurrentUser, requestedBoardId?: string | null) {
    const boards = await this.listBoardsForUser(actor);
    const selected = (requestedBoardId && boards.find((item) => item.id === requestedBoardId)) || boards[0];
    if (selected) return selected;
    if (canCreateBoards(actor)) return this.createBoard(actor, { name: `${actor.displayName || actor.username} 的看板` });
    throw new Error("Board not found");
  }

  async resolvePublicBoard(actor: CurrentUser) {
    await this.ensureBootstrapData();
    const selected = await this.firstBoardSummary(actor);
    if (selected) return selected;
    if (canCreateBoards(actor)) return this.createBoard(actor, { name: await this.defaultBoardTitle() });
    throw new Error("Board not found");
  }

  async createBoard(actor: CurrentUser, input: CreateBoardInput): Promise<BoardSummary> {
    await this.ensureBootstrapData();
    requireBoardCreator(actor);
    const now = iso();
    const row = {
      id: crypto.randomUUID(),
      name: text(input.name, "我的看板"),
      description: opt(input.description),
      owner_user_id: actor.id,
      created_at: now,
      updated_at: now,
    };
    await this.x("INSERT INTO boards (id,name,description,owner_user_id,created_at,updated_at) VALUES (?,?,?,?,?,?)", [
      row.id,
      row.name,
      row.description,
      row.owner_user_id,
      row.created_at,
      row.updated_at,
    ]);
    await this.x(
      "INSERT INTO board_members (board_id,user_id,role,created_at) VALUES (?,?,'owner',?) ON CONFLICT(board_id,user_id) DO UPDATE SET role='owner'",
      [row.id, actor.id, now]
    );
    await this.setBoardTeams(actor, row.id, ids(input.teamIds));
    await this.ensureBoardDefaults(row.id, actor.username);
    const created = await this.getBoardSummaryById(actor, row.id);
    if (!created) throw new Error("Board not found");
    await this.recordAuditLog({
      actor,
      action: "board.create",
      resourceType: "board",
      resourceId: row.id,
      boardId: row.id,
      message: `创建看板 ${row.name}`,
      metadata: { teamIds: ids(input.teamIds) },
    });
    return created;
  }

  async updateBoard(actor: CurrentUser, boardId: string, input: UpdateBoardInput): Promise<BoardSummary> {
    await this.requireBoardAdmin(actor, boardId);
    const current = await this.getBoardSummaryById(actor, boardId);
    if (!current) throw new Error("Board not found");
    await this.x("UPDATE boards SET name=?,description=?,updated_at=? WHERE id=?", [
      text(input.name, current.name),
      opt(input.description, current.description),
      iso(),
      boardId,
    ]);
    if (input.teamIds !== undefined) {
      await this.setBoardTeams(actor, boardId, ids(input.teamIds));
    }
    const updated = await this.getBoardSummaryById(actor, boardId);
    if (!updated) throw new Error("Board not found");
    await this.recordAuditLog({
      actor,
      action: "board.update",
      resourceType: "board",
      resourceId: boardId,
      boardId,
      message: `更新看板 ${updated.name}`,
      metadata: { teamIds: input.teamIds === undefined ? undefined : ids(input.teamIds) },
    });
    return updated;
  }

  async deleteBoard(actor: CurrentUser, boardId: string) {
    await this.requireBoardAdmin(actor, boardId);
    if (boardId === DEFAULT_BOARD_ID) {
      throw new Error("Default board cannot be deleted");
    }
    const existing = await this.getBoardSummaryById(actor, boardId);
    if (!existing) {
      throw new Error("Board not found");
    }

    const projectRows = await this.q("SELECT id FROM projects WHERE board_id=?", [boardId]);
    const projectIds = projectRows.map((row) => String(row.id));
    if (projectIds.length > 0) {
      const placeholders = projectIds.map(() => "?").join(",");
      const taskRows = await this.q(`SELECT id FROM tasks WHERE project_id IN (${placeholders})`, projectIds);
      const taskIds = taskRows.map((row) => String(row.id));
      if (taskIds.length > 0) {
        const taskPlaceholders = taskIds.map(() => "?").join(",");
        await this.x(`DELETE FROM subtasks WHERE task_id IN (${taskPlaceholders})`, taskIds);
      }
      await this.x(`DELETE FROM tasks WHERE project_id IN (${placeholders})`, projectIds);
      await this.x(`DELETE FROM projects WHERE id IN (${placeholders})`, projectIds);
    }
    await this.x("DELETE FROM task_activity WHERE board_id=?", [boardId]);
    await this.x("DELETE FROM board_members WHERE board_id=?", [boardId]);
    await this.x("DELETE FROM board_teams WHERE board_id=?", [boardId]);
    await this.x("DELETE FROM boards WHERE id=?", [boardId]);
    await this.recordAuditLog({
      actor,
      action: "board.delete",
      resourceType: "board",
      resourceId: boardId,
      boardId,
      message: `删除看板 ${existing.name}`,
    });
    return { id: boardId };
  }

  async listBoardsForAdmin(actor: CurrentUser) {
    this.requireAdminAccess(actor);
    if (actor.role === "super_admin") return this.listBoardsForUser(actor);
    const rows = await this.q(
      "SELECT b.*,u.username AS owner_username,'owner' AS access_role FROM boards b LEFT JOIN users u ON u.id=b.owner_user_id WHERE b.owner_user_id=? ORDER BY b.updated_at DESC,b.created_at DESC",
      [actor.id]
    );
    const teamIds = await this.boardTeamIds(rows.map((row) => String(row.id)));
    return rows.map((row) => board(row, "owner", teamIds.get(String(row.id)) ?? []));
  }

  async listBoardMembers(boardId: string) {
    await this.ensureBootstrapData();
    return this.q(
      "SELECT bm.user_id,u.username,u.display_name,u.role,bm.role AS board_role FROM board_members bm JOIN users u ON u.id=bm.user_id WHERE bm.board_id=? ORDER BY u.username ASC",
      [boardId]
    );
  }

  async grantBoardViewer(actor: CurrentUser, boardId: string, userId: string) {
    await this.requireBoardAdmin(actor, boardId);
    if (!(await this.getUserById(userId))) throw new Error("User not found");
    await this.x(
      "INSERT INTO board_members (board_id,user_id,role,created_at) VALUES (?,?,'viewer',?) ON CONFLICT(board_id,user_id) DO UPDATE SET role='viewer'",
      [boardId, userId, iso()]
    );
    await this.recordAuditLog({
      actor,
      action: "board.member.grant",
      resourceType: "board",
      resourceId: boardId,
      boardId,
      message: "授权用户查看看板",
      metadata: { userId },
    });
    return { ok: true as const };
  }

  async revokeBoardViewer(actor: CurrentUser, boardId: string, userId: string) {
    await this.requireBoardAdmin(actor, boardId);
    await this.x("DELETE FROM board_members WHERE board_id=? AND user_id=? AND role='viewer'", [boardId, userId]);
    await this.recordAuditLog({
      actor,
      action: "board.member.revoke",
      resourceType: "board",
      resourceId: boardId,
      boardId,
      message: "撤销用户看板查看授权",
      metadata: { userId },
    });
    return { ok: true as const };
  }

  async listTeamsForAdmin(actor: CurrentUser): Promise<TeamSummary[]> {
    this.requireAdminAccess(actor);
    const rows =
      actor.role === "super_admin"
        ? await this.q("SELECT t.*,u.username AS owner_username FROM teams t LEFT JOIN users u ON u.id=t.owner_user_id ORDER BY t.updated_at DESC,t.created_at DESC")
        : await this.q(
            "SELECT t.*,u.username AS owner_username FROM teams t LEFT JOIN users u ON u.id=t.owner_user_id WHERE t.owner_user_id=? ORDER BY t.updated_at DESC,t.created_at DESC",
            [actor.id]
          );
    const memberIds = await this.teamMemberIds(rows.map((row) => String(row.id)));
    return rows.map((row) => team(row, memberIds.get(String(row.id)) ?? []));
  }

  async listTeamsForDashboard(actor: CurrentUser): Promise<TeamSummary[]> {
    this.requireDashboardAccess(actor);
    const rows =
      actor.role === "super_admin"
        ? await this.q("SELECT t.*,u.username AS owner_username FROM teams t LEFT JOIN users u ON u.id=t.owner_user_id ORDER BY t.updated_at DESC,t.created_at DESC")
        : isManagementRole(actor)
          ? await this.q(
              "SELECT t.*,u.username AS owner_username FROM teams t LEFT JOIN users u ON u.id=t.owner_user_id WHERE t.owner_user_id=? ORDER BY t.updated_at DESC,t.created_at DESC",
              [actor.id]
            )
          : await this.q(
              "SELECT DISTINCT t.*,u.username AS owner_username FROM teams t JOIN team_members tm ON tm.team_id=t.id LEFT JOIN users u ON u.id=t.owner_user_id WHERE tm.user_id=? ORDER BY t.updated_at DESC,t.created_at DESC",
              [actor.id]
            );
    const memberIds = await this.teamMemberIds(rows.map((row) => String(row.id)));
    return rows.map((row) => team(row, memberIds.get(String(row.id)) ?? []));
  }

  async listAssignableUsers(): Promise<TeamMemberSummary[]> {
    await this.ensureBootstrapData();
    return (await this.q("SELECT * FROM users WHERE is_active=1 AND role IN ('project_manager','development_manager','team_member') ORDER BY role ASC,username ASC")).map(
      teamMember
    );
  }

  async createTeam(actor: CurrentUser, input: CreateTeamInput): Promise<TeamSummary> {
    this.requireAdminAccess(actor);
    const now = iso();
    const row = {
      id: crypto.randomUUID(),
      name: text(input.name, "未命名团队"),
      description: opt(input.description),
      owner_user_id: actor.id,
      color: text(input.color, "#0f766e"),
      created_at: now,
      updated_at: now,
    };
    await this.x("INSERT INTO teams (id,name,description,owner_user_id,color,created_at,updated_at) VALUES (?,?,?,?,?,?,?)", [
      row.id,
      row.name,
      row.description,
      row.owner_user_id,
      row.color,
      row.created_at,
      row.updated_at,
    ]);
    await this.replaceTeamMembers(row.id, ids(input.memberIds));
    await this.recordAuditLog({
      actor,
      action: "team.create",
      resourceType: "team",
      resourceId: row.id,
      message: `创建团队 ${row.name}`,
      metadata: { memberIds: ids(input.memberIds) },
    });
    return team({ ...row, owner_username: actor.username }, ids(input.memberIds));
  }

  async updateTeam(actor: CurrentUser, teamId: string, input: UpdateTeamInput): Promise<TeamSummary> {
    await this.requireTeamWrite(actor, teamId);
    const current = await this.getTeamRow(teamId);
    if (!current) throw new Error("Team not found");
    await this.x("UPDATE teams SET name=?,description=?,color=?,updated_at=? WHERE id=?", [
      text(input.name, String(current.name)),
      opt(input.description, String(current.description ?? "")),
      text(input.color, String(current.color ?? "#0f766e")),
      iso(),
      teamId,
    ]);
    if (input.memberIds !== undefined) {
      await this.replaceTeamMembers(teamId, ids(input.memberIds));
    }
    const updated = await this.getTeamRow(teamId);
    if (!updated) throw new Error("Team not found");
    const memberIds = (await this.teamMemberIds([teamId])).get(teamId) ?? [];
    await this.recordAuditLog({
      actor,
      action: "team.update",
      resourceType: "team",
      resourceId: teamId,
      message: `更新团队 ${String(updated.name)}`,
      metadata: { memberIds },
    });
    return team(updated, memberIds);
  }

  async deleteTeam(actor: CurrentUser, teamId: string) {
    await this.requireTeamWrite(actor, teamId);
    const used = Number((await this.q("SELECT COUNT(*) AS count FROM projects WHERE team_id=?", [teamId]))[0]?.count ?? 0);
    if (used > 0) throw new Error("Team has projects");
    await this.x("DELETE FROM board_teams WHERE team_id=?", [teamId]);
    await this.x("DELETE FROM team_members WHERE team_id=?", [teamId]);
    await this.x("DELETE FROM teams WHERE id=?", [teamId]);
    await this.recordAuditLog({
      actor,
      action: "team.delete",
      resourceType: "team",
      resourceId: teamId,
      message: "删除团队",
    });
    return { id: teamId };
  }

  async getBoard(actor: CurrentUser, boardId: string) {
    await this.requireBoardRead(actor, boardId);
    await this.ensureBoardDefaults(boardId, actor.username);
    await this.ensureSystemParameters();
    const projects = (await this.q("SELECT * FROM projects WHERE board_id=? ORDER BY status ASC,order_index ASC", [boardId])).map(project);
    const tasks = await this.q(
      "SELECT t.* FROM tasks t JOIN projects p ON p.id=t.project_id WHERE p.board_id=? AND t.deleted_at IS NULL ORDER BY t.status ASC,t.order_index ASC,t.updated_at DESC",
      [boardId]
    );
    const steps = await this.q(
      "SELECT s.* FROM subtasks s JOIN tasks t ON t.id=s.task_id JOIN projects p ON p.id=t.project_id WHERE p.board_id=? ORDER BY s.order_index ASC",
      [boardId]
    );
    const byTask = new Map<string, Subtask[]>();
    for (const step of steps) {
      const taskId = String(step.task_id);
      const list = byTask.get(taskId) ?? [];
      list.push(subtask(step));
      byTask.set(taskId, list);
    }
    const settings = settingsFromRows(await this.q("SELECT * FROM system_parameters ORDER BY order_index ASC,key ASC"));
    await this.cleanupExpiredActivity(boardId, settings);
    const activity = (await this.q("SELECT * FROM task_activity WHERE board_id=? ORDER BY created_at DESC LIMIT 80", [boardId])).map(activityRow);
    const boards = await this.listBoardsForUser(actor);
    const activeBoard = boards.find((item) => item.id === boardId);
    const teams = await this.listBoardTeamOptions(boardId);
    const users = uniqueUsers(teams.flatMap((teamItem) => teamItem.members));
    const configuredBoardTitle = parameterText(settings, "board_title");
    return {
      columns: columnsFromSettings(settings),
      projects,
      tasks: tasks.map((taskRow) => task(taskRow, byTask.get(String(taskRow.id)) ?? [])),
      teams,
      users,
      activity,
      settings,
      storageMode: getStorageMode(),
      boardName: !isAuthFeatureEnabled() && configuredBoardTitle ? configuredBoardTitle : activeBoard?.name ?? "",
      currentUser: actor,
      boards,
      activeBoardId: boardId,
      ...(activeBoard ? { activeBoard } : {}),
      todayKey: todayKeyInTimeZone(actor.timezone),
    };
  }

  async getSystemSettings(actor: CurrentUser) {
    adminOnly(actor);
    await this.ensureSystemParameters();
    return settingsFromRows(await this.q("SELECT * FROM system_parameters ORDER BY order_index ASC,key ASC"));
  }

  async updateSystemSettings(actor: CurrentUser, input: UpdateSystemSettingsInput) {
    adminOnly(actor);
    await this.ensureSystemParameters();
    const current = await this.getSystemSettings(actor);
    const defaults = new Map(defaultSystemParameters.map((parameter) => [parameter.key, parameter]));
    const currentByKey = new Map(current.parameters.map((parameter) => [parameter.key, parameter]));
    const requests = new Map<string, unknown>();
    if (input.dueSoonDays !== undefined) requests.set("due_soon_days", input.dueSoonDays);
    if (input.activityRetentionDays !== undefined) requests.set("activity_retention_days", input.activityRetentionDays);
    if (Array.isArray(input.parameters)) {
      for (const item of input.parameters) {
        if (item && typeof item === "object" && defaults.has(String((item as { key?: unknown }).key))) {
          requests.set(String((item as { key?: unknown }).key), (item as { value?: unknown }).value);
        }
      }
    }
    for (const [key, raw] of requests) {
      const defaultsRow = defaults.get(key);
      const currentRow = currentByKey.get(key);
      if (defaultsRow && currentRow) {
        await this.x("UPDATE system_parameters SET value=?,updated_at=? WHERE key=?", [
          parameterValue(defaultsRow, currentRow.value, raw),
          iso(),
          key,
        ]);
      }
    }
    await this.recordAuditLog({
      actor,
      action: "system.settings.update",
      resourceType: "system_settings",
      message: "更新系统参数",
      metadata: { keys: Array.from(requests.keys()) },
    });
    return this.getSystemSettings(actor);
  }

  async createProject(actor: CurrentUser, boardId: string, input: CreateProjectInput) {
    await this.requireBoardWrite(actor, boardId);
    const teamId = text(input.teamId);
    if (!teamId) throw new Error("Team is required");
    await this.requireBoardTeam(boardId, teamId);
    const now = iso();
    const row = {
      id: crypto.randomUUID(),
      board_id: boardId,
      team_id: teamId,
      name: text(input.name, "未命名项目"),
      description: opt(input.description),
      owner: text(input.owner, "未分配"),
      color: text(input.color, "#1f6f68"),
      health: isProjectHealth(input.health) ? input.health : "normal",
      status: "active",
      summary: "",
      archived_at: null,
      order_index: await this.nextProjectOrderIndex(boardId),
      created_at: now,
      updated_at: now,
    };
    await this.x(
      "INSERT INTO projects (id,board_id,team_id,name,description,owner,color,health,status,summary,archived_at,order_index,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
      [
        row.id,
        row.board_id,
        row.team_id,
        row.name,
        row.description,
        row.owner,
        row.color,
        row.health,
        row.status,
        row.summary,
        row.archived_at,
        row.order_index,
        row.created_at,
        row.updated_at,
      ]
    );
    await this.recordActivity(boardId, {
      entityType: "project",
      entityId: row.id,
      projectId: row.id,
      action: "project.create",
      message: `创建项目「${row.name}」。`,
    });
    await this.recordAuditLog({
      actor,
      action: "project.create",
      resourceType: "project",
      resourceId: row.id,
      boardId,
      message: `创建项目 ${row.name}`,
      metadata: { teamId },
    });
    return project(row);
  }

  async updateProject(actor: CurrentUser, boardId: string, id: string, input: UpdateProjectInput) {
    await this.requireBoardWrite(actor, boardId);
    const old = await this.getProjectRow(boardId, id);
    if (!old) throw new Error("Project not found");
    const current = project(old);
    const status = isProjectStatus(input.status) ? input.status : current.status;
    const teamId = text(input.teamId, current.teamId);
    if (!teamId) throw new Error("Team is required");
    await this.requireBoardTeam(boardId, teamId);
    const row = {
      team_id: teamId,
      name: text(input.name, current.name),
      description: opt(input.description, current.description),
      owner: text(input.owner, current.owner),
      color: text(input.color, current.color),
      health: isProjectHealth(input.health) ? input.health : current.health,
      status,
      summary: opt(input.summary, current.summary),
      archived_at: status === "archived" && current.status !== "archived" ? iso() : status === "active" ? null : current.archivedAt,
      updated_at: iso(),
    };
    await this.x(
      "UPDATE projects SET team_id=?,name=?,description=?,owner=?,color=?,health=?,status=?,summary=?,archived_at=?,updated_at=? WHERE id=? AND board_id=?",
      [
        row.team_id,
        row.name,
        row.description,
        row.owner,
        row.color,
        row.health,
        row.status,
        row.summary,
        row.archived_at,
        row.updated_at,
        id,
        boardId,
      ]
    );
    const currentTeam = current.teamId ? await this.getTeamRow(current.teamId) : null;
    const nextTeam = teamId === current.teamId ? currentTeam : await this.getTeamRow(teamId);
    const changes = compactChanges([
      changeEntry("团队", currentTeam ? String(currentTeam.name ?? current.teamId) : current.teamId || "空", nextTeam ? String(nextTeam.name ?? teamId) : teamId || "空"),
      changeEntry("项目名称", current.name, row.name),
      changeEntry("项目说明", current.description, row.description),
      changeEntry("负责人", current.owner, row.owner),
      changeEntry("颜色", current.color, row.color),
      changeEntry("健康度", healthLabel(current.health), healthLabel(row.health)),
      changeEntry("状态", projectStatusLabel(current.status), projectStatusLabel(row.status)),
      changeEntry("归档总结", current.summary, row.summary),
    ]);
    await this.recordActivity(boardId, {
      entityType: "project",
      entityId: id,
      projectId: id,
      action: status !== current.status ? (status === "archived" ? "project.archive" : "project.restore") : "project.update",
      message: changes.length ? `更新项目「${row.name}」：${summarizeChanges(changes)}。` : `更新项目「${row.name}」。`,
      meta: {
        before: { status: current.status, teamId: current.teamId },
        after: { status, teamId },
        changes,
      },
    });
    await this.recordAuditLog({
      actor,
      action: status !== current.status ? (status === "archived" ? "project.archive" : "project.restore") : "project.update",
      resourceType: "project",
      resourceId: id,
      boardId,
      message: `更新项目 ${row.name}`,
      metadata: { changes },
    });
    return project(await this.getProjectRow(boardId, id));
  }

  async deleteProject(actor: CurrentUser, boardId: string, id: string) {
    await this.requireBoardWrite(actor, boardId);
    const old = await this.getProjectRow(boardId, id);
    if (!old) throw new Error("Project not found");
    await this.x("UPDATE tasks SET deleted_at=?,updated_at=? WHERE project_id=?", [iso(), iso(), id]);
    await this.x("DELETE FROM projects WHERE id=? AND board_id=?", [id, boardId]);
    await this.recordActivity(boardId, {
      entityType: "project",
      entityId: id,
      projectId: id,
      action: "project.delete",
      message: `删除项目「${old.name}」及其任务。`,
    });
    await this.recordAuditLog({
      actor,
      action: "project.delete",
      resourceType: "project",
      resourceId: id,
      boardId,
      message: `删除项目 ${String(old.name)}`,
    });
    return { id };
  }

  async createTask(actor: CurrentUser, boardId: string, input: CreateTaskInput) {
    await this.requireBoardRead(actor, boardId);
    if (!canCreateTasks(actor)) throw new Error("Forbidden");
    const projectId = text(input.projectId);
    if (!projectId) throw new Error("Project is required");
    const projectRow = await this.getProjectRow(boardId, projectId);
    if (!projectRow) throw new Error("Project not found");
    const assignees = await this.resolveTaskAssignees(project(projectRow), input);
    const now = iso();
    const row = {
      id: crypto.randomUUID(),
      project_id: projectId,
      title: text(input.title, "未命名任务"),
      description: opt(input.description),
      status: "backlog",
      priority: isPriority(input.priority) ? input.priority : "medium",
      owner_user_id: assignees.ownerUserId,
      owner: assignees.ownerName,
      tester_user_id: assignees.testerUserId,
      tester: assignees.testerName,
      workload_days: workloadDays(input.workloadDays),
      start_date: "",
      test_due_date: opt(input.testDueDate),
      design_due_date: opt(input.designDueDate),
      due_date: opt(input.dueDate),
      estimate: 1,
      progress: 0,
      blockers: 0,
      blocked_reason: "",
      tags: JSON.stringify(tags(input.tags, [])),
      order_index: await this.nextTaskOrderIndex("backlog", projectId),
      deleted_at: null,
      completed_at: null,
      created_at: now,
      updated_at: now,
    };
    await this.x(
      "INSERT INTO tasks (id,project_id,title,description,status,priority,owner_user_id,owner,tester_user_id,tester,workload_days,start_date,test_due_date,design_due_date,due_date,estimate,progress,blockers,blocked_reason,tags,order_index,deleted_at,completed_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
      [
        row.id,
        row.project_id,
        row.title,
        row.description,
        row.status,
        row.priority,
        row.owner_user_id,
        row.owner,
        row.tester_user_id,
        row.tester,
        row.workload_days,
        row.start_date,
        row.test_due_date,
        row.design_due_date,
        row.due_date,
        row.estimate,
        row.progress,
        row.blockers,
        row.blocked_reason,
        row.tags,
        row.order_index,
        row.deleted_at,
        row.completed_at,
        row.created_at,
        row.updated_at,
      ]
    );
    await this.recordActivity(boardId, {
      entityType: "task",
      entityId: row.id,
      projectId,
      taskId: row.id,
      action: "task.create",
      message: `创建任务「${row.title}」。`,
      meta: { status: row.status },
    });
    await this.recordAuditLog({
      actor,
      action: "task.create",
      resourceType: "task",
      resourceId: row.id,
      boardId,
      message: `创建任务 ${row.title}`,
      metadata: { projectId, status: row.status, ownerUserId: row.owner_user_id, testerUserId: row.tester_user_id },
    });
    return task(row, []);
  }

  async createReworkTask(actor: CurrentUser, boardId: string, id: string) {
    await this.requireBoardWrite(actor, boardId);
    const old = await this.getTaskRow(boardId, id);
    if (!old || old.deleted_at) throw new Error("Task not found");
    const current = task(old, (await this.getSubtasks(id)).map(subtask));
    if (current.status !== "done") throw new Error("Only completed tasks can be reworked");
    const now = iso();
    const newTaskId = crypto.randomUUID();
    const nextTitle = current.title.endsWith("（返工）") ? current.title : `${current.title}（返工）`;
    const nextTags = Array.from(new Set([...current.tags, "返工"]));
    await this.x(
      "INSERT INTO tasks (id,project_id,title,description,status,priority,owner_user_id,owner,tester_user_id,tester,workload_days,start_date,test_due_date,design_due_date,due_date,estimate,progress,blockers,blocked_reason,tags,order_index,deleted_at,completed_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
      [
        newTaskId,
        current.projectId,
        nextTitle,
        current.description,
        "backlog",
        current.priority,
        current.ownerUserId,
        current.owner,
        current.testerUserId,
        current.tester,
        current.workloadDays,
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
      ]
    );
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
      meta: { sourceTaskId: current.id, sourceStatus: current.status, afterStatus: "backlog" },
    });
    await this.recordAuditLog({
      actor,
      action: "task.rework",
      resourceType: "task",
      resourceId: newTaskId,
      boardId,
      message: `发起返工任务 ${nextTitle}`,
      metadata: { sourceTaskId: current.id },
    });
    return task(await this.getTaskRow(boardId, newTaskId), (await this.getSubtasks(newTaskId)).map(subtask));
  }

  async updateTask(actor: CurrentUser, boardId: string, id: string, input: UpdateTaskInput) {
    await this.requireBoardRead(actor, boardId);
    const old = await this.getTaskRow(boardId, id);
    if (!old || old.deleted_at) throw new Error("Task not found");
    const current = task(old, (await this.getSubtasks(id)).map(subtask));
    if (!canManageBoardTasks(actor) && !isTaskRelatedToUser(current, actor.id)) throw new Error("Forbidden");
    const status = input.status === undefined ? current.status : normalizeBoardStatus(input.status);
    const projectId = text(input.projectId, current.projectId);
    const projectRow = await this.getProjectRow(boardId, projectId);
    if (!projectRow) throw new Error("Project not found");
    const currentProjectRow = await this.getProjectRow(boardId, current.projectId);
    const assignees = await this.resolveTaskAssignees(project(projectRow), input, current);
    if (actor.role === "team_member" && assignees.ownerUserId !== actor.id && assignees.testerUserId !== actor.id) {
      throw new Error("Forbidden");
    }
    const nextTags = JSON.stringify(tags(input.tags, current.tags));
    const completed = status === "done" ? (current.status === "done" ? current.completedAt : iso()) : null;
    const order = status !== current.status ? await this.nextTaskOrderIndex(status, projectId) : current.orderIndex;
    const nextProgress = status === "done" ? 100 : num(input.progress, current.progress, 0, 100);
    const nextBlockers = status === "done" ? 0 : num(input.blockers, current.blockers, 0, 99);
    const nextBlockedReason = status === "done" ? "" : opt(input.blockedReason, current.blockedReason);
    await this.x(
      "UPDATE tasks SET title=?,description=?,project_id=?,status=?,priority=?,owner_user_id=?,owner=?,tester_user_id=?,tester=?,workload_days=?,start_date=?,test_due_date=?,design_due_date=?,due_date=?,estimate=?,progress=?,blockers=?,blocked_reason=?,tags=?,order_index=?,completed_at=?,updated_at=? WHERE id=?",
      [
        text(input.title, current.title),
        opt(input.description, current.description),
        projectId,
        status,
        isPriority(input.priority) ? input.priority : current.priority,
        assignees.ownerUserId,
        assignees.ownerName,
        assignees.testerUserId,
        assignees.testerName,
        input.workloadDays === undefined ? current.workloadDays : workloadDays(input.workloadDays),
        opt(input.startDate, current.startDate),
        opt(input.testDueDate, current.testDueDate),
        opt(input.designDueDate, current.designDueDate),
        opt(input.dueDate, current.dueDate),
        num(input.estimate, current.estimate, 1, 99),
        nextProgress,
        nextBlockers,
        nextBlockedReason,
        nextTags,
        order,
        completed,
        iso(),
        id,
      ]
    );
    if (status === "done") {
      await this.completeSubtasks(id);
    }
    const changes = compactChanges([
      changeEntry("项目", currentProjectRow ? String(currentProjectRow.name ?? current.projectId) : current.projectId, String(projectRow.name ?? projectId)),
      changeEntry("任务名称", current.title, text(input.title, current.title)),
      changeEntry("任务描述", current.description, opt(input.description, current.description)),
      changeEntry("状态", statusLabel(current.status), statusLabel(status)),
      changeEntry("优先级", priorityLabel(current.priority), priorityLabel(isPriority(input.priority) ? input.priority : current.priority)),
      changeEntry("负责人", current.owner || "空", assignees.ownerName || "空"),
      changeEntry("测试员", current.tester || "空", assignees.testerName || "空"),
      changeEntry("设计截止", current.designDueDate || "空", opt(input.designDueDate, current.designDueDate) || "空"),
      changeEntry("提测日期", current.testDueDate || "空", opt(input.testDueDate, current.testDueDate) || "空"),
      changeEntry("交付日期", current.dueDate || "空", opt(input.dueDate, current.dueDate) || "空"),
      changeEntry("工作量", formatWorkload(current.workloadDays), formatWorkload(input.workloadDays === undefined ? current.workloadDays : workloadDays(input.workloadDays))),
      changeEntry("进度", `${current.progress}%`, `${nextProgress}%`),
      changeEntry("阻塞", String(current.blockers), String(nextBlockers)),
      changeEntry("阻塞说明", current.blockedReason, nextBlockedReason),
      changeEntry("标签", current.tags.join(" / ") || "空", tags(input.tags, current.tags).join(" / ") || "空"),
    ]);
    await this.recordActivity(boardId, {
      entityType: "task",
      entityId: id,
      projectId,
      taskId: id,
      action: status !== current.status ? "task.status" : "task.update",
      message:
        changes.length > 0
          ? `更新任务「${text(input.title, current.title)}」：${summarizeChanges(changes)}。`
          : `更新任务「${text(input.title, current.title)}」。`,
      meta: {
        beforeStatus: current.status,
        afterStatus: status,
        changes,
      },
    });
    await this.recordAuditLog({
      actor,
      action: status !== current.status ? "task.status" : "task.update",
      resourceType: "task",
      resourceId: id,
      boardId,
      message: `更新任务 ${text(input.title, current.title)}`,
      metadata: { beforeStatus: current.status, afterStatus: status, changes },
    });
    return task(await this.getTaskRow(boardId, id), (await this.getSubtasks(id)).map(subtask));
  }

  async deleteTask(actor: CurrentUser, boardId: string, id: string) {
    await this.requireBoardRead(actor, boardId);
    const old = await this.getTaskRow(boardId, id);
    if (!old || old.deleted_at) throw new Error("Task not found");
    const current = task(old, (await this.getSubtasks(id)).map(subtask));
    if (!canManageBoardTasks(actor) && !isTaskRelatedToUser(current, actor.id)) throw new Error("Forbidden");
    await this.x("UPDATE tasks SET deleted_at=?,updated_at=? WHERE id=?", [iso(), iso(), id]);
    await this.recordActivity(boardId, {
      entityType: "task",
      entityId: id,
      projectId: old.project_id,
      taskId: id,
      action: "task.delete",
      message: `删除任务「${old.title}」。`,
    });
    await this.recordAuditLog({
      actor,
      action: "task.delete",
      resourceType: "task",
      resourceId: id,
      boardId,
      message: `删除任务 ${String(old.title)}`,
      metadata: { projectId: old.project_id },
    });
    return { id };
  }

  async reorderTasks(actor: CurrentUser, boardId: string, input: ReorderTaskInput) {
    await this.requireBoardRead(actor, boardId);
    const items = Array.isArray(input.updates) ? input.updates.map(reorderItem).filter(isReorderItem) : [];
    if (!items.length) return { ok: true as const };
    const rows = await this.getTaskRowsByIds(boardId, items.map((item) => item.id));
    const byId = new Map(rows.map((row) => [String(row.id), row]));
    for (const item of items) {
      const old = byId.get(item.id);
      if (!old) continue;
      const oldStatus = normalizeBoardStatus(old?.status);
      const completed = item.status === "done" ? (oldStatus === "done" ? String(old?.completed_at ?? iso()) : iso()) : null;
      const nextProgress = item.status === "done" ? 100 : num(old.progress, 0, 0, 100);
      const nextBlockers = item.status === "done" ? 0 : num(old.blockers, 0, 0, 99);
      const nextBlockedReason = item.status === "done" ? "" : String(old.blocked_reason ?? "");
      await this.x("UPDATE tasks SET status=?,order_index=?,progress=?,blockers=?,blocked_reason=?,completed_at=?,updated_at=? WHERE id=?", [
        item.status,
        item.orderIndex,
        nextProgress,
        nextBlockers,
        nextBlockedReason,
        completed,
        iso(),
        item.id,
      ]);
      if (item.status === "done") {
        await this.completeSubtasks(item.id);
      }
      if (old && oldStatus !== item.status) {
        await this.recordActivity(boardId, {
          entityType: "task",
          entityId: item.id,
          projectId: old.project_id as string,
          taskId: item.id,
          action: "task.status",
          message: `移动任务「${old.title as string}」：${statusLabel(oldStatus)} -> ${statusLabel(item.status)}。`,
          meta: { beforeStatus: oldStatus, afterStatus: item.status },
        });
        await this.recordAuditLog({
          actor,
          action: "task.status",
          resourceType: "task",
          resourceId: item.id,
          boardId,
          message: `移动任务 ${String(old.title)}`,
          metadata: { beforeStatus: oldStatus, afterStatus: item.status },
        });
      }
    }
    return { ok: true as const };
  }

  async createSubtask(actor: CurrentUser, boardId: string, taskId: string, input: CreateSubtaskInput) {
    await this.requireBoardRead(actor, boardId);
    const taskRow = await this.getTaskRow(boardId, taskId);
    if (!taskRow || taskRow.deleted_at) throw new Error("Task not found");
    const current = task(taskRow, []);
    if (!canManageBoardTasks(actor) && !isTaskRelatedToUser(current, actor.id)) throw new Error("Forbidden");
    const now = iso();
    const row = {
      id: crypto.randomUUID(),
      task_id: taskId,
      title: text(input.title, "新拆解项"),
      done: 0,
      order_index: await this.nextSubtaskOrderIndex(taskId),
      created_at: now,
      updated_at: now,
    };
    await this.x("INSERT INTO subtasks (id,task_id,title,done,order_index,created_at,updated_at) VALUES (?,?,?,?,?,?,?)", [
      row.id,
      row.task_id,
      row.title,
      row.done,
      row.order_index,
      row.created_at,
      row.updated_at,
    ]);
    await this.recalculateTaskProgress(taskId);
    await this.recordActivity(boardId, {
      entityType: "subtask",
      entityId: row.id,
      projectId: taskRow.project_id,
      taskId,
      action: "subtask.create",
      message: `为「${taskRow.title}」添加任务拆解「${row.title}」。`,
    });
    await this.recordAuditLog({
      actor,
      action: "subtask.create",
      resourceType: "subtask",
      resourceId: row.id,
      boardId,
      message: `创建任务拆解 ${row.title}`,
      metadata: { taskId },
    });
    return subtask(row);
  }

  async updateSubtask(actor: CurrentUser, boardId: string, taskId: string, subtaskId: string, input: UpdateSubtaskInput) {
    await this.requireBoardRead(actor, boardId);
    const taskRow = await this.getTaskRow(boardId, taskId);
    const old = await this.getSubtask(taskId, subtaskId);
    if (!taskRow || taskRow.deleted_at || !old) throw new Error("Subtask not found");
    const current = task(taskRow, []);
    if (!canManageBoardTasks(actor) && !isTaskRelatedToUser(current, actor.id)) throw new Error("Forbidden");
    const oldTitle = String(old.title ?? "");
    const done = typeof input.done === "boolean" ? (input.done ? 1 : 0) : old.done;
    await this.x("UPDATE subtasks SET title=?,done=?,updated_at=? WHERE id=? AND task_id=?", [
      text(input.title, oldTitle),
      done as SqlValue,
      iso(),
      subtaskId,
      taskId,
    ]);
    await this.recalculateTaskProgress(taskId);
    const changes = compactChanges([
      changeEntry("拆解标题", oldTitle, text(input.title, oldTitle)),
      changeEntry("完成状态", old.done ? "已完成" : "未完成", done ? "已完成" : "未完成"),
    ]);
    await this.recordActivity(boardId, {
      entityType: "subtask",
      entityId: subtaskId,
      projectId: taskRow.project_id,
      taskId,
      action: done !== old.done ? "subtask.toggle" : "subtask.update",
      message: changes.length ? `更新任务拆解「${text(input.title, oldTitle)}」：${summarizeChanges(changes)}。` : `更新任务拆解「${text(input.title, oldTitle)}」。`,
      meta: { done: Boolean(done), changes },
    });
    await this.recordAuditLog({
      actor,
      action: done !== old.done ? "subtask.toggle" : "subtask.update",
      resourceType: "subtask",
      resourceId: subtaskId,
      boardId,
      message: `更新任务拆解 ${text(input.title, oldTitle)}`,
      metadata: { taskId, done: Boolean(done), changes },
    });
    return subtask(await this.getSubtask(taskId, subtaskId));
  }

  async deleteSubtask(actor: CurrentUser, boardId: string, taskId: string, subtaskId: string) {
    await this.requireBoardRead(actor, boardId);
    const taskRow = await this.getTaskRow(boardId, taskId);
    const old = await this.getSubtask(taskId, subtaskId);
    if (!taskRow || taskRow.deleted_at || !old) throw new Error("Subtask not found");
    const current = task(taskRow, []);
    if (!canManageBoardTasks(actor) && !isTaskRelatedToUser(current, actor.id)) throw new Error("Forbidden");
    await this.x("DELETE FROM subtasks WHERE id=? AND task_id=?", [subtaskId, taskId]);
    await this.recalculateTaskProgress(taskId);
    await this.recordActivity(boardId, {
      entityType: "subtask",
      entityId: subtaskId,
      projectId: taskRow.project_id,
      taskId,
      action: "subtask.delete",
      message: `删除任务拆解「${old.title}」。`,
    });
    await this.recordAuditLog({
      actor,
      action: "subtask.delete",
      resourceType: "subtask",
      resourceId: subtaskId,
      boardId,
      message: `删除任务拆解 ${String(old.title)}`,
      metadata: { taskId },
    });
    return { id: subtaskId };
  }

  async getWorkloadDashboard(actor: CurrentUser, input: WorkloadDashboardInput = {}) {
    this.requireDashboardAccess(actor);
    const requestedTeamIds = uniqIds([input.teamId, input.teamIds]);
    const requestedProjectIds = uniqIds([input.projectId, input.projectIds]);
    const settings = settingsFromRows(await this.q("SELECT * FROM system_parameters ORDER BY order_index ASC,key ASC"));
    const dueSoonDays = settings.dueSoonDays;
    const testerDefaultWorkloadDays = settings.testerDefaultWorkloadDays;
    const todayKey = todayKeyInTimeZone(actor.timezone);
    const allowedTeams = await this.listTeamsForDashboard(actor);
    const allowedTeamIds = new Set(allowedTeams.map((teamItem) => teamItem.id));
    const selectedTeamIds = requestedTeamIds.length
      ? requestedTeamIds.filter((teamId) => allowedTeamIds.has(teamId))
      : [...allowedTeamIds];
    const projectRows = await this.listDashboardProjectRows(actor, selectedTeamIds);
    const effectiveProjectRows = requestedProjectIds.length
      ? projectRows.filter((row) => requestedProjectIds.includes(String(row.id)))
      : projectRows;
    const effectiveTeamIds = effectiveProjectRows.length
      ? Array.from(new Set(effectiveProjectRows.map((row) => String(row.team_id))))
      : selectedTeamIds;
    const members = await this.dashboardMembers(effectiveTeamIds);
    const taskRows = await this.dashboardTasks(effectiveProjectRows.map((row) => String(row.id)));
    const projectStatusCounts = new Map<
      string,
      Record<BoardStatus, number>
    >();
    for (const row of effectiveProjectRows) {
      projectStatusCounts.set(String(row.id), {
        backlog: 0,
        design: 0,
        dev: 0,
        test: 0,
        done: 0,
      });
    }
    const memberById = new Map(members.map((member) => [member.id, member]));
    const tasksByMember = new Map<string, Array<Record<string, unknown> & { __assigneeKind: "owner" | "tester"; __effectiveWorkloadDays: number }>>();
    const projectTaskMap = new Map<string, Record<string, unknown>[]>();
    const projectWarningCounts = new Map<string, { dueSoon: number; overdue: number; blocked: number }>();
    let dueSoonCount = 0;
    let overdueCount = 0;
    let blockedCount = 0;
    for (const row of taskRows) {
      const projectId = String(row.project_id ?? "");
      const status = normalizeBoardStatus(row.status);
      const counts = projectStatusCounts.get(projectId);
      if (counts) {
        counts[status] += 1;
      }

      const projectTasks = projectTaskMap.get(projectId) ?? [];
      projectTasks.push(row);
      projectTaskMap.set(projectId, projectTasks);

      const normalizedTask = task(row, []);
      const warnings = taskWarningFlags(normalizedTask, todayKey, dueSoonDays);
      const warningCounts = projectWarningCounts.get(projectId) ?? { dueSoon: 0, overdue: 0, blocked: 0 };
      if (warnings.dueSoon) {
        dueSoonCount += 1;
        warningCounts.dueSoon += 1;
      }
      if (warnings.overdue) {
        overdueCount += 1;
        warningCounts.overdue += 1;
      }
      if (warnings.blocked) {
        blockedCount += 1;
        warningCounts.blocked += 1;
      }
      projectWarningCounts.set(projectId, warningCounts);

      const ownerMember = memberById.get(normalizedTask.ownerUserId);
      if (normalizedTask.ownerUserId && ownerMember?.jobTitle !== "tester") {
        const memberTasks = tasksByMember.get(normalizedTask.ownerUserId) ?? [];
        memberTasks.push({
          ...row,
          __assigneeKind: "owner",
          __effectiveWorkloadDays: effectiveWorkloadDays(normalizedTask),
        });
        tasksByMember.set(normalizedTask.ownerUserId, memberTasks);
      }

      const testerMember = memberById.get(normalizedTask.testerUserId);
      if ((normalizedTask.status === "test" || normalizedTask.status === "done") && testerMember?.jobTitle === "tester") {
        const memberTasks = tasksByMember.get(normalizedTask.testerUserId) ?? [];
        memberTasks.push({
          ...row,
          __assigneeKind: "tester",
          __effectiveWorkloadDays: normalizedTask.status === "test" ? testerDefaultWorkloadDays : 0,
        });
        tasksByMember.set(normalizedTask.testerUserId, memberTasks);
      }
    }
    const projectNames = new Map(effectiveProjectRows.map((row) => [String(row.id), String(row.name)]));
    const projectTeamNames = new Map(allowedTeams.map((teamItem) => [teamItem.id, teamItem.name]));
    const rows = members.map((member) => {
      const taskList = tasksByMember.get(member.id) ?? [];
      const totalWorkload = taskList.reduce((total, row) => total + row.__effectiveWorkloadDays, 0);
      const averageProgress = dashboardAverageProgressForMember(member.jobTitle, taskList);
      const normalizedTasks = taskList.map((row) => {
        const normalizedTask = task(row, []);
        const warnings = taskWarningFlags(normalizedTask, todayKey, dueSoonDays);
        return {
          id: normalizedTask.id,
          title: normalizedTask.title,
          description: normalizedTask.description,
          projectId: normalizedTask.projectId,
          projectName: projectNames.get(normalizedTask.projectId) ?? "",
          status: normalizedTask.status,
          progress: dashboardProgressForMember(member.jobTitle, normalizedTask),
          workloadDays: normalizedTask.workloadDays,
          effectiveWorkloadDays: row.__effectiveWorkloadDays,
          owner: normalizedTask.owner,
          tester: normalizedTask.tester,
          priority: normalizedTask.priority,
          designDueDate: normalizedTask.designDueDate,
          testDueDate: normalizedTask.testDueDate,
          dueDate: normalizedTask.dueDate,
          blockedReason: normalizedTask.blockedReason,
          tags: normalizedTask.tags,
          completedAt: normalizedTask.completedAt,
          dueSoon: warnings.dueSoon,
          overdue: warnings.overdue,
          blocked: warnings.blocked,
          assigneeKind: row.__assigneeKind,
        };
      });
      return {
        ...member,
        taskCount: taskList.length,
        workloadDays: roundWorkload(totalWorkload),
        progress: averageProgress,
        dueSoonCount: normalizedTasks.filter((item) => item.dueSoon).length,
        overdueCount: normalizedTasks.filter((item) => item.overdue).length,
        blockedCount: normalizedTasks.filter((item) => item.blocked).length,
        tasks: normalizedTasks,
      };
    });
    return {
      permissions: await this.adminPermissions(actor),
      filters: {
        teamIds: selectedTeamIds,
        projectIds: requestedProjectIds.length ? effectiveProjectRows.map((row) => String(row.id)) : [],
      },
      teamIds: selectedTeamIds,
      projectIds: effectiveProjectRows.map((row) => String(row.id)),
      teams: allowedTeams,
      projects: projectRows.map((row) => ({
        id: String(row.id),
        name: String(row.name),
        teamId: String(row.team_id ?? ""),
        teamName: projectTeamNames.get(String(row.team_id ?? "")) ?? "",
        boardId: String(row.board_id ?? ""),
        description: String(row.description ?? ""),
        taskCount:
          Object.values(
            projectStatusCounts.get(String(row.id)) ?? {
              backlog: 0,
              design: 0,
              dev: 0,
              test: 0,
              done: 0,
            }
          ).reduce((sum, value) => sum + value, 0),
        workloadDays: roundWorkload(projectDashboardWorkload(projectTaskMap.get(String(row.id)) ?? [], memberById, testerDefaultWorkloadDays)),
        statusCounts:
          projectStatusCounts.get(String(row.id)) ?? {
            backlog: 0,
            design: 0,
            dev: 0,
            test: 0,
            done: 0,
          },
        dueSoonCount: projectWarningCounts.get(String(row.id))?.dueSoon ?? 0,
        overdueCount: projectWarningCounts.get(String(row.id))?.overdue ?? 0,
        blockedCount: projectWarningCounts.get(String(row.id))?.blocked ?? 0,
        tasks: (projectTaskMap.get(String(row.id)) ?? []).map((taskRow) => {
          const normalizedTask = task(taskRow, []);
          const warnings = taskWarningFlags(normalizedTask, todayKey, dueSoonDays);
          const taskTester = memberById.get(normalizedTask.testerUserId);
          const taskOwner = memberById.get(normalizedTask.ownerUserId);
          const assigneeKind = normalizedTask.status === "test" && taskTester?.jobTitle === "tester" ? "tester" : "owner";
          return {
            id: normalizedTask.id,
            title: normalizedTask.title,
            description: normalizedTask.description,
            projectId: normalizedTask.projectId,
            projectName: String(row.name),
            status: normalizedTask.status,
            progress: normalizedTask.progress,
            workloadDays: normalizedTask.workloadDays,
            effectiveWorkloadDays:
              assigneeKind === "tester"
                ? testerDefaultWorkloadDays
                : taskOwner?.jobTitle === "tester"
                  ? 0
                  : effectiveWorkloadDays(normalizedTask),
            owner: normalizedTask.owner,
            tester: normalizedTask.tester,
            priority: normalizedTask.priority,
            designDueDate: normalizedTask.designDueDate,
            testDueDate: normalizedTask.testDueDate,
            dueDate: normalizedTask.dueDate,
            blockedReason: normalizedTask.blockedReason,
            tags: normalizedTask.tags,
            completedAt: normalizedTask.completedAt,
            dueSoon: warnings.dueSoon,
            overdue: warnings.overdue,
            blocked: warnings.blocked,
            assigneeKind,
          };
        }),
      })),
      totals: {
        teams: allowedTeams.length,
        projects: projectRows.length,
        members: rows.length,
        tasks: taskRows.length,
        workloadDays: roundWorkload(rows.reduce((sum, row) => sum + row.workloadDays, 0)),
        progress: rows.some((row) => row.workloadDays > 0)
          ? Math.round(
              rows.reduce((sum, row) => sum + row.workloadDays * row.progress, 0) /
                Math.max(rows.reduce((sum, row) => sum + row.workloadDays, 0), 1)
            )
          : 0,
        dueSoon: dueSoonCount,
        overdue: overdueCount,
        blocked: blockedCount,
      },
      members: rows.sort((left, right) => right.workloadDays - left.workloadDays || right.taskCount - left.taskCount || left.displayName.localeCompare(right.displayName)),
      dueSoonDays,
      todayKey,
    };
  }

  async getPublicWorkloadDashboard(input: WorkloadDashboardInput = {}) {
    if (!(await this.workloadDashboardPublicEnabled())) {
      throw new Error("Unauthorized");
    }

    const data = await this.getWorkloadDashboard(
      {
        id: "public-dashboard",
        username: "public",
        role: "super_admin",
        timezone: DEFAULT_TIMEZONE,
        displayName: "公共视图",
        phone: "",
        avatarKey: "",
        jobTitle: "",
        techStacks: [],
      },
      input
    );

    return {
      ...data,
      permissions: {
        canManageUsers: false,
        canCreateSuperAdmin: false,
        canManageAllBoards: false,
      },
      publicView: true,
    };
  }

  async ensureSuperAdmin() {
    if (Number((await this.q("SELECT COUNT(*) AS count FROM users"))[0]?.count) > 0) return;
    const now = iso();
    const username = process.env.KANBAN_SUPER_ADMIN_USERNAME ?? "admin";
    await this.x(
      "INSERT INTO users (id,username,password_hash,role,display_name,avatar_key,timezone,is_active,created_at,updated_at) VALUES (?,?,?,'super_admin','','',?,1,?,?)",
      [
        "super-admin",
        username,
        await hashPassword(process.env.KANBAN_SUPER_ADMIN_PASSWORD ?? "admin@123"),
        normalizeTimeZone(process.env.KANBAN_DEFAULT_TIMEZONE),
        now,
        now,
      ]
    );
  }

  async ensureRoleCompatibility() {
    await this.x("UPDATE users SET role='team_member' WHERE role='user'");
  }

  async ensureDefaultBoardForLegacyData() {
    const admin = (await this.q("SELECT * FROM users WHERE role='super_admin' ORDER BY created_at ASC LIMIT 1"))[0];
    if (!admin) return;
    const adminId = String(admin.id);
    const now = iso();
    const firstBoard = await this.firstBoardRow();
    const boardId = firstBoard ? String(firstBoard.id) : DEFAULT_BOARD_ID;
    if (!firstBoard) {
      await this.x("INSERT INTO boards (id,name,description,owner_user_id,created_at,updated_at) VALUES (?,?,?,?,?,?)", [
        DEFAULT_BOARD_ID,
        await this.defaultBoardTitle(),
        "系统初始化生成的默认看板",
        adminId,
        now,
        now,
      ]);
    }
    await this.x(
      "INSERT INTO board_members (board_id,user_id,role,created_at) VALUES (?,?,'owner',?) ON CONFLICT(board_id,user_id) DO UPDATE SET role='owner'",
      [boardId, adminId, now]
    );
    await this.x("UPDATE projects SET board_id=? WHERE board_id='' OR board_id IS NULL", [boardId]);
    await this.x("UPDATE task_activity SET board_id=? WHERE board_id='' OR board_id IS NULL", [boardId]);
  }

  async ensureSystemParameters() {
    const now = iso();
    for (const parameter of defaultSystemParameters) {
      if ((await this.q("SELECT key FROM system_parameters WHERE key=?", [parameter.key]))[0]) {
        await this.x(
          "UPDATE system_parameters SET label=?,value_type=?,parameter_group=?,unit=?,min_value=?,max_value=?,order_index=? WHERE key=?",
          [
            parameter.label,
            parameter.valueType,
            parameter.group,
            parameter.unit,
            parameter.minValue,
            parameter.maxValue,
            parameter.orderIndex,
            parameter.key,
          ]
        );
      } else {
        await this.x(
          "INSERT INTO system_parameters (key,value,label,value_type,parameter_group,unit,min_value,max_value,order_index,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
          [
            parameter.key,
            parameter.value,
            parameter.label,
            parameter.valueType,
            parameter.group,
            parameter.unit,
            parameter.minValue,
            parameter.maxValue,
            parameter.orderIndex,
            now,
          ]
        );
      }
    }
  }

  async ensureBoardDefaults(boardId: string, ownerName: string) {
    if (Number((await this.q("SELECT COUNT(*) AS count FROM projects WHERE board_id=?", [boardId]))[0]?.count) > 0) return;
    const firstTeam = (await this.q("SELECT team_id FROM board_teams WHERE board_id=? ORDER BY created_at ASC LIMIT 1", [boardId]))[0];
    const teamId = typeof firstTeam?.team_id === "string" ? firstTeam.team_id : "";
    if (!teamId) return;
    const now = iso();
    await this.x(
      "INSERT INTO projects (id,board_id,team_id,name,description,owner,color,health,status,summary,archived_at,order_index,created_at,updated_at) VALUES (?,?,?,'默认项目','用于承载本看板的默认任务集合。',?,'#1f6f68','normal','active','',NULL,10,?,?)",
      [crypto.randomUUID(), boardId, teamId, ownerName || "未分配", now, now]
    );
  }

  async getBoardSummaryById(actor: CurrentUser, boardId: string) {
    const boards = await this.listBoardsForUser(actor);
    return boards.find((item) => item.id === boardId) ?? null;
  }

  async requireBoardRead(actor: CurrentUser, boardId: string) {
    if (actor.role === "super_admin") return;
    const row = (
      await this.q(
        "SELECT b.id FROM boards b LEFT JOIN board_members bm ON bm.board_id=b.id AND bm.user_id=? LEFT JOIN board_teams bt ON bt.board_id=b.id LEFT JOIN team_members tm ON tm.team_id=bt.team_id AND tm.user_id=? WHERE b.id=? AND (b.owner_user_id=? OR bm.user_id=? OR tm.user_id=?) LIMIT 1",
        [actor.id, actor.id, boardId, actor.id, actor.id, actor.id]
      )
    )[0];
    if (!row) throw new Error("Forbidden");
  }

  async requireBoardWrite(actor: CurrentUser, boardId: string) {
    if (actor.role === "super_admin") return;
    if (!isManagementRole(actor)) throw new Error("Forbidden");
    if (!(await this.q("SELECT id FROM boards WHERE id=? AND owner_user_id=? LIMIT 1", [boardId, actor.id]))[0]) {
      await this.requireBoardRead(actor, boardId);
    }
  }

  async requireBoardAdmin(actor: CurrentUser, boardId: string) {
    if (actor.role === "super_admin") return;
    if (!isManagementRole(actor)) throw new Error("Forbidden");
    if (!(await this.q("SELECT id FROM boards WHERE id=? AND owner_user_id=? LIMIT 1", [boardId, actor.id]))[0]) {
      throw new Error("Forbidden");
    }
  }

  requireAdminAccess(actor: CurrentUser) {
    if (!isManagementRole(actor)) throw new Error("Forbidden");
  }

  requireDashboardAccess(actor: CurrentUser) {
    if (actor.role !== "super_admin" && actor.role !== "project_manager" && actor.role !== "development_manager" && actor.role !== "team_member") {
      throw new Error("Forbidden");
    }
  }

  async requireUserManagement(actor: CurrentUser) {
    const permissions = await this.adminPermissions(actor);
    if (!permissions.canManageUsers) throw new Error("Forbidden");
  }

  async requireTeamWrite(actor: CurrentUser, teamId: string) {
    this.requireAdminAccess(actor);
    if (actor.role === "super_admin") return;
    if (!(await this.q("SELECT id FROM teams WHERE id=? AND owner_user_id=? LIMIT 1", [teamId, actor.id]))[0]) {
      throw new Error("Forbidden");
    }
  }

  async requireBoardTeam(boardId: string, teamId: string) {
    if (!(await this.q("SELECT team_id FROM board_teams WHERE board_id=? AND team_id=? LIMIT 1", [boardId, teamId]))[0]) {
      throw new Error("Team is required");
    }
  }

  async getManagedUserRow(userId: string) {
    return (await this.q("SELECT * FROM users WHERE id=? LIMIT 1", [userId]))[0] ?? null;
  }

  async getTeamRow(teamId: string) {
    return (
      await this.q("SELECT t.*,u.username AS owner_username FROM teams t LEFT JOIN users u ON u.id=t.owner_user_id WHERE t.id=? LIMIT 1", [teamId])
    )[0] ?? null;
  }

  async boardTeamIds(boardIds: string[]) {
    const result = new Map<string, string[]>();
    if (!boardIds.length) return result;
    const rows = await this.q(`SELECT board_id,team_id FROM board_teams WHERE board_id IN (${boardIds.map(() => "?").join(",")})`, boardIds);
    for (const row of rows) {
      const boardId = String(row.board_id);
      const list = result.get(boardId) ?? [];
      list.push(String(row.team_id));
      result.set(boardId, list);
    }
    return result;
  }

  async teamMemberIds(teamIds: string[]) {
    const result = new Map<string, string[]>();
    if (!teamIds.length) return result;
    const rows = await this.q(`SELECT team_id,user_id FROM team_members WHERE team_id IN (${teamIds.map(() => "?").join(",")})`, teamIds);
    for (const row of rows) {
      const teamId = String(row.team_id);
      const list = result.get(teamId) ?? [];
      list.push(String(row.user_id));
      result.set(teamId, list);
    }
    return result;
  }

  async setBoardTeams(actor: CurrentUser, boardId: string, teamIds: string[]) {
    const allowed = await this.allowedTeamIds(actor);
    for (const teamId of teamIds) {
      if (!allowed.has(teamId)) throw new Error("Forbidden");
    }
    await this.x("DELETE FROM board_teams WHERE board_id=?", [boardId]);
    const now = iso();
    for (const teamId of teamIds) {
      await this.x("INSERT INTO board_teams (board_id,team_id,created_at) VALUES (?,?,?) ON CONFLICT(board_id,team_id) DO NOTHING", [
        boardId,
        teamId,
        now,
      ]);
    }
  }

  async replaceTeamMembers(teamId: string, memberIds: string[]) {
    const allowed = new Set((await this.listAssignableUsers()).map((member) => member.id));
    const safeIds = memberIds.filter((memberId, index, array) => allowed.has(memberId) && array.indexOf(memberId) === index);
    await this.x("DELETE FROM team_members WHERE team_id=?", [teamId]);
    const now = iso();
    for (const memberId of safeIds) {
      await this.x("INSERT INTO team_members (team_id,user_id,created_at) VALUES (?,?,?) ON CONFLICT(team_id,user_id) DO NOTHING", [
        teamId,
        memberId,
        now,
      ]);
    }
  }

  async allowedTeamIds(actor: CurrentUser) {
    const rows =
      actor.role === "super_admin"
        ? await this.q("SELECT id FROM teams")
        : await this.q("SELECT id FROM teams WHERE owner_user_id=?", [actor.id]);
    return new Set(rows.map((row) => String(row.id)));
  }

  async listBoardTeamOptions(boardId: string): Promise<BoardTeamOption[]> {
    const rows = await this.q(
      "SELECT t.*,u.username AS owner_username FROM board_teams bt JOIN teams t ON t.id=bt.team_id LEFT JOIN users u ON u.id=t.owner_user_id WHERE bt.board_id=? ORDER BY t.name ASC",
      [boardId]
    );
    const options: BoardTeamOption[] = [];
    for (const row of rows) {
      const members = (await this.q(
        "SELECT u.* FROM team_members tm JOIN users u ON u.id=tm.user_id WHERE tm.team_id=? AND u.is_active=1 ORDER BY u.role ASC,u.username ASC",
        [String(row.id)]
      )).map(boardUser);
      options.push({
        id: String(row.id),
        name: String(row.name),
        description: String(row.description ?? ""),
        ownerUserId: String(row.owner_user_id),
        ownerUsername: String(row.owner_username ?? ""),
        color: String(row.color ?? "#0f766e"),
        memberIds: members.map((member) => member.id),
        members,
      });
    }
    return options;
  }

  async resolveTaskAssignees(projectValue: ReturnType<typeof project>, input: CreateTaskInput | UpdateTaskInput, current?: ReturnType<typeof task>) {
    if (!projectValue.teamId) throw new Error("Team is required");
    const teamMembers = await this.q(
      "SELECT u.* FROM team_members tm JOIN users u ON u.id=tm.user_id WHERE tm.team_id=? AND u.is_active=1 ORDER BY u.username ASC",
      [projectValue.teamId]
    );
    const byId = new Map(teamMembers.map((row) => [String(row.id), row]));
    const ownerUserId = text(input.ownerUserId, current?.ownerUserId ?? "");
    if (!ownerUserId || !byId.has(ownerUserId)) throw new Error("Owner is required");
    const testerUserId = text(input.testerUserId, current?.testerUserId ?? "");
    if (testerUserId && !byId.has(testerUserId)) throw new Error("Tester not found");
    const ownerRow = byId.get(ownerUserId)!;
    const testerRow = testerUserId ? byId.get(testerUserId) : null;
    return {
      ownerUserId,
      ownerName: displayName(ownerRow),
      testerUserId,
      testerName: testerRow ? displayName(testerRow) : "",
    };
  }

  async listDashboardProjectRows(actor: CurrentUser, teamIds: string[]) {
    if (!teamIds.length) return [];
    const placeholders = teamIds.map(() => "?").join(",");
    const sql =
      actor.role === "super_admin"
        ? `SELECT * FROM projects WHERE status='active' AND team_id IN (${placeholders}) ORDER BY name ASC`
        : isManagementRole(actor)
          ? `SELECT DISTINCT p.* FROM projects p WHERE p.status='active' AND p.team_id IN (${placeholders}) ORDER BY p.name ASC`
          : `SELECT DISTINCT p.* FROM projects p JOIN team_members tm ON tm.team_id=p.team_id WHERE p.status='active' AND p.team_id IN (${placeholders}) AND tm.user_id=? ORDER BY p.name ASC`;
    return this.q(sql, actor.role === "super_admin" || isManagementRole(actor) ? teamIds : [...teamIds, actor.id]);
  }

  async dashboardMembers(teamIds: string[]) {
    if (!teamIds.length) return [];
    const rows = await this.q(
      `SELECT DISTINCT u.* FROM users u JOIN team_members tm ON tm.user_id=u.id WHERE tm.team_id IN (${teamIds.map(() => "?").join(",")}) AND u.is_active=1 AND u.role IN ('development_manager','team_member') ORDER BY u.role ASC,u.username ASC`,
      teamIds
    );
    return rows.map(boardUser);
  }

  async dashboardTasks(projectIds: string[]) {
    if (!projectIds.length) return [];
    return this.q(
      `SELECT * FROM tasks WHERE deleted_at IS NULL AND project_id IN (${projectIds.map(() => "?").join(",")}) ORDER BY updated_at DESC`,
      projectIds
    );
  }

  async projectManagerUserManagementEnabled() {
    await this.ensureSystemParameters();
    const row = (await this.q("SELECT value FROM system_parameters WHERE key='project_manager_user_management_enabled' LIMIT 1"))[0];
    return String(row?.value ?? "true") === "true";
  }

  async workloadDashboardPublicEnabled() {
    await this.ensureSystemParameters();
    const row = (await this.q("SELECT value FROM system_parameters WHERE key='workload_dashboard_public_enabled' LIMIT 1"))[0];
    return String(row?.value ?? "false") === "true";
  }

  async firstProjectRow(boardId: string) {
    return (await this.q("SELECT * FROM projects WHERE board_id=? AND status='active' ORDER BY order_index ASC LIMIT 1", [boardId]))[0] ?? null;
  }

  async getProjectRow(boardId: string, id: string) {
    return (await this.q("SELECT * FROM projects WHERE id=? AND board_id=? LIMIT 1", [id, boardId]))[0] ?? null;
  }

  async getTaskRow(boardId: string, id: string) {
    return (
      await this.q("SELECT t.* FROM tasks t JOIN projects p ON p.id=t.project_id WHERE t.id=? AND p.board_id=? LIMIT 1", [id, boardId])
    )[0] ?? null;
  }

  async getTaskRowsByIds(boardId: string, idsList: string[]) {
    return idsList.length
      ? this.q(
          `SELECT t.* FROM tasks t JOIN projects p ON p.id=t.project_id WHERE p.board_id=? AND t.id IN (${idsList.map(() => "?").join(",")})`,
          [boardId, ...idsList]
        )
      : [];
  }

  async firstBoardRow() {
    return (
      await this.q(
        "SELECT b.*,u.username AS owner_username,'admin' AS access_role FROM boards b LEFT JOIN users u ON u.id=b.owner_user_id ORDER BY b.created_at ASC,b.updated_at ASC,b.id ASC LIMIT 1"
      )
    )[0] ?? null;
  }

  async firstBoardSummary(actor: CurrentUser) {
    const row = await this.firstBoardRow();
    if (!row) return null;
    const boardId = String(row.id);
    const teamIds = await this.boardTeamIds([boardId]);
    return board(
      row,
      actor.role === "team_member" ? "viewer" : typeof row.access_role === "string" ? row.access_role : undefined,
      teamIds.get(boardId) ?? []
    );
  }

  async defaultBoardTitle() {
    const row = (await this.q("SELECT value FROM system_parameters WHERE key='board_title' LIMIT 1"))[0];
    const configured = typeof row?.value === "string" ? row.value.trim() : "";
    return configured || defaultSystemParameters.find((parameter) => parameter.key === "board_title")?.value || "默认看板";
  }

  async getSubtasks(taskId: string) {
    return this.q("SELECT * FROM subtasks WHERE task_id=? ORDER BY order_index ASC", [taskId]);
  }

  async completeSubtasks(taskId: string) {
    await this.x("UPDATE subtasks SET done=1,updated_at=? WHERE task_id=?", [iso(), taskId]);
  }

  async getSubtask(taskId: string, subtaskId: string) {
    return (await this.q("SELECT * FROM subtasks WHERE id=? AND task_id=? LIMIT 1", [subtaskId, taskId]))[0] ?? null;
  }

  async nextProjectOrderIndex(boardId: string) {
    return Math.max(0, ...(await this.q("SELECT order_index FROM projects WHERE board_id=?", [boardId])).map((row) => Number(row.order_index))) + 10;
  }

  async nextTaskOrderIndex(status: string, projectId: string) {
    return (
      Math.max(
        0,
        ...(await this.q("SELECT order_index FROM tasks WHERE status=? AND project_id=? AND deleted_at IS NULL", [status, projectId])).map((row) =>
          Number(row.order_index)
        )
      ) + 10
    );
  }

  async nextSubtaskOrderIndex(taskId: string) {
    return Math.max(0, ...(await this.getSubtasks(taskId)).map((row) => Number(row.order_index))) + 10;
  }

  async recalculateTaskProgress(taskId: string) {
    const rows = await this.getSubtasks(taskId);
    if (!rows.length) return null;
    const progress = Math.round((rows.filter((row) => row.done === 1 || row.done === true).length / rows.length) * 100);
    await this.x("UPDATE tasks SET progress=?,updated_at=? WHERE id=?", [progress, iso(), taskId]);
    return progress;
  }

  async cleanupExpiredActivity(boardId: string, settings: SystemSettings) {
    await this.x("DELETE FROM task_activity WHERE board_id=? AND created_at<?", [
      boardId,
      new Date(Date.now() - num(settings.activityRetentionDays, defaultSystemSettings.activityRetentionDays, 1, 3650) * 86400000).toISOString(),
    ]);
  }

  async recordActivity(boardId: string, activity: Record<string, unknown>) {
    await this.x(
      "INSERT INTO task_activity (id,board_id,entity_type,entity_id,project_id,task_id,action,message,meta,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
      [
        crypto.randomUUID(),
        boardId,
        text(activity.entityType, "board"),
        text(activity.entityId),
        typeof activity.projectId === "string" ? activity.projectId : null,
        typeof activity.taskId === "string" ? activity.taskId : null,
        text(activity.action),
        text(activity.message),
        JSON.stringify(activity.meta ?? {}),
        iso(),
      ]
    );
  }

  async recordAuditLog(input: AuditLogInput) {
    const context = currentLogContext();
    const actor = input.actor ?? null;
    const row = {
      id: crypto.randomUUID(),
      actor_user_id: input.actorUserId ?? actor?.id ?? "",
      actor_username: input.actorUsername ?? actor?.username ?? "",
      actor_role: input.actorRole ?? actor?.role ?? "",
      action: input.action,
      resource_type: input.resourceType ?? "system",
      resource_id: input.resourceId ?? "",
      board_id: input.boardId ?? "",
      result: input.result ?? "success",
      message: input.message ?? "",
      ip_address: typeof context.ip === "string" ? context.ip : "",
      user_agent: typeof context.userAgent === "string" ? context.userAgent : "",
      request_id: typeof context.requestId === "string" ? context.requestId : "",
      metadata: JSON.stringify(input.metadata ?? {}),
      created_at: iso(),
    };

    try {
      await this.x(
        "INSERT INTO audit_logs (id,actor_user_id,actor_username,actor_role,action,resource_type,resource_id,board_id,result,message,ip_address,user_agent,request_id,metadata,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        [
          row.id,
          row.actor_user_id,
          row.actor_username,
          row.actor_role,
          row.action,
          row.resource_type,
          row.resource_id,
          row.board_id,
          row.result,
          row.message,
          row.ip_address,
          row.user_agent,
          row.request_id,
          row.metadata,
          row.created_at,
        ]
      );

      repositoryLogger.info("audit event recorded", {
        auditId: row.id,
        actorUserId: row.actor_user_id,
        actorUsername: row.actor_username,
        action: row.action,
        resourceType: row.resource_type,
        resourceId: row.resource_id,
        boardId: row.board_id,
        result: row.result,
      });
    } catch (error) {
      repositoryLogger.error("audit event write failed", {
        action: row.action,
        resourceType: row.resource_type,
        resourceId: row.resource_id,
        boardId: row.board_id,
        result: row.result,
        ...errorFields(error),
      });
    }
  }

  async ensureAnotherActiveSuperAdmin(excludedUserId: string) {
    const count = Number((await this.q("SELECT COUNT(*) AS count FROM users WHERE role='super_admin' AND is_active=1 AND id<>?", [excludedUserId]))[0]?.count ?? 0);
    if (count <= 0) throw new Error("At least one super admin is required");
  }
}

type ChangeEntry = {
  label: string;
  before: string;
  after: string;
};

function changeEntry(label: string, before: unknown, after: unknown): ChangeEntry | null {
  const beforeText = stringifyChangeValue(before);
  const afterText = stringifyChangeValue(after);
  if (beforeText === afterText) {
    return null;
  }
  return { label, before: beforeText, after: afterText };
}

function compactChanges(changes: Array<ChangeEntry | null>) {
  return changes.filter((item): item is ChangeEntry => Boolean(item));
}

function summarizeChanges(changes: ChangeEntry[]) {
  return changes.map((change) => `${change.label}：${change.before} → ${change.after}`).join("；");
}

function stringifyChangeValue(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return "空";
  }
  if (Array.isArray(value)) {
    return value.length ? value.join(" / ") : "空";
  }
  if (typeof value === "boolean") {
    return value ? "是" : "否";
  }
  return String(value);
}

function priorityLabel(value: Priority) {
  return ({ high: "高", medium: "中", low: "低" } satisfies Record<Priority, string>)[value];
}

function projectStatusLabel(value: ProjectStatus) {
  return ({ active: "活跃", archived: "归档" } satisfies Record<ProjectStatus, string>)[value];
}

function healthLabel(value: ProjectHealth) {
  return ({ good: "健康", normal: "正常", risk: "风险" } satisfies Record<ProjectHealth, string>)[value];
}

function user(row: Record<string, unknown>): CurrentUser {
  return {
    id: String(row.id),
    username: String(row.username),
    role: normalizeUserRole(row.role),
    timezone: normalizeTimeZone(row.timezone as string),
    displayName: typeof row.display_name === "string" ? row.display_name : "",
    phone: typeof row.phone === "string" ? row.phone : "",
    avatarKey: typeof row.avatar_key === "string" ? row.avatar_key : "",
    jobTitle: typeof row.job_title === "string" ? row.job_title : "",
    techStacks: parseJsonStringArray(row.tech_stacks),
  };
}

function managedUser(row: Record<string, unknown>): ManagedUser {
  return {
    ...user(row),
    isActive: row.is_active === 1 || row.is_active === true,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function board(row: Record<string, unknown>, role?: string, teamIds: string[] = []): BoardSummary {
  return {
    id: String(row.id),
    name: String(row.name),
    description: String(row.description ?? ""),
    ownerUserId: String(row.owner_user_id),
    ownerUsername: String(row.owner_username ?? ""),
    role: role === "owner" || role === "viewer" || role === "admin" ? role : "viewer",
    teamIds,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function team(row: Record<string, unknown>, memberIds: string[]): TeamSummary {
  return {
    id: String(row.id),
    name: String(row.name),
    description: String(row.description ?? ""),
    ownerUserId: String(row.owner_user_id),
    ownerUsername: String(row.owner_username ?? ""),
    color: String(row.color ?? "#0f766e"),
    memberIds,
    memberCount: memberIds.length,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function teamMember(row: Record<string, unknown>): TeamMemberSummary {
  return {
    id: String(row.id),
    username: String(row.username),
    displayName: typeof row.display_name === "string" ? row.display_name : "",
    role: normalizeUserRole(row.role),
    avatarKey: typeof row.avatar_key === "string" ? row.avatar_key : "",
    jobTitle: typeof row.job_title === "string" ? row.job_title : "",
    techStacks: parseJsonStringArray(row.tech_stacks),
    phone: typeof row.phone === "string" ? row.phone : "",
  };
}

function boardUser(row: Record<string, unknown>): BoardUserOption {
  return {
    id: String(row.id),
    username: String(row.username),
    displayName: typeof row.display_name === "string" ? row.display_name : "",
    role: normalizeUserRole(row.role),
    avatarKey: typeof row.avatar_key === "string" ? row.avatar_key : "",
    jobTitle: typeof row.job_title === "string" ? row.job_title : "",
    techStacks: parseJsonStringArray(row.tech_stacks),
    phone: typeof row.phone === "string" ? row.phone : "",
  };
}

function project(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    teamId: typeof row.team_id === "string" ? row.team_id : "",
    name: String(row.name),
    description: String(row.description ?? ""),
    owner: String(row.owner ?? ""),
    color: String(row.color ?? "#1f6f68"),
    health: isProjectHealth(row.health) ? row.health : "normal",
    status: isProjectStatus(row.status) ? row.status : "active",
    summary: String(row.summary ?? ""),
    archivedAt: row.archived_at as string | null,
    orderIndex: Number(row.order_index ?? 0),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function subtask(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    taskId: String(row.task_id),
    title: String(row.title),
    done: row.done === 1 || row.done === true,
    orderIndex: Number(row.order_index ?? 0),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function task(row: Record<string, unknown>, steps: Subtask[]) {
  return {
    id: String(row.id),
    projectId: String(row.project_id),
    title: String(row.title),
    description: String(row.description ?? ""),
    status: normalizeBoardStatus(row.status),
    priority: isPriority(row.priority) ? row.priority : "medium",
    ownerUserId: typeof row.owner_user_id === "string" ? row.owner_user_id : "",
    owner: String(row.owner ?? ""),
    testerUserId: typeof row.tester_user_id === "string" ? row.tester_user_id : "",
    tester: typeof row.tester === "string" ? row.tester : "",
    startDate: String(row.start_date ?? ""),
    testDueDate: String(row.test_due_date ?? ""),
    designDueDate: typeof row.design_due_date === "string" ? row.design_due_date : "",
    dueDate: String(row.due_date ?? ""),
    estimate: Number(row.estimate ?? 1),
    workloadDays: workloadDays(row.workload_days),
    progress: Number(row.progress ?? 0),
    blockers: Number(row.blockers ?? 0),
    blockedReason: String(row.blocked_reason ?? ""),
    tags: parseTags(String(row.tags ?? "[]")),
    subtasks: steps,
    orderIndex: Number(row.order_index ?? 0),
    deletedAt: row.deleted_at as string | null,
    completedAt: row.completed_at as string | null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function daysUntil(date: string, todayKey: string) {
  if (!date) return null;
  const due = new Date(`${date}T00:00:00`);
  const today = new Date(`${todayKey}T00:00:00`);
  return Math.ceil((due.getTime() - today.getTime()) / 86400000);
}

function lateDaysByCompletion(date: string, compareIso: string | null) {
  if (!date || !compareIso) return null;
  const lateDays = Math.ceil((new Date(compareIso).getTime() - new Date(`${date}T23:59:59`).getTime()) / 86400000);
  return lateDays > 0 ? -lateDays : null;
}

function taskWarningFlags(
  taskValue: ReturnType<typeof task>,
  todayKey: string,
  dueSoonDays: number
) {
  const designDays = daysUntil(taskValue.designDueDate, todayKey);
  const testDays = daysUntil(taskValue.testDueDate, todayKey);
  const deliveryDays = daysUntil(taskValue.dueDate, todayKey);
  const designLateDays = lateDaysByCompletion(taskValue.designDueDate, taskValue.completedAt);
  const testLateDays = lateDaysByCompletion(taskValue.testDueDate, taskValue.completedAt);
  const deliveryLateDays = lateDaysByCompletion(taskValue.dueDate, taskValue.completedAt);

  const dueSoon =
    (taskValue.status === "design" && designDays !== null && designDays >= 0 && designDays <= dueSoonDays) ||
    (taskValue.status === "dev" && testDays !== null && testDays >= 0 && testDays <= dueSoonDays) ||
    ((taskValue.status === "test" || taskValue.status === "done") && deliveryDays !== null && deliveryDays >= 0 && deliveryDays <= dueSoonDays);

  const overdue =
    (taskValue.status === "design" && designDays !== null && designDays < 0) ||
    ((taskValue.status === "dev" || taskValue.status === "test") && taskValue.designDueDate && designDays !== null && designDays < 0) ||
    (taskValue.status === "dev" && testDays !== null && testDays < 0) ||
    (taskValue.status === "test" && taskValue.testDueDate && testDays !== null && testDays < 0) ||
    (taskValue.status === "test" && deliveryDays !== null && deliveryDays < 0) ||
    (taskValue.status === "done" &&
      (designLateDays !== null || testLateDays !== null || deliveryLateDays !== null));

  return {
    dueSoon,
    overdue,
    blocked: taskValue.blockers > 0,
  };
}

function activityRow(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    entityType: ["project", "task", "subtask", "board"].includes(row.entity_type as string) ? (row.entity_type as ActivityLog["entityType"]) : "board",
    entityId: String(row.entity_id),
    projectId: row.project_id as string | null,
    taskId: row.task_id as string | null,
    action: String(row.action),
    message: String(row.message),
    meta: json(String(row.meta ?? "{}")),
    createdAt: String(row.created_at),
  };
}

function auditLogRow(row: Record<string, unknown>): AuditLogEntry {
  return {
    id: String(row.id),
    actorUserId: String(row.actor_user_id ?? ""),
    actorUsername: String(row.actor_username ?? ""),
    actorRole: String(row.actor_role ?? ""),
    action: String(row.action),
    resourceType: String(row.resource_type ?? "system"),
    resourceId: String(row.resource_id ?? ""),
    boardId: String(row.board_id ?? ""),
    result: String(row.result ?? "success"),
    message: String(row.message ?? ""),
    ipAddress: String(row.ip_address ?? ""),
    userAgent: String(row.user_agent ?? ""),
    requestId: String(row.request_id ?? ""),
    metadata: json(String(row.metadata ?? "{}")),
    createdAt: String(row.created_at),
  };
}

function parameter(row: Record<string, unknown>) {
  return {
    key: String(row.key),
    value: String(row.value),
    label: String(row.label),
    valueType: row.value_type === "number" || row.value_type === "boolean" ? (row.value_type as SystemParameter["valueType"]) : "text",
    group: String(row.parameter_group),
    unit: String(row.unit ?? ""),
    minValue: row.min_value as number | null,
    maxValue: row.max_value as number | null,
    orderIndex: Number(row.order_index ?? 0),
    updatedAt: String(row.updated_at),
  };
}

function settingsFromRows(rows: Record<string, unknown>[]) {
  const parameters = rows.map(parameter);
  return {
    dueSoonDays: num(parameters.find((item) => item.key === "due_soon_days")?.value, defaultSystemSettings.dueSoonDays, 0, 30),
    testerDefaultWorkloadDays: numDecimal(
      parameters.find((item) => item.key === "tester_default_workload_days")?.value,
      defaultSystemSettings.testerDefaultWorkloadDays,
      0.5,
      10
    ),
    activityRetentionDays: num(
      parameters.find((item) => item.key === "activity_retention_days")?.value,
      defaultSystemSettings.activityRetentionDays,
      1,
      3650
    ),
    parameters,
  };
}

function parameterText(settings: SystemSettings, key: string) {
  return settings.parameters.find((item) => item.key === key)?.value.trim() ?? "";
}

function parameterValue(parameter: SystemParameter, current: string, raw: unknown) {
  if (parameter.valueType === "number") {
    if (parameter.key === "tester_default_workload_days") {
      return String(numDecimal(raw, Number(current) || Number(parameter.value), parameter.minValue ?? 0, parameter.maxValue ?? 100000));
    }
    return String(num(raw, Number(current) || Number(parameter.value), parameter.minValue ?? 0, parameter.maxValue ?? 100000));
  }
  if (parameter.valueType === "boolean") {
    return String(raw === true || raw === "true");
  }
  return opt(raw, current);
}

function normalizeUsername(value: unknown) {
  const username = text(value);
  if (!USERNAME_PATTERN.test(username)) throw new Error("Username must contain only letters, numbers, or underscores");
  return username;
}

function normalizeUserRole(value: unknown, fallback: UserRole = "team_member"): UserRole {
  if (value === "super_admin" || value === "project_manager" || value === "development_manager" || value === "team_member") return value;
  if (value === "user") return "team_member";
  return fallback;
}

function normalizeJobTitle(value: unknown, fallback = "") {
  return opt(value, fallback);
}

function defaultJobTitleForRole(role: UserRole) {
  if (role === "project_manager") return "project_manager";
  if (role === "development_manager") return "development_manager";
  if (role === "team_member") return "developer";
  return "";
}

function techStacks(value: unknown, fallback: string[] = []) {
  if (Array.isArray(value)) {
    return Array.from(
      new Set(
        value
          .map((item) => text(item))
          .filter(Boolean)
      )
    ).slice(0, 24);
  }
  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return techStacks(parsed, fallback);
      }
    } catch {
      return Array.from(new Set(value.split(/[,\n，、]+/).map((item) => item.trim()).filter(Boolean))).slice(0, 24);
    }
  }
  return fallback;
}

function parseJsonStringArray(value: unknown) {
  try {
    const parsed = JSON.parse(String(value ?? "[]"));
    return Array.isArray(parsed) ? parsed.map((item) => String(item)).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function uniqIds(values: unknown[]) {
  const set = new Set<string>();
  for (const value of values) {
    if (Array.isArray(value)) {
      for (const item of value) {
        const normalized = text(item);
        if (normalized) set.add(normalized);
      }
      continue;
    }
    if (typeof value === "string" && value.includes(",")) {
      for (const part of value.split(",")) {
        const normalized = text(part);
        if (normalized) set.add(normalized);
      }
      continue;
    }
    const normalized = text(value);
    if (normalized) set.add(normalized);
  }
  return [...set];
}

function requireBoardCreator(actor: CurrentUser) {
  if (!canCreateBoards(actor)) throw new Error("Forbidden");
}

function canCreateBoards(actor: CurrentUser) {
  return isManagementRole(actor);
}

function canManageBoardTasks(actor: CurrentUser) {
  return isManagementRole(actor);
}

function canCreateTasks(actor: CurrentUser) {
  return canManageBoardTasks(actor) || actor.role === "team_member";
}

function isManagementRole(actor: CurrentUser) {
  return actor.role === "super_admin" || actor.role === "project_manager" || actor.role === "development_manager";
}

function isTaskRelatedToUser(taskValue: { ownerUserId: string; testerUserId: string }, userId: string) {
  return taskValue.ownerUserId === userId || taskValue.testerUserId === userId;
}

function adminOnly(actor: CurrentUser) {
  if (actor.role !== "super_admin") throw new Error("Forbidden");
}

function displayName(row: Record<string, unknown>) {
  return String(row.display_name || row.username || "");
}

function uniqueUsers(users: BoardUserOption[]) {
  const seen = new Set<string>();
  const result: BoardUserOption[] = [];
  for (const userOption of users) {
    if (seen.has(userOption.id)) continue;
    seen.add(userOption.id);
    result.push(userOption);
  }
  return result;
}

function boolInt(value: unknown) {
  return value === 1 || value === true ? 1 : 0;
}

function iso() {
  return new Date().toISOString();
}

function text(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function opt(value: unknown, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

function num(value: unknown, fallback: number, min: number, max: number) {
  const numberValue = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numberValue) ? Math.min(max, Math.max(min, Math.round(numberValue))) : fallback;
}

function numDecimal(value: unknown, fallback: number, min: number, max: number) {
  const numberValue = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numberValue) ? Math.min(max, Math.max(min, Math.round(numberValue * 2) / 2)) : fallback;
}

function workloadDays(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const numberValue = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numberValue)) return null;
  return Math.min(999, Math.max(0.5, Math.round(numberValue * 2) / 2));
}

function effectiveWorkloadDays(taskValue: { workloadDays?: number | null }) {
  return taskValue.workloadDays && Number.isFinite(taskValue.workloadDays) ? taskValue.workloadDays : 1;
}

function dashboardProgressForMember(jobTitle: string, taskValue: { status: BoardStatus; progress?: number }) {
  if (jobTitle === "developer") {
    return "progress" in taskValue && typeof taskValue.progress === "number" ? taskValue.progress : 0;
  }
  return taskValue.status === "done" ? 100 : 0;
}

function dashboardAverageProgressForMember(
  jobTitle: string,
  rows: Array<Record<string, unknown> & { __effectiveWorkloadDays: number }>
) {
  if (!rows.length) return 0;
  if (jobTitle === "developer") {
    const totalWorkload = rows.reduce((sum, row) => sum + row.__effectiveWorkloadDays, 0);
    return totalWorkload > 0
      ? Math.round(
          rows.reduce((sum, row) => {
            const normalizedTask = task(row, []);
            return sum + row.__effectiveWorkloadDays * dashboardProgressForMember(jobTitle, normalizedTask);
          }, 0) / totalWorkload
        )
      : 0;
  }
  return Math.round(
    rows.reduce((sum, row) => {
      const normalizedTask = task(row, []);
      return sum + dashboardProgressForMember(jobTitle, normalizedTask);
    }, 0) / rows.length
  );
}

function projectDashboardWorkload(
  taskRows: Record<string, unknown>[],
  memberById: Map<string, { jobTitle: string }>,
  testerDefaultWorkloadDays: number
) {
  return taskRows.reduce((sum, taskRow) => {
    const normalizedTask = task(taskRow, []);
    const ownerWorkload = memberById.get(normalizedTask.ownerUserId)?.jobTitle === "tester"
      ? 0
      : effectiveWorkloadDays(normalizedTask);
    const testWorkload =
      normalizedTask.status === "test" && memberById.get(normalizedTask.testerUserId)?.jobTitle === "tester"
        ? testerDefaultWorkloadDays
        : 0;
    return sum + ownerWorkload + testWorkload;
  }, 0);
}

function roundWorkload(value: number) {
  return Math.round(value * 10) / 10;
}

function formatWorkload(value: number | null) {
  return value ? `${value} 人日` : "默认 1 人日";
}

function json(value: string) {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function parseTags(value: string) {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function tags(value: unknown, fallback: string[]) {
  const raw = typeof value === "string" ? value.split(/[,\s，、]+/) : Array.isArray(value) ? value : fallback;
  return raw
    .filter((item) => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item, index, array) => array.indexOf(item) === index)
    .slice(0, 8);
}

function ids(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.filter((item) => typeof item === "string" && item.trim()).map((item) => item.trim());
}

function reorderItem(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const id = text(row.id);
  return id ? { id, status: normalizeBoardStatus(row.status), orderIndex: num(row.orderIndex, 0, 0, 100000) } : null;
}

function isReorderItem(value: ReturnType<typeof reorderItem>): value is NonNullable<ReturnType<typeof reorderItem>> {
  return value !== null;
}
