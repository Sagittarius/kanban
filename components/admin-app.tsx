"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import ConfirmDialog, { type ConfirmDialogAction } from "@/components/confirm-dialog";
import SharedSearchMultiSelect from "@/components/search-multi-select";
import { isThemeId, jobTitleLabel, jobTitleOptions, techStackOptions, themePresets, timezoneLabel, timezoneOptions, type ThemeId } from "@/lib/ui-options";
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

type TabId = "users" | "teams" | "boards" | "audit";

type AdminBoard = BoardSummary & {
  members: Array<{
    user_id: string;
    username: string;
    display_name?: string;
    role: UserRole;
    board_role?: string;
  }>;
};

type UsersResponse = {
  users: ManagedUser[];
  assignableUsers: TeamMemberSummary[];
  permissions: AdminPermissions;
};

type TeamsResponse = {
  teams: TeamSummary[];
  assignableUsers: TeamMemberSummary[];
  permissions: AdminPermissions;
};

type AuditLogsResponse = {
  auditLogs: AuditLogEntry[];
};

type SelectOption = {
  value: string;
  label: string;
  meta?: string;
};

type ConfirmState = ConfirmDialogAction | null;

const defaultPermissions: AdminPermissions = {
  canManageUsers: false,
  canCreateSuperAdmin: false,
  canManageAllBoards: false,
};

function clientErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

async function fetchAdminJson<T>(url: string, fallback: T, errors: string[], fallbackMessage: string): Promise<T> {
  try {
    const response = await fetch(url);
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      const message =
        payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string"
          ? payload.error
          : fallbackMessage;
      throw new Error(message);
    }
    return (payload ?? fallback) as T;
  } catch (error) {
    errors.push(clientErrorMessage(error, fallbackMessage));
    return fallback;
  }
}

const roleLabels: Record<UserRole, string> = {
  super_admin: "超管",
  project_manager: "项目经理",
  development_manager: "开发经理",
  team_member: "团队成员",
};

const defaultUserDraft = {
  id: "",
  username: "",
  displayName: "",
  phone: "",
  role: "team_member" as UserRole,
  jobTitle: "developer",
  techStacks: [] as string[],
  timezone: "Asia/Shanghai",
  isActive: true,
};

const defaultTeamDraft = {
  id: "",
  name: "",
  description: "",
  color: "#0f766e",
  memberIds: [] as string[],
};

const defaultBoardDraft = {
  id: "",
  name: "",
  description: "",
  ownerUserId: "",
  teamIds: [] as string[],
};

export default function AdminApp({ currentUser, initialThemeId = "notion" }: { currentUser: CurrentUser; initialThemeId?: string }) {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [assignableUsers, setAssignableUsers] = useState<TeamMemberSummary[]>([]);
  const [teams, setTeams] = useState<TeamSummary[]>([]);
  const [boards, setBoards] = useState<AdminBoard[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [permissions, setPermissions] = useState<AdminPermissions>(defaultPermissions);
  const [activeTab, setActiveTab] = useState<TabId>("users");
  const [message, setMessage] = useState("");
  const [userQuery, setUserQuery] = useState("");
  const [teamQuery, setTeamQuery] = useState("");
  const [boardQuery, setBoardQuery] = useState("");
  const [auditQuery, setAuditQuery] = useState("");
  const [memberQuery, setMemberQuery] = useState("");
  const [selectedBoardId, setSelectedBoardId] = useState("");
  const [userDraft, setUserDraft] = useState(defaultUserDraft);
  const [teamDraft, setTeamDraft] = useState(defaultTeamDraft);
  const [boardDraft, setBoardDraft] = useState(defaultBoardDraft);
  const [boardTeamDraft, setBoardTeamDraft] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [confirmState, setConfirmState] = useState<ConfirmState>(null);
  const [themeId, setThemeId] = useState<ThemeId>(isThemeId(initialThemeId) ? initialThemeId : "notion");
  const initialized = useRef(false);

  async function refresh() {
    const errors: string[] = [];
    const emptyUsers: UsersResponse = { users: [], assignableUsers: [], permissions: defaultPermissions };
    const emptyTeams: TeamsResponse = { teams: [], assignableUsers: [], permissions: defaultPermissions };
    const emptyAuditLogs: AuditLogsResponse = { auditLogs: [] };
    const [userPayload, teamPayload, boardPayload, auditPayload] = await Promise.all([
      fetchAdminJson("/api/admin/users", emptyUsers, errors, "加载用户失败"),
      fetchAdminJson("/api/admin/teams", emptyTeams, errors, "加载团队失败"),
      fetchAdminJson("/api/admin/boards", [] as AdminBoard[], errors, "加载看板失败"),
      fetchAdminJson("/api/admin/audit-logs", emptyAuditLogs, errors, "加载审计日志失败"),
    ]);
    const userRows = Array.isArray(userPayload.users) ? userPayload.users : [];
    const assignableRows = Array.isArray(teamPayload.assignableUsers)
      ? teamPayload.assignableUsers
      : Array.isArray(userPayload.assignableUsers)
        ? userPayload.assignableUsers
        : [];
    const teamRows = Array.isArray(teamPayload.teams) ? teamPayload.teams : [];
    const boardRows = Array.isArray(boardPayload) ? boardPayload : [];
    const auditRows = Array.isArray(auditPayload.auditLogs) ? auditPayload.auditLogs : [];
    setUsers(userRows);
    setAssignableUsers(assignableRows);
    setTeams(teamRows);
    setPermissions(userPayload.permissions ?? teamPayload.permissions ?? defaultPermissions);
    setBoards(boardRows);
    setAuditLogs(auditRows);
    if (errors.length > 0) {
      setMessage([...new Set(errors)].join("；"));
    }
    const nextBoard = boardRows.find((board) => board.id === selectedBoardId) ?? boardRows[0];
    setSelectedBoardId(nextBoard?.id ?? "");
    setBoardTeamDraft(nextBoard?.teamIds ?? []);
  }

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    void refresh();
  });

  const visibleTabs = useMemo<Array<[TabId, string]>>(
    () => [
      ...(permissions.canManageUsers ? ([["users", "用户"]] as Array<[TabId, string]>) : []),
      ["teams", "团队"],
      ["boards", "看板"],
      ["audit", "审计"],
    ],
    [permissions.canManageUsers]
  );

  const currentTab = activeTab === "users" && !permissions.canManageUsers ? "teams" : activeTab;

  const roleOptions = useMemo<SelectOption[]>(() => {
    const roles: UserRole[] =
      currentUser.role === "super_admin"
        ? ["super_admin", "project_manager", "development_manager", "team_member"]
        : ["team_member"];
    return roles.map((role) => ({ value: role, label: roleLabels[role] }));
  }, [currentUser.role]);

  const jobTitleSelectOptions = useMemo<SelectOption[]>(
    () => jobTitleOptions.map((option) => ({ value: option.value, label: option.label })),
    []
  );

  const timezoneSelectOptions = useMemo<SelectOption[]>(
    () => timezoneOptions.map(([value, label]) => ({ value, label })),
    []
  );

  const assignableUserOptions = useMemo<SelectOption[]>(
    () =>
      assignableUsers.map((user) => ({
        value: user.id,
        label: user.displayName || user.username,
        meta: `${roleLabels[user.role]} · @${user.username}`,
      })),
    [assignableUsers]
  );

  const boardOwnerOptions = useMemo<SelectOption[]>(
    () =>
      users
        .filter((user) => user.isActive && user.role !== "team_member")
        .map((user) => ({
          value: user.id,
          label: user.displayName || user.username,
          meta: `${roleLabels[user.role]} · @${user.username}`,
        })),
    [users]
  );

  const teamOptions = useMemo<SelectOption[]>(
    () =>
      teams.map((team) => ({
        value: team.id,
        label: team.name,
        meta: `${team.memberCount} 人 · ${team.ownerUsername}`,
      })),
    [teams]
  );

  const filteredUsers = useMemo(() => {
    const query = userQuery.trim().toLowerCase();
    if (!query) return users;
    return users.filter((user) => {
      const values = [
        user.username,
        user.displayName,
        user.phone,
        roleLabels[user.role],
        user.role,
        jobTitleLabel(user.jobTitle),
        user.timezone,
        timezoneLabel(user.timezone),
        ...user.techStacks,
        user.isActive ? "启用" : "停用",
      ];
      return values.some((value) => value.toLowerCase().includes(query));
    });
  }, [userQuery, users]);

  const filteredTeams = useMemo(() => {
    const query = teamQuery.trim().toLowerCase();
    if (!query) return teams;
    return teams.filter((team) =>
      [team.name, team.description, team.ownerUsername].some((value) => value.toLowerCase().includes(query))
    );
  }, [teamQuery, teams]);

  const filteredBoards = useMemo(() => {
    const query = boardQuery.trim().toLowerCase();
    if (!query) return boards;
    return boards.filter((board) =>
      [board.name, board.description, board.ownerUsername].some((value) => value.toLowerCase().includes(query))
    );
  }, [boardQuery, boards]);

  const filteredAuditLogs = useMemo(() => {
    const query = auditQuery.trim().toLowerCase();
    if (!query) return auditLogs;
    return auditLogs.filter((item) => {
      const values = [
        item.actorUsername,
        item.actorRole,
        item.action,
        item.resourceType,
        item.resourceId,
        item.boardId,
        item.result,
        item.message,
        item.ipAddress,
        item.requestId,
      ];
      return values.some((value) => value.toLowerCase().includes(query));
    });
  }, [auditLogs, auditQuery]);

  const selectedBoard = filteredBoards.find((board) => board.id === selectedBoardId) ?? filteredBoards[0] ?? null;
  const teamById = useMemo(() => new Map(teams.map((team) => [team.id, team])), [teams]);
  const selectedBoardTeams = useMemo(
    () => (selectedBoard?.teamIds ?? []).map((teamId) => teamById.get(teamId)).filter((team): team is TeamSummary => Boolean(team)),
    [selectedBoard, teamById]
  );
  const selectedBoardOwner = selectedBoard ? users.find((user) => user.id === selectedBoard.ownerUserId) ?? null : null;
  const selectedBoardExplicitCount = selectedBoard?.members.length ?? 0;
  const selectedBoardTeamMemberCount = selectedBoardTeams.reduce((sum, team) => sum + team.memberCount, 0);

  const selectedBoardMembers = useMemo(() => {
    if (!selectedBoard) return [];
    const explicitIds = new Set(selectedBoard.members.map((member) => member.user_id));
    const query = memberQuery.trim().toLowerCase();
    return users
      .filter((user) => {
        if (!query) return true;
        const values = [user.username, user.displayName, user.phone, roleLabels[user.role], jobTitleLabel(user.jobTitle), timezoneLabel(user.timezone), ...user.techStacks];
        return values.some((value) => value.toLowerCase().includes(query));
      })
      .map((user) => ({
        user,
        owner: selectedBoard.ownerUserId === user.id,
        explicit: explicitIds.has(user.id),
      }))
      .sort((left, right) => {
        if (left.owner !== right.owner) return left.owner ? -1 : 1;
        if (left.explicit !== right.explicit) return left.explicit ? -1 : 1;
        return (left.user.displayName || left.user.username).localeCompare(right.user.displayName || right.user.username);
      });
  }, [memberQuery, selectedBoard, users]);

  const summary = useMemo(() => {
    const activeUsers = users.filter((user) => user.isActive);
    const explicitUserIds = new Set<string>();
    for (const board of boards) {
      for (const member of board.members) explicitUserIds.add(member.user_id);
    }
    return {
      users: users.length,
      activeUsers: activeUsers.length,
      projectManagers: users.filter((user) => user.role === "project_manager").length,
      teams: teams.length,
      boards: boards.length,
      explicitUsers: explicitUserIds.size,
    };
  }, [boards, teams.length, users]);

  function changeTheme(nextTheme: ThemeId) {
    setThemeId(nextTheme);
    window.localStorage.setItem("kanban-theme", nextTheme);
    document.cookie = `kanban_theme=${nextTheme}; path=/; max-age=31536000; samesite=lax`;
  }

  function editUser(user: ManagedUser) {
    setUserDraft({
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      phone: user.phone,
      role: user.role,
      jobTitle: user.jobTitle || defaultUserDraft.jobTitle,
      techStacks: user.techStacks || [],
      timezone: user.timezone,
      isActive: user.isActive,
    });
    setActiveTab("users");
  }

  function resetUserDraft() {
    setUserDraft(defaultUserDraft);
  }

  async function saveUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!permissions.canManageUsers) return;
    setSaving(true);
    setMessage("");
    const method = userDraft.id ? "PATCH" : "POST";
    const url = userDraft.id ? `/api/admin/users/${userDraft.id}` : "/api/admin/users";
    const response = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(userDraft),
    });
    const payload = (await response.json().catch(() => ({}))) as ManagedUser & { error?: string };
    setSaving(false);
    if (!response.ok) {
      setMessage(payload.error ?? "保存失败");
      return;
    }
    setMessage(userDraft.id ? "用户已保存" : `用户 ${payload.username} 已创建，默认密码为 ${payload.username}@123`);
    resetUserDraft();
    await refresh();
  }

  async function deleteUser(user: ManagedUser) {
    const response = await fetch(`/api/admin/users/${user.id}`, { method: "DELETE" });
    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    setMessage(response.ok ? "用户已停用" : payload.error ?? "停用失败");
    await refresh();
  }

  async function resetPassword(userId: string) {
    const response = await fetch(`/api/admin/users/${userId}/reset-password`, { method: "POST" });
    const payload = (await response.json().catch(() => ({}))) as { username?: string; password?: string; error?: string };
    setMessage(payload.password ? `${payload.username} 的密码已重置为：${payload.password}` : payload.error ?? "重置失败");
  }

  function editTeam(team: TeamSummary) {
    setTeamDraft({
      id: team.id,
      name: team.name,
      description: team.description,
      color: team.color,
      memberIds: team.memberIds,
    });
    setActiveTab("teams");
  }

  function resetTeamDraft() {
    setTeamDraft(defaultTeamDraft);
  }

  function resetBoardDraft() {
    setBoardDraft(defaultBoardDraft);
  }

  function editBoard(board: AdminBoard) {
    setBoardDraft({
      id: board.id,
      name: board.name,
      description: board.description,
      ownerUserId: board.ownerUserId,
      teamIds: board.teamIds ?? [],
    });
    setActiveTab("boards");
  }

  async function saveTeam(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    const method = teamDraft.id ? "PATCH" : "POST";
    const url = teamDraft.id ? `/api/admin/teams/${teamDraft.id}` : "/api/admin/teams";
    const response = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(teamDraft),
    });
    const payload = (await response.json().catch(() => ({}))) as TeamSummary & { error?: string };
    setSaving(false);
    if (!response.ok) {
      setMessage(payload.error ?? "保存失败");
      return;
    }
    setMessage(teamDraft.id ? "团队已保存" : "团队已创建");
    resetTeamDraft();
    await refresh();
  }

  async function saveBoard(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    const method = boardDraft.id ? "PATCH" : "POST";
    const url = boardDraft.id ? `/api/boards/${boardDraft.id}` : "/api/boards";
    const response = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(boardDraft),
    });
    const payload = (await response.json().catch(() => ({}))) as BoardSummary & { error?: string };
    setSaving(false);
    if (!response.ok) {
      setMessage(payload.error ?? "保存失败");
      return;
    }
    setMessage(boardDraft.id ? `看板「${payload.name}」已保存` : `看板「${payload.name}」已创建`);
    setBoardDraft(defaultBoardDraft);
    setSelectedBoardId(payload.id);
    setBoardTeamDraft(payload.teamIds ?? []);
    await refresh();
  }

  async function deleteTeam(team: TeamSummary) {
    const response = await fetch(`/api/admin/teams/${team.id}`, { method: "DELETE" });
    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    setMessage(response.ok ? "团队已删除" : payload.error ?? "删除失败");
    await refresh();
  }

  async function deleteBoard(board: AdminBoard) {
    const response = await fetch(`/api/boards/${board.id}`, { method: "DELETE" });
    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    setMessage(response.ok ? "看板已删除" : payload.error ?? "删除失败");
    await refresh();
  }

  async function grant(boardId: string, userId: string, action: "grant" | "revoke") {
    const response = await fetch(`/api/admin/boards/${boardId}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, action }),
    });
    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    if (!response.ok) setMessage(payload.error ?? "保存授权失败");
    await refresh();
  }

  async function saveBoardTeams() {
    if (!selectedBoard) return;
    const response = await fetch(`/api/boards/${selectedBoard.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: selectedBoard.name,
        description: selectedBoard.description,
        teamIds: boardTeamDraft,
      }),
    });
    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    setMessage(response.ok ? "看板团队已保存" : payload.error ?? "保存失败");
    await refresh();
  }

  return (
    <main data-theme={themeId} className="kanban-theme min-h-screen bg-[var(--app-bg)] text-[var(--text)]">
      <header className="border-b border-[var(--border)] bg-[var(--panel)] px-5 py-4">
        <div className="mx-auto flex max-w-[1760px] flex-wrap items-center gap-3">
          <div>
            <h1 className="text-2xl font-semibold">后台管理</h1>
            <p className="mt-1 text-sm text-[var(--muted)]">{currentUser.displayName || currentUser.username}</p>
          </div>
          <div className="ml-auto flex items-center gap-3">
            <SearchSelect
              value={themeId}
              options={themePresets.map((theme) => ({ value: theme.id, label: theme.label }))}
              onChange={(value) => changeTheme(value as ThemeId)}
              placeholder="配色方案"
            />
            <Link href="/" prefetch={false} className="rounded-xl bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[var(--accent-hover)]">
              返回看板
            </Link>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-[1760px] px-5 py-5">
        <div className="flex flex-wrap gap-2">
          {visibleTabs.map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setActiveTab(id)}
              className={`h-10 rounded-xl px-4 text-sm font-semibold transition ${
                currentTab === id
                  ? "bg-[var(--text)] text-[var(--panel)]"
                  : "border border-[var(--border)] bg-[var(--panel)] text-[var(--muted)] hover:bg-[var(--hover)]"
              }`}
            >
              {label}
            </button>
          ))}
          <Link
            href="/dashboard"
            prefetch={false}
            className="ml-auto inline-flex h-10 items-center rounded-xl border border-[var(--border)] bg-[var(--panel)] px-4 text-sm font-semibold text-[var(--text)] transition hover:bg-[var(--hover)]"
          >
            项目负载大屏
          </Link>
        </div>

        {message ? <div className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--panel)] px-4 py-3 text-sm">{message}</div> : null}

        <div className="sticky top-4 z-10 mt-5 rounded-2xl border border-[var(--border)] bg-[color-mix(in_srgb,var(--panel)_90%,white_10%)] p-4 shadow-lg backdrop-blur">
          <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
            <SummaryCard label="用户" value={summary.users} />
            <SummaryCard label="启用" value={summary.activeUsers} />
            <SummaryCard label="项目经理" value={summary.projectManagers} />
            <SummaryCard label="团队" value={summary.teams} />
            <SummaryCard label="看板" value={summary.boards} />
            <SummaryCard label="授权" value={summary.explicitUsers} />
          </div>
        </div>

        {currentTab === "users" ? (
          <div className="mt-5 grid gap-5 xl:grid-cols-[420px_minmax(0,1fr)]">
            <Panel title={userDraft.id ? "编辑用户" : "创建用户"}>
              {permissions.canManageUsers ? (
                <form onSubmit={saveUser} className="space-y-4">
                  <Field label="用户名">
                    <input
                      value={userDraft.username}
                      onChange={(event) => setUserDraft((current) => ({ ...current, username: event.target.value }))}
                      pattern="[A-Za-z0-9_]+"
                      disabled={Boolean(userDraft.id)}
                      className="field"
                      placeholder="例如 zhangsan_01"
                    />
                  </Field>
                  <Field label="姓名">
                    <input
                      value={userDraft.displayName}
                      onChange={(event) => setUserDraft((current) => ({ ...current, displayName: event.target.value }))}
                      className="field"
                      placeholder="输入姓名"
                    />
                  </Field>
                  <Field label="手机">
                    <input
                      value={userDraft.phone}
                      onChange={(event) => setUserDraft((current) => ({ ...current, phone: event.target.value }))}
                      className="field"
                      placeholder="输入手机号"
                    />
                  </Field>
                  <Field label="角色">
                    <SearchSelect
                      value={userDraft.role}
                      options={roleOptions}
                      onChange={(value) => setUserDraft((current) => ({ ...current, role: value as UserRole }))}
                      placeholder="选择角色"
                    />
                  </Field>
                  <Field label="职位">
                    <SearchSelect
                      value={userDraft.jobTitle}
                      options={jobTitleSelectOptions}
                      onChange={(value) => setUserDraft((current) => ({ ...current, jobTitle: value }))}
                      placeholder="选择职位"
                    />
                  </Field>
                  <Field label="时区">
                    <SearchSelect
                      value={userDraft.timezone}
                      options={timezoneSelectOptions}
                      onChange={(value) => setUserDraft((current) => ({ ...current, timezone: value }))}
                      placeholder="选择时区"
                    />
                  </Field>
                  <Field label="技术栈">
                  <SharedSearchMultiSelect
                    value={userDraft.techStacks}
                    options={techStackOptions.map((item) => ({ value: item, label: item }))}
                    onChange={(techStacks) => setUserDraft((current) => ({ ...current, techStacks }))}
                      placeholder="搜索技术栈"
                      summaryLabel="技术栈"
                      searchPlaceholder="搜索技术栈"
                    />
                  </Field>
                  {userDraft.id ? (
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={userDraft.isActive}
                        onChange={(event) => setUserDraft((current) => ({ ...current, isActive: event.target.checked }))}
                      />
                      启用
                    </label>
                  ) : null}
                  <div className="flex gap-2">
                    <button disabled={saving} className="h-10 flex-1 rounded-xl bg-[var(--accent)] text-sm font-semibold text-white disabled:opacity-60">
                      {saving ? "保存中" : userDraft.id ? "保存" : "创建"}
                    </button>
                    <button type="button" onClick={resetUserDraft} className="h-10 rounded-xl border border-[var(--border)] px-4 text-sm font-semibold">
                      清空
                    </button>
                  </div>
                  {!userDraft.id ? <p className="text-xs text-[var(--muted)]">默认密码为“用户名@123”。</p> : null}
                </form>
              ) : (
                <EmptyState text="用户管理未开启" />
              )}
            </Panel>

            <Panel title="用户列表" count={filteredUsers.length}>
              <SearchInput value={userQuery} onChange={setUserQuery} placeholder="搜索用户、姓名、手机、角色、时区" />
              <div className="mt-4 grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
                {filteredUsers.map((user) => (
                  <UserCard
                    key={user.id}
                    user={user}
                    canManage={permissions.canManageUsers && (currentUser.role === "super_admin" || user.role !== "super_admin")}
                    onEdit={() => editUser(user)}
                    onReset={() =>
                      setConfirmState({
                        title: "重置密码",
                        message: `确认将用户「${user.displayName || user.username}」的密码重置为默认密码吗？`,
                        actionLabel: "重置密码",
                        onConfirm: async () => {
                          await resetPassword(user.id);
                          setConfirmState(null);
                        },
                      })
                    }
                    onDelete={() =>
                      setConfirmState({
                        title: "停用用户",
                        message: `停用用户「${user.displayName || user.username}」后，该用户将无法继续登录。`,
                        tone: "danger",
                        actionLabel: "停用用户",
                        onConfirm: async () => {
                          await deleteUser(user);
                          setConfirmState(null);
                        },
                      })
                    }
                  />
                ))}
              </div>
            </Panel>
          </div>
        ) : null}

        {currentTab === "teams" ? (
          <div className="mt-5 grid gap-5 xl:grid-cols-[440px_minmax(0,1fr)]">
            <Panel title={teamDraft.id ? "编辑团队" : "创建团队"}>
              <form onSubmit={saveTeam} className="space-y-4">
                <Field label="名称">
                  <input
                    value={teamDraft.name}
                    onChange={(event) => setTeamDraft((current) => ({ ...current, name: event.target.value }))}
                    className="field"
                    placeholder="输入团队名称"
                  />
                </Field>
                <Field label="说明">
                  <textarea
                    value={teamDraft.description}
                    onChange={(event) => setTeamDraft((current) => ({ ...current, description: event.target.value }))}
                    className="field min-h-[90px] py-3"
                    placeholder="输入说明"
                  />
                </Field>
                <Field label="颜色">
                  <input
                    type="color"
                    value={teamDraft.color}
                    onChange={(event) => setTeamDraft((current) => ({ ...current, color: event.target.value }))}
                    className="h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--input)] px-2"
                  />
                </Field>
                <Field label="成员">
                  <SharedSearchMultiSelect
                    value={teamDraft.memberIds}
                    options={assignableUserOptions}
                    onChange={(memberIds) => setTeamDraft((current) => ({ ...current, memberIds }))}
                    placeholder="搜索成员"
                  />
                </Field>
                <div className="flex gap-2">
                  <button disabled={saving} className="h-10 flex-1 rounded-xl bg-[var(--accent)] text-sm font-semibold text-white disabled:opacity-60">
                    {saving ? "创建中" : teamDraft.id ? "保存" : "创建"}
                  </button>
                  <button type="button" onClick={resetTeamDraft} className="h-10 rounded-xl border border-[var(--border)] px-4 text-sm font-semibold">
                    清空
                  </button>
                </div>
              </form>
            </Panel>

            <Panel title="团队列表" count={filteredTeams.length}>
              <SearchInput value={teamQuery} onChange={setTeamQuery} placeholder="搜索团队、说明、拥有者" />
              <div className="mt-4 grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
                {filteredTeams.map((team) => (
                  <div key={team.id} className="rounded-xl border border-[var(--border)] bg-[var(--panel-soft)] p-4">
                    <div className="flex items-start gap-3">
                      <span className="mt-1 h-3 w-3 rounded-full" style={{ backgroundColor: team.color }} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold">{team.name}</p>
                        <p className="mt-1 line-clamp-2 text-sm text-[var(--muted)]">{team.description || "无说明"}</p>
                        <p className="mt-2 text-xs text-[var(--muted)]">{team.ownerUsername} · {team.memberCount} 人</p>
                      </div>
                    </div>
                    <div className="mt-4 flex justify-end gap-2">
                      <SmallButton onClick={() => editTeam(team)}>编辑</SmallButton>
                      <SmallButton
                        onClick={() =>
                          setConfirmState({
                            title: "删除团队",
                            message: `删除团队「${team.name}」后，与该团队绑定的看板关联会同步解除。`,
                            tone: "danger",
                            actionLabel: "删除团队",
                            onConfirm: async () => {
                              await deleteTeam(team);
                              setConfirmState(null);
                            },
                          })
                        }
                      >
                        删除
                      </SmallButton>
                    </div>
                  </div>
                ))}
              </div>
            </Panel>
          </div>
        ) : null}

        {currentTab === "boards" ? (
          <div className="mt-5 grid gap-5 xl:grid-cols-[360px_minmax(360px,0.9fr)_minmax(0,1.3fr)]">
            <section className="space-y-5">
              <Panel title={boardDraft.id ? "编辑看板" : "创建看板"}>
                <form onSubmit={saveBoard} className="space-y-4">
                  <Field label="看板名称">
                    <input
                      value={boardDraft.name}
                      onChange={(event) => setBoardDraft((current) => ({ ...current, name: event.target.value }))}
                      className="field"
                      placeholder="输入看板名称"
                    />
                  </Field>
                  <Field label="说明">
                    <textarea
                      value={boardDraft.description}
                      onChange={(event) => setBoardDraft((current) => ({ ...current, description: event.target.value }))}
                      className="field min-h-[104px] py-3"
                      placeholder="输入说明"
                    />
                  </Field>
                  {boardDraft.id ? (
                    <Field label="拥有者">
                      <SearchSelect
                        value={boardDraft.ownerUserId}
                        options={boardOwnerOptions}
                        onChange={(value) => setBoardDraft((current) => ({ ...current, ownerUserId: value }))}
                        placeholder="选择拥有者"
                      />
                    </Field>
                  ) : null}
                  <Field label="关联团队">
                    {teamOptions.length > 0 ? (
                      <SharedSearchMultiSelect
                        value={boardDraft.teamIds}
                        options={teamOptions}
                        onChange={(teamIds) => setBoardDraft((current) => ({ ...current, teamIds }))}
                        placeholder="搜索团队"
                        summaryLabel="团队"
                        searchPlaceholder="搜索团队"
                      />
                    ) : (
                      <button
                        type="button"
                        onClick={() => setActiveTab("teams")}
                        className="h-11 w-full rounded-xl border border-dashed border-[var(--border)] bg-[var(--panel-soft)] text-sm text-[var(--muted)] transition hover:border-[var(--accent)] hover:text-[var(--text)]"
                      >
                        创建团队
                      </button>
                    )}
                  </Field>
                  <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                    <button disabled={saving} className="h-10 rounded-xl bg-[var(--accent)] px-5 text-sm font-semibold text-white transition hover:bg-[var(--accent-hover)] disabled:opacity-60">
                      {saving ? (boardDraft.id ? "保存中" : "创建中") : boardDraft.id ? "保存" : "创建"}
                    </button>
                    <button type="button" onClick={resetBoardDraft} className="h-10 rounded-xl border border-[var(--border)] px-4 text-sm font-semibold transition hover:bg-[var(--hover)]">
                      清空
                    </button>
                  </div>
                </form>
              </Panel>

              <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
                <BoardMetric label="看板" value={boards.length} />
                <BoardMetric label="已关联团队" value={boards.filter((board) => (board.teamIds?.length ?? 0) > 0).length} />
                <BoardMetric label="显式授权" value={summary.explicitUsers} />
              </div>
            </section>

            <Panel title="看板列表" count={filteredBoards.length}>
              <SearchInput value={boardQuery} onChange={setBoardQuery} placeholder="搜索看板、说明、拥有者" />
              <div className="mt-4 max-h-[780px] space-y-3 overflow-y-auto pr-1">
                {filteredBoards.map((board) => {
                  const active = selectedBoard?.id === board.id;
                  const teamCount = board.teamIds?.length ?? 0;
                  return (
                    <button
                      key={board.id}
                      type="button"
                      onClick={() => {
                        setSelectedBoardId(board.id);
                        setBoardTeamDraft(board.teamIds ?? []);
                      }}
                      className={`group w-full rounded-2xl border p-4 text-left shadow-sm transition ${
                        active
                          ? "border-[var(--accent)] bg-[linear-gradient(135deg,var(--accent-soft),var(--panel))] shadow-[0_18px_40px_rgba(15,118,110,0.14)]"
                          : "border-[var(--border)] bg-[var(--panel-soft)] hover:border-[var(--accent)]/30 hover:bg-[var(--hover)]"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-base font-semibold">{board.name}</p>
                          <p className="mt-1 line-clamp-2 text-sm leading-5 text-[var(--muted)]">{board.description || "无说明"}</p>
                        </div>
                        <span className="grid h-11 min-w-11 place-items-center rounded-xl border border-[var(--border)] bg-[var(--panel)] px-2 text-center text-xs font-semibold text-[var(--text)]">
                          <span className="text-base leading-4">{teamCount}</span>
                          <span className="text-[10px] leading-3 text-[var(--muted)]">团队</span>
                        </span>
                      </div>
                      <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-[var(--muted)]">
                        <span className="rounded-lg bg-[var(--panel)] px-2.5 py-1">@{board.ownerUsername}</span>
                        <span className="rounded-lg bg-[var(--panel)] px-2.5 py-1">{board.members.length} 授权</span>
                      </div>
                    </button>
                  );
                })}
                {filteredBoards.length === 0 ? <EmptyState text="暂无看板" /> : null}
              </div>
            </Panel>

            <section className="rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-5 shadow-sm">
              {selectedBoard ? (
                <div className="space-y-5">
                  <div className="rounded-2xl border border-[var(--border)] bg-[linear-gradient(135deg,var(--panel-soft),var(--panel))] p-5">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-[var(--accent)]">当前看板</p>
                        <h2 className="mt-2 truncate text-2xl font-semibold">{selectedBoard.name}</h2>
                        <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--muted)]">{selectedBoard.description || "无说明"}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => editBoard(selectedBoard)}
                          className="h-10 rounded-xl border border-[var(--border)] bg-[var(--panel)] px-4 text-sm font-semibold transition hover:bg-[var(--hover)]"
                        >
                          编辑
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setConfirmState({
                              title: "删除看板",
                              message: `删除看板「${selectedBoard.name}」后，该看板下的项目、任务、拆解和活动记录都会被一并删除。`,
                              tone: "danger",
                              actionLabel: "删除看板",
                              onConfirm: async () => {
                                await deleteBoard(selectedBoard);
                                setConfirmState(null);
                              },
                            })
                          }
                          className="h-10 rounded-xl border border-[var(--danger)]/25 bg-[var(--danger-soft)] px-4 text-sm font-semibold text-[var(--danger)] transition hover:opacity-90"
                        >
                          删除
                        </button>
                      </div>
                    </div>
                    <div className="mt-5 grid gap-3 sm:grid-cols-4">
                      <BoardMetric label="拥有者" value={selectedBoardOwner?.displayName || selectedBoard.ownerUsername} compact />
                      <BoardMetric label="团队" value={selectedBoardTeams.length} compact />
                      <BoardMetric label="团队成员" value={selectedBoardTeamMemberCount} compact />
                      <BoardMetric label="显式授权" value={selectedBoardExplicitCount} compact />
                    </div>
                  </div>

                  <div className="grid gap-5 2xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
                    <div className="space-y-4 rounded-2xl border border-[var(--border)] bg-[var(--panel-soft)] p-4">
                      <div className="flex items-center justify-between gap-3">
                        <h3 className="font-semibold">关联团队</h3>
                        <button onClick={() => void saveBoardTeams()} className="h-9 rounded-xl bg-[var(--accent)] px-4 text-xs font-semibold text-white transition hover:bg-[var(--accent-hover)]">
                          保存
                        </button>
                      </div>
                      {teamOptions.length > 0 ? (
                        <SharedSearchMultiSelect
                          value={boardTeamDraft}
                          options={teamOptions}
                          onChange={setBoardTeamDraft}
                          placeholder="搜索团队"
                          summaryLabel="团队"
                          searchPlaceholder="搜索团队"
                        />
                      ) : (
                        <button
                          type="button"
                          onClick={() => setActiveTab("teams")}
                          className="h-11 w-full rounded-xl border border-dashed border-[var(--border)] bg-[var(--panel)] text-sm text-[var(--muted)] transition hover:border-[var(--accent)] hover:text-[var(--text)]"
                        >
                          创建团队
                        </button>
                      )}
                      <div className="space-y-2">
                        {selectedBoardTeams.map((team) => (
                          <div key={team.id} className="flex items-start gap-3 rounded-xl border border-[var(--border)] bg-[var(--panel)] px-3 py-3">
                            <span className="mt-1 h-3 w-3 rounded-full" style={{ backgroundColor: team.color }} />
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-semibold">{team.name}</p>
                              <p className="mt-1 text-xs text-[var(--muted)]">{team.memberCount} 人 · {team.ownerUsername}</p>
                            </div>
                          </div>
                        ))}
                        {selectedBoardTeams.length === 0 ? (
                          <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--panel)] px-3 py-6 text-center text-sm text-[var(--muted)]">
                            未关联团队
                          </div>
                        ) : null}
                      </div>
                    </div>

                    <div className="rounded-2xl border border-[var(--border)] bg-[var(--panel-soft)] p-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <h3 className="font-semibold">授权用户</h3>
                        <div className="w-full sm:w-[280px]">
                          <SearchInput value={memberQuery} onChange={setMemberQuery} placeholder="搜索授权用户" />
                        </div>
                      </div>
                      <div className="mt-4 max-h-[620px] space-y-2 overflow-y-auto pr-1">
                        {selectedBoardMembers.map(({ user, owner, explicit }) => (
                          <div
                            key={user.id}
                            className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-3 transition ${
                              owner || explicit
                                ? "border-[var(--accent)]/20 bg-[var(--panel)]"
                                : "border-[var(--border)] bg-[var(--panel)] opacity-80 hover:opacity-100"
                            }`}
                          >
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold">{user.displayName || user.username}</p>
                              <p className="truncate text-xs text-[var(--muted)]">@{user.username} · {roleLabels[user.role]} · {jobTitleLabel(user.jobTitle)}</p>
                            </div>
                            <div className="flex shrink-0 items-center gap-2">
                              <span
                                className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${
                                  owner
                                    ? "bg-[var(--accent)] text-white"
                                    : explicit
                                      ? "bg-[var(--accent-soft)] text-[var(--accent)]"
                                      : "bg-[var(--panel-soft)] text-[var(--muted)]"
                                }`}
                              >
                                {owner ? "拥有者" : explicit ? "已授权" : "未授权"}
                              </span>
                              {!owner ? (
                                <SmallButton onClick={() => void grant(selectedBoard.id, user.id, explicit ? "revoke" : "grant")}>
                                  {explicit ? "取消" : "授权"}
                                </SmallButton>
                              ) : null}
                            </div>
                          </div>
                        ))}
                        {selectedBoardMembers.length === 0 ? <EmptyState text="暂无用户" /> : null}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <EmptyState text="选择看板" />
              )}
            </section>
          </div>
        ) : null}

        {currentTab === "audit" ? (
          <div className="mt-5">
            <Panel title="审计日志" count={filteredAuditLogs.length}>
              <SearchInput value={auditQuery} onChange={setAuditQuery} placeholder="搜索用户、动作、对象、IP、Request ID" />
              <div className="mt-4 overflow-hidden rounded-xl border border-[var(--border)]">
                <div className="grid grid-cols-[150px_160px_180px_minmax(0,1fr)_120px] gap-3 border-b border-[var(--border)] bg-[var(--panel-soft)] px-4 py-3 text-xs font-semibold text-[var(--muted)]">
                  <span>时间</span>
                  <span>用户</span>
                  <span>动作</span>
                  <span>说明</span>
                  <span>结果</span>
                </div>
                <div className="divide-y divide-[var(--border)]">
                  {filteredAuditLogs.map((item) => (
                    <div key={item.id} className="grid grid-cols-[150px_160px_180px_minmax(0,1fr)_120px] gap-3 px-4 py-3 text-sm">
                      <span className="text-[var(--muted)]">{formatAuditTime(item.createdAt)}</span>
                      <span className="min-w-0">
                        <span className="block truncate font-semibold text-[var(--text)]">{item.actorUsername || "-"}</span>
                        <span className="block truncate text-xs text-[var(--muted)]">{item.actorRole || "-"}</span>
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{item.action}</span>
                        <span className="block truncate text-xs text-[var(--muted)]">{item.resourceType}{item.resourceId ? ` · ${item.resourceId}` : ""}</span>
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate">{item.message || "-"}</span>
                        <span className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-[var(--muted)]">
                          <span className="rounded-full border border-[var(--border)] bg-[var(--panel-soft)] px-2 py-0.5">
                            IP {item.ipAddress || "-"}
                          </span>
                          <span className="rounded-full border border-[var(--border)] bg-[var(--panel-soft)] px-2 py-0.5">
                            Request ID {item.requestId || "-"}
                          </span>
                        </span>
                      </span>
                      <span className={`h-fit w-fit rounded-full px-2.5 py-1 text-xs font-semibold ${item.result === "success" ? "bg-[var(--accent-soft)] text-[var(--accent)]" : "bg-[var(--danger-soft)] text-[var(--danger)]"}`}>
                        {item.result === "success" ? "成功" : "失败"}
                      </span>
                    </div>
                  ))}
                  {filteredAuditLogs.length === 0 ? <EmptyState text="暂无审计记录" /> : null}
                </div>
              </div>
            </Panel>
          </div>
        ) : null}
      </section>
      {confirmState ? (
        <ConfirmDialog
          title={confirmState.title}
          message={confirmState.message}
          tone={confirmState.tone}
          actionLabel={confirmState.actionLabel}
          onClose={() => setConfirmState(null)}
          onConfirm={() => void confirmState.onConfirm()}
        />
      ) : null}
      <style>{`
        .field {
          height: 2.75rem;
          width: 100%;
          border-radius: 0.75rem;
          border: 1px solid var(--border);
          background: var(--input);
          padding: 0 0.75rem;
          outline: none;
        }
        .field:focus {
          border-color: var(--accent);
        }
      `}</style>
    </main>
  );
}

function formatAuditTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--panel)] px-5 py-4 shadow-sm">
      <p className="text-sm text-[var(--muted)]">{label}</p>
      <p className="mt-2 text-3xl font-semibold">{value}</p>
    </div>
  );
}

function BoardMetric({ label, value, compact = false }: { label: string; value: number | string; compact?: boolean }) {
  return (
    <div className={`rounded-2xl border border-[var(--border)] bg-[var(--panel)] shadow-sm ${compact ? "px-3 py-3" : "px-4 py-4"}`}>
      <p className="text-xs font-medium text-[var(--muted)]">{label}</p>
      <p className={`${compact ? "mt-1 truncate text-base" : "mt-2 text-2xl"} font-semibold text-[var(--text)]`}>{value}</p>
    </div>
  );
}

function Panel({ title, count, children }: { title: string; count?: number; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-[var(--border)] bg-[var(--panel)] p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">{title}</h2>
        {typeof count === "number" ? (
          <span className="rounded-full bg-[var(--tag-bg)] px-3 py-1 text-xs font-semibold text-[var(--text)]">{count}</span>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-2 text-sm">
      <span className="font-medium text-[var(--muted)]">{label}</span>
      {children}
    </label>
  );
}

function SearchInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <div className="relative">
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="field pr-10"
      />
      {value ? (
        <button
          type="button"
          onClick={() => onChange("")}
          className="absolute right-2 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-lg text-sm text-[var(--muted)] hover:bg-[var(--hover)]"
        >
          ×
        </button>
      ) : null}
    </div>
  );
}

function SearchSelect({
  value,
  options,
  onChange,
  placeholder,
}: {
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  placeholder: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement | null>(null);
  const selected = options.find((option) => option.value === value);
  const filtered = options.filter((option) => matchesOption(option, query));

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      window.addEventListener("mousedown", handlePointerDown);
      return () => window.removeEventListener("mousedown", handlePointerDown);
    }
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="field flex items-center justify-between text-left text-sm"
      >
        <span className={selected ? "text-[var(--text)]" : "text-[var(--muted)]"}>{selected?.label ?? placeholder}</span>
        <span className="text-[var(--muted)]">⌄</span>
      </button>
      {open ? (
        <div className="absolute z-30 mt-2 w-full rounded-xl border border-[var(--border)] bg-[var(--panel)] p-2 shadow-xl">
          <SearchInput value={query} onChange={setQuery} placeholder="搜索" />
          <div className="mt-2 max-h-[240px] overflow-y-auto">
            {filtered.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                  setQuery("");
                }}
                className="block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-[var(--hover)]"
              >
                <span className="font-medium">{option.label}</span>
                {option.meta ? <span className="ml-2 text-xs text-[var(--muted)]">{option.meta}</span> : null}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function UserCard({
  user,
  canManage,
  onEdit,
  onReset,
  onDelete,
}: {
  user: ManagedUser;
  canManage: boolean;
  onEdit: () => void;
  onReset: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--panel-soft)] p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-semibold">{user.displayName || user.username}</p>
          <p className="truncate text-xs text-[var(--muted)]">@{user.username}</p>
          {user.phone ? <p className="mt-1 truncate text-xs text-[var(--muted)]">{user.phone}</p> : null}
          <p className="mt-2 text-xs text-[var(--muted)]">
            {roleLabels[user.role]} · {jobTitleLabel(user.jobTitle)} · {timezoneLabel(user.timezone)}
          </p>
          {user.techStacks.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {user.techStacks.slice(0, 4).map((item) => (
                <span key={item} className="rounded-full bg-[var(--tag-bg)] px-2 py-0.5 text-[11px] font-medium text-[var(--text)]">
                  {item}
                </span>
              ))}
              {user.techStacks.length > 4 ? (
                <span className="rounded-full bg-[var(--panel)] px-2 py-0.5 text-[11px] text-[var(--muted)]">+{user.techStacks.length - 4}</span>
              ) : null}
            </div>
          ) : null}
        </div>
        <span className={`rounded-full px-2.5 py-1 text-xs ${user.isActive ? "bg-[var(--tag-bg)]" : "bg-[var(--danger-soft)] text-[var(--danger)]"}`}>
          {user.isActive ? "启用" : "停用"}
        </span>
      </div>
      {canManage ? (
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <SmallButton onClick={onEdit}>编辑</SmallButton>
          <SmallButton onClick={onReset}>重置密码</SmallButton>
          <SmallButton onClick={onDelete}>停用</SmallButton>
        </div>
      ) : null}
    </div>
  );
}

function SmallButton({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-lg border border-[var(--border)] bg-[var(--panel)] px-3 py-1.5 text-xs font-semibold transition hover:bg-[var(--hover)]"
    >
      {children}
    </button>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="grid min-h-[180px] place-items-center rounded-xl border border-dashed border-[var(--border)] bg-[var(--panel-soft)] text-sm text-[var(--muted)]">
      {text}
    </div>
  );
}

function matchesOption(option: SelectOption, query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;
  return [option.label, option.meta ?? "", option.value].some((value) => value.toLowerCase().includes(normalized));
}
