"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { isThemeId, themePresets, timezoneLabel, timezoneOptions, type ThemeId } from "@/lib/ui-options";
import type {
  AdminPermissions,
  BoardSummary,
  CurrentUser,
  ManagedUser,
  TeamMemberSummary,
  TeamSummary,
  UserRole,
} from "@/lib/auth-models";

type TabId = "overview" | "users" | "teams" | "boards";

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

type SelectOption = {
  value: string;
  label: string;
  meta?: string;
};

const defaultPermissions: AdminPermissions = {
  canManageUsers: false,
  canCreateSuperAdmin: false,
  canManageAllBoards: false,
};

const roleLabels: Record<UserRole, string> = {
  super_admin: "超级管理员",
  project_manager: "项目经理",
  team_member: "团队成员",
};

const defaultUserDraft = {
  id: "",
  username: "",
  displayName: "",
  role: "team_member" as UserRole,
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

export default function AdminApp({ currentUser }: { currentUser: CurrentUser }) {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [assignableUsers, setAssignableUsers] = useState<TeamMemberSummary[]>([]);
  const [teams, setTeams] = useState<TeamSummary[]>([]);
  const [boards, setBoards] = useState<AdminBoard[]>([]);
  const [permissions, setPermissions] = useState<AdminPermissions>(defaultPermissions);
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [message, setMessage] = useState("");
  const [userQuery, setUserQuery] = useState("");
  const [teamQuery, setTeamQuery] = useState("");
  const [boardQuery, setBoardQuery] = useState("");
  const [memberQuery, setMemberQuery] = useState("");
  const [selectedBoardId, setSelectedBoardId] = useState("");
  const [userDraft, setUserDraft] = useState(defaultUserDraft);
  const [teamDraft, setTeamDraft] = useState(defaultTeamDraft);
  const [boardTeamDraft, setBoardTeamDraft] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [themeId, setThemeId] = useState<ThemeId>(() => {
    if (typeof window === "undefined") return "notion";
    const savedTheme = window.localStorage.getItem("kanban-theme");
    return isThemeId(savedTheme) ? savedTheme : "notion";
  });
  const initialized = useRef(false);

  async function refresh() {
    const [userPayload, teamPayload, boardRows] = await Promise.all([
      fetch("/api/admin/users").then((response) => response.json() as Promise<UsersResponse>),
      fetch("/api/admin/teams").then((response) => response.json() as Promise<TeamsResponse>),
      fetch("/api/admin/boards").then((response) => response.json() as Promise<AdminBoard[]>),
    ]);
    setUsers(userPayload.users ?? []);
    setAssignableUsers(teamPayload.assignableUsers ?? userPayload.assignableUsers ?? []);
    setTeams(teamPayload.teams ?? []);
    setPermissions(userPayload.permissions ?? teamPayload.permissions ?? defaultPermissions);
    setBoards(boardRows ?? []);
    const nextBoard = boardRows?.find((board) => board.id === selectedBoardId) ?? boardRows?.[0];
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
      ["overview", "概览"],
      ...(permissions.canManageUsers ? ([["users", "用户"]] as Array<[TabId, string]>) : []),
      ["teams", "团队"],
      ["boards", "看板"],
    ],
    [permissions.canManageUsers]
  );

  const currentTab = activeTab === "users" && !permissions.canManageUsers ? "overview" : activeTab;

  const roleOptions = useMemo<SelectOption[]>(() => {
    const roles: UserRole[] = permissions.canCreateSuperAdmin
      ? ["super_admin", "project_manager", "team_member"]
      : ["team_member"];
    return roles.map((role) => ({ value: role, label: roleLabels[role] }));
  }, [permissions.canCreateSuperAdmin]);

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
        roleLabels[user.role],
        user.role,
        user.timezone,
        timezoneLabel(user.timezone),
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

  const selectedBoard = filteredBoards.find((board) => board.id === selectedBoardId) ?? filteredBoards[0] ?? null;

  const selectedBoardMembers = useMemo(() => {
    if (!selectedBoard) return [];
    const explicitIds = new Set(selectedBoard.members.map((member) => member.user_id));
    const query = memberQuery.trim().toLowerCase();
    return users
      .filter((user) => {
        if (!query) return true;
        const values = [user.username, user.displayName, roleLabels[user.role], timezoneLabel(user.timezone)];
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
  }

  function editUser(user: ManagedUser) {
    setUserDraft({
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      role: user.role,
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
    if (!window.confirm(`停用用户「${user.displayName || user.username}」？`)) return;
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

  async function deleteTeam(team: TeamSummary) {
    if (!window.confirm(`删除团队「${team.name}」？`)) return;
    const response = await fetch(`/api/admin/teams/${team.id}`, { method: "DELETE" });
    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    setMessage(response.ok ? "团队已删除" : payload.error ?? "删除失败");
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
            <Link href="/" className="rounded-xl bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[var(--accent-hover)]">
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
            className="ml-auto inline-flex h-10 items-center rounded-xl border border-[var(--border)] bg-[var(--panel)] px-4 text-sm font-semibold text-[var(--text)] transition hover:bg-[var(--hover)]"
          >
            工作饱和度
          </Link>
        </div>

        {message ? <div className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--panel)] px-4 py-3 text-sm">{message}</div> : null}

        {currentTab === "overview" ? (
          <div className="mt-5 grid gap-4 md:grid-cols-3 xl:grid-cols-6">
            <SummaryCard label="用户" value={summary.users} />
            <SummaryCard label="启用" value={summary.activeUsers} />
            <SummaryCard label="项目经理" value={summary.projectManagers} />
            <SummaryCard label="团队" value={summary.teams} />
            <SummaryCard label="看板" value={summary.boards} />
            <SummaryCard label="授权" value={summary.explicitUsers} />
          </div>
        ) : null}

        {currentTab === "users" ? (
          <div className="mt-5 grid gap-5 xl:grid-cols-[420px_minmax(0,1fr)]">
            <Panel title={userDraft.id ? "编辑用户" : "创建用户"}>
              {permissions.canManageUsers ? (
                <form onSubmit={saveUser} className="space-y-4">
                  <Field label="用户名">
                    <input
                      value={userDraft.username}
                      onChange={(event) => setUserDraft((current) => ({ ...current, username: event.target.value }))}
                      pattern="[A-Za-z0-9]+"
                      disabled={Boolean(userDraft.id)}
                      className="field"
                      placeholder="例如 zhangsan01"
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
                  <Field label="角色">
                    <SearchSelect
                      value={userDraft.role}
                      options={roleOptions}
                      onChange={(value) => setUserDraft((current) => ({ ...current, role: value as UserRole }))}
                      placeholder="选择角色"
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
                      {saving ? "保存中" : "保存"}
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
              <SearchInput value={userQuery} onChange={setUserQuery} placeholder="搜索用户、姓名、角色、时区" />
              <div className="mt-4 grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
                {filteredUsers.map((user) => (
                  <UserCard
                    key={user.id}
                    user={user}
                    canManage={permissions.canManageUsers && (currentUser.role === "super_admin" || user.role === "team_member")}
                    onEdit={() => editUser(user)}
                    onReset={() => void resetPassword(user.id)}
                    onDelete={() => void deleteUser(user)}
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
                  <SearchMultiSelect
                    value={teamDraft.memberIds}
                    options={assignableUserOptions}
                    onChange={(memberIds) => setTeamDraft((current) => ({ ...current, memberIds }))}
                    placeholder="搜索成员"
                  />
                </Field>
                <div className="flex gap-2">
                  <button disabled={saving} className="h-10 flex-1 rounded-xl bg-[var(--accent)] text-sm font-semibold text-white disabled:opacity-60">
                    {saving ? "保存中" : "保存"}
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
                      <SmallButton onClick={() => void deleteTeam(team)}>删除</SmallButton>
                    </div>
                  </div>
                ))}
              </div>
            </Panel>
          </div>
        ) : null}

        {currentTab === "boards" ? (
          <div className="mt-5 grid gap-5 xl:grid-cols-[420px_minmax(0,1fr)]">
            <Panel title="看板列表" count={filteredBoards.length}>
              <SearchInput value={boardQuery} onChange={setBoardQuery} placeholder="搜索看板、说明、拥有者" />
              <div className="mt-4 max-h-[760px] space-y-2 overflow-y-auto pr-1">
                {filteredBoards.map((board) => (
                  <button
                    key={board.id}
                    type="button"
                    onClick={() => {
                      setSelectedBoardId(board.id);
                      setBoardTeamDraft(board.teamIds ?? []);
                    }}
                    className={`w-full rounded-xl border p-4 text-left transition ${
                      selectedBoard?.id === board.id
                        ? "border-[var(--accent)] bg-[var(--accent-soft)]"
                        : "border-[var(--border)] bg-[var(--panel-soft)] hover:bg-[var(--hover)]"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-semibold">{board.name}</p>
                        <p className="mt-1 line-clamp-2 text-sm text-[var(--muted)]">{board.description || "无说明"}</p>
                      </div>
                      <span className="rounded-full bg-[var(--panel)] px-2.5 py-1 text-xs text-[var(--muted)]">{board.teamIds?.length ?? 0}</span>
                    </div>
                    <p className="mt-3 text-xs text-[var(--muted)]">{board.ownerUsername}</p>
                  </button>
                ))}
              </div>
            </Panel>

            <Panel title={selectedBoard?.name ?? "看板授权"}>
              {selectedBoard ? (
                <div className="grid gap-5 2xl:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
                  <div className="space-y-4">
                    <Field label="关联团队">
                      {teamOptions.length > 0 ? (
                        <SearchMultiSelect
                          value={boardTeamDraft}
                          options={teamOptions}
                          onChange={setBoardTeamDraft}
                          placeholder="搜索团队"
                        />
                      ) : (
                        <button
                          type="button"
                          onClick={() => setActiveTab("teams")}
                          className="h-11 w-full rounded-xl border border-dashed border-[var(--border)] bg-[var(--panel-soft)] text-sm text-[var(--muted)]"
                        >
                          创建团队
                        </button>
                      )}
                    </Field>
                    <button onClick={() => void saveBoardTeams()} className="h-10 w-full rounded-xl bg-[var(--accent)] text-sm font-semibold text-white">
                      保存团队
                    </button>
                  </div>
                  <div>
                    <SearchInput value={memberQuery} onChange={setMemberQuery} placeholder="搜索授权用户" />
                    <div className="mt-4 max-h-[640px] space-y-2 overflow-y-auto pr-1">
                      {selectedBoardMembers.map(({ user, owner, explicit }) => (
                        <div key={user.id} className="flex items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--panel-soft)] px-4 py-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold">{user.displayName || user.username}</p>
                            <p className="truncate text-xs text-[var(--muted)]">@{user.username} · {roleLabels[user.role]}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="rounded-full bg-[var(--panel)] px-2.5 py-1 text-xs text-[var(--muted)]">
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
                    </div>
                  </div>
                </div>
              ) : (
                <EmptyState text="选择看板" />
              )}
            </Panel>
          </div>
        ) : null}
      </section>
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

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--panel)] px-5 py-4 shadow-sm">
      <p className="text-sm text-[var(--muted)]">{label}</p>
      <p className="mt-2 text-3xl font-semibold">{value}</p>
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
  const selected = options.find((option) => option.value === value);
  const filtered = options.filter((option) => matchesOption(option, query));
  return (
    <div className="relative">
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

function SearchMultiSelect({
  value,
  options,
  onChange,
  placeholder,
}: {
  value: string[];
  options: SelectOption[];
  onChange: (value: string[]) => void;
  placeholder: string;
}) {
  const [query, setQuery] = useState("");
  const selected = options.filter((option) => value.includes(option.value));
  const filtered = options.filter((option) => matchesOption(option, query));
  function toggle(optionValue: string) {
    onChange(value.includes(optionValue) ? value.filter((item) => item !== optionValue) : [...value, optionValue]);
  }
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--input)] p-2">
      <div className="flex flex-wrap gap-2">
        {selected.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => toggle(option.value)}
            className="rounded-lg bg-[var(--accent-soft)] px-2.5 py-1 text-xs font-semibold text-[var(--accent)]"
          >
            {option.label} ×
          </button>
        ))}
        {selected.length > 0 ? (
          <button type="button" onClick={() => onChange([])} className="rounded-lg px-2.5 py-1 text-xs text-[var(--muted)] hover:bg-[var(--hover)]">
            清空
          </button>
        ) : null}
      </div>
      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={placeholder}
        className="mt-2 h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--panel)] px-3 text-sm outline-none focus:border-[var(--accent)]"
      />
      <div className="mt-2 max-h-[220px] overflow-y-auto">
        {filtered.map((option) => {
          const active = value.includes(option.value);
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => toggle(option.value)}
              className={`block w-full rounded-lg px-3 py-2 text-left text-sm transition ${
                active ? "bg-[var(--accent-soft)] text-[var(--accent)]" : "hover:bg-[var(--hover)]"
              }`}
            >
              <span className="font-medium">{option.label}</span>
              {option.meta ? <span className="ml-2 text-xs text-[var(--muted)]">{option.meta}</span> : null}
            </button>
          );
        })}
        {filtered.length === 0 ? <div className="px-3 py-4 text-center text-sm text-[var(--muted)]">无匹配项</div> : null}
      </div>
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
          <p className="mt-2 text-xs text-[var(--muted)]">{roleLabels[user.role]} · {timezoneLabel(user.timezone)}</p>
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
