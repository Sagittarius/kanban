"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import ConfirmDialog, { type ConfirmDialogAction } from "@/components/confirm-dialog";
import { LoadingSkeleton, LoadingStateBadge } from "@/components/loading-hint";
import MemberProfileCard, { MemberProfileAvatar, toMemberProfile } from "@/components/member-profile-card";
import OnboardingGuide from "@/components/onboarding-guide";
import SearchMultiSelect from "@/components/search-multi-select";
import SearchableSelect, { type SearchableSelectOption } from "@/components/searchable-select";
import { clientFetch } from "@/lib/client-observability";
import { canManageKanbanProjects, isSuperAdminRole } from "@/lib/role-permissions";
import { textMatchesSelectQuery } from "@/lib/select-search";
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

type AdminUserDirectoryEntry = {
  id: string;
  username: string;
  displayName: string;
  role: UserRole;
  jobTitle: string;
  isActive: boolean;
};

type AdminTeamOption = {
  id: string;
  name: string;
  color: string;
  ownerUserId: string;
  ownerUsername: string;
  memberCount: number;
};

type UsersResponse = {
  users: ManagedUser[];
  total: number;
  page: number;
  pageSize: number;
  stats: {
    users: number;
    activeUsers: number;
    projectManagers: number;
  };
  assignableUsers: TeamMemberSummary[];
  directoryUsers: AdminUserDirectoryEntry[];
  permissions: AdminPermissions;
};

type TeamsResponse = {
  teams: TeamSummary[];
  total: number;
  page: number;
  pageSize: number;
  stats: {
    teams: number;
  };
  teamOptions: AdminTeamOption[];
  assignableUsers: TeamMemberSummary[];
  permissions: AdminPermissions;
};

type BoardsResponse = {
  boards: AdminBoard[];
  total: number;
  page: number;
  pageSize: number;
  stats: {
    boards: number;
    boardsWithTeams: number;
    explicitUsers: number;
  };
};

type AuditLogsResponse = {
  auditLogs: AuditLogEntry[];
  total: number;
  page: number;
  pageSize: number;
};

type ConfirmState = ConfirmDialogAction | null;
type MessageState = { text: string; tone: "success" | "error" | "info" } | null;

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
    const response = await clientFetch(url, undefined, { operation: "admin.load" });
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

const defaultBoardDraft = {
  id: "",
  name: "",
  description: "",
  ownerUserId: "",
  teamIds: [] as string[],
};

const USER_PAGE_SIZE_OPTIONS = [12, 24, 48, 96];
const TEAM_PAGE_SIZE_OPTIONS = [9, 18, 36, 54];
const BOARD_PAGE_SIZE_OPTIONS = [6, 12, 24, 48];
const AUDIT_PAGE_SIZE_OPTIONS = [20, 40, 80, 120];

export default function AdminApp({ currentUser, initialThemeId = "notion" }: { currentUser: CurrentUser; initialThemeId?: string }) {
  const defaultTeamDraft = useMemo(
    () => ({
      id: "",
      name: "",
      description: "",
      ownerUserId: currentUser.id,
      color: "#0f766e",
      memberIds: [] as string[],
    }),
    [currentUser.id]
  );
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [userDirectory, setUserDirectory] = useState<AdminUserDirectoryEntry[]>([]);
  const [assignableUsers, setAssignableUsers] = useState<TeamMemberSummary[]>([]);
  const [teams, setTeams] = useState<TeamSummary[]>([]);
  const [teamOptionsData, setTeamOptionsData] = useState<AdminTeamOption[]>([]);
  const [boards, setBoards] = useState<AdminBoard[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [permissions, setPermissions] = useState<AdminPermissions>(defaultPermissions);
  const [stats, setStats] = useState({
    users: 0,
    activeUsers: 0,
    projectManagers: 0,
    teams: 0,
    boards: 0,
    boardsWithTeams: 0,
    explicitUsers: 0,
  });
  const [activeTab, setActiveTab] = useState<TabId>("users");
  const [message, setMessage] = useState<MessageState>(null);
  const [userQuery, setUserQuery] = useState("");
  const [teamQuery, setTeamQuery] = useState("");
  const [boardQuery, setBoardQuery] = useState("");
  const [auditQuery, setAuditQuery] = useState("");
  const [memberQuery, setMemberQuery] = useState("");
  const [selectedTeam, setSelectedTeam] = useState<TeamSummary | null>(null);
  const [selectedTeamMember, setSelectedTeamMember] = useState<TeamMemberSummary | null>(null);
  const [selectedBoardId, setSelectedBoardId] = useState("");
  const [userPage, setUserPage] = useState(1);
  const [teamPage, setTeamPage] = useState(1);
  const [boardPage, setBoardPage] = useState(1);
  const [auditPage, setAuditPage] = useState(1);
  const [userPageSize, setUserPageSize] = useState(24);
  const [teamPageSize, setTeamPageSize] = useState(18);
  const [boardPageSize, setBoardPageSize] = useState(12);
  const [auditPageSize, setAuditPageSize] = useState(40);
  const [userTotal, setUserTotal] = useState(0);
  const [teamTotal, setTeamTotal] = useState(0);
  const [boardTotal, setBoardTotal] = useState(0);
  const [auditTotal, setAuditTotal] = useState(0);
  const [userDraft, setUserDraft] = useState(defaultUserDraft);
  const [teamDraft, setTeamDraft] = useState(defaultTeamDraft);
  const [boardDraft, setBoardDraft] = useState(defaultBoardDraft);
  const [boardTeamDraft, setBoardTeamDraft] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [confirmState, setConfirmState] = useState<ConfirmState>(null);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [loadingTeams, setLoadingTeams] = useState(true);
  const [loadingBoards, setLoadingBoards] = useState(true);
  const [loadingAuditLogs, setLoadingAuditLogs] = useState(true);
  const [themeId, setThemeId] = useState<ThemeId>(isThemeId(initialThemeId) ? initialThemeId : "notion");
  const initialized = useRef(false);
  const debouncedUserQuery = useDebouncedValue(userQuery, 220);
  const debouncedTeamQuery = useDebouncedValue(teamQuery, 220);
  const debouncedBoardQuery = useDebouncedValue(boardQuery, 220);
  const debouncedAuditQuery = useDebouncedValue(auditQuery, 220);

  const showMessage = useCallback((text: string, tone: NonNullable<MessageState>["tone"]) => {
    setMessage({ text, tone });
  }, []);

  function clearMessage() {
    setMessage(null);
  }

  const refreshUsers = useCallback(async () => {
    setLoadingUsers(true);
    const errors: string[] = [];
    try {
      const emptyUsers: UsersResponse = {
        users: [],
        total: 0,
        page: 1,
        pageSize: userPageSize,
        stats: { users: 0, activeUsers: 0, projectManagers: 0 },
        assignableUsers: [],
        directoryUsers: [],
        permissions: defaultPermissions,
      };
      const params = new URLSearchParams({
        page: String(userPage),
        pageSize: String(userPageSize),
        ...(debouncedUserQuery.trim() ? { query: debouncedUserQuery.trim() } : {}),
      });
      const userPayload = await fetchAdminJson(`/api/admin/users?${params.toString()}`, emptyUsers, errors, "加载用户失败");
      setUsers(Array.isArray(userPayload.users) ? userPayload.users : []);
      setAssignableUsers(Array.isArray(userPayload.assignableUsers) ? userPayload.assignableUsers : []);
      setUserDirectory(Array.isArray(userPayload.directoryUsers) ? userPayload.directoryUsers : []);
      setPermissions(userPayload.permissions ?? defaultPermissions);
      setUserTotal(Number(userPayload.total ?? 0));
      setStats((current) => ({
        ...current,
        users: Number(userPayload.stats?.users ?? 0),
        activeUsers: Number(userPayload.stats?.activeUsers ?? 0),
        projectManagers: Number(userPayload.stats?.projectManagers ?? 0),
      }));
      if (errors.length > 0) showMessage([...new Set(errors)].join("；"), "error");
    } finally {
      setLoadingUsers(false);
    }
  }, [debouncedUserQuery, showMessage, userPage, userPageSize]);

  const refreshTeams = useCallback(async () => {
    setLoadingTeams(true);
    const errors: string[] = [];
    try {
      const emptyTeams: TeamsResponse = {
        teams: [],
        total: 0,
        page: 1,
        pageSize: teamPageSize,
        stats: { teams: 0 },
        teamOptions: [],
        assignableUsers: [],
        permissions: defaultPermissions,
      };
      const params = new URLSearchParams({
        page: String(teamPage),
        pageSize: String(teamPageSize),
        ...(debouncedTeamQuery.trim() ? { query: debouncedTeamQuery.trim() } : {}),
      });
      const teamPayload = await fetchAdminJson(`/api/admin/teams?${params.toString()}`, emptyTeams, errors, "加载团队失败");
      const teamRows = Array.isArray(teamPayload.teams) ? teamPayload.teams : [];
      setTeams(teamRows);
      setTeamOptionsData(Array.isArray(teamPayload.teamOptions) ? teamPayload.teamOptions : []);
      if ((teamPayload.assignableUsers?.length ?? 0) > 0) {
        setAssignableUsers(teamPayload.assignableUsers);
      }
      setPermissions(teamPayload.permissions ?? defaultPermissions);
      setTeamTotal(Number(teamPayload.total ?? 0));
      setStats((current) => ({
        ...current,
        teams: Number(teamPayload.stats?.teams ?? 0),
      }));
      setSelectedTeam((current) => (current ? teamRows.find((team) => team.id === current.id) ?? null : null));
      if (errors.length > 0) showMessage([...new Set(errors)].join("；"), "error");
    } finally {
      setLoadingTeams(false);
    }
  }, [debouncedTeamQuery, showMessage, teamPage, teamPageSize]);

  const refreshBoards = useCallback(async () => {
    setLoadingBoards(true);
    const errors: string[] = [];
    try {
      const emptyBoards: BoardsResponse = {
        boards: [],
        total: 0,
        page: 1,
        pageSize: boardPageSize,
        stats: { boards: 0, boardsWithTeams: 0, explicitUsers: 0 },
      };
      const params = new URLSearchParams({
        page: String(boardPage),
        pageSize: String(boardPageSize),
        ...(debouncedBoardQuery.trim() ? { query: debouncedBoardQuery.trim() } : {}),
      });
      const boardPayload = await fetchAdminJson(`/api/admin/boards?${params.toString()}`, emptyBoards, errors, "加载看板失败");
      const boardRows = Array.isArray(boardPayload.boards) ? boardPayload.boards : [];
      setBoards(boardRows);
      setBoardTotal(Number(boardPayload.total ?? 0));
      setStats((current) => ({
        ...current,
        boards: Number(boardPayload.stats?.boards ?? 0),
        boardsWithTeams: Number(boardPayload.stats?.boardsWithTeams ?? 0),
        explicitUsers: Number(boardPayload.stats?.explicitUsers ?? 0),
      }));
      const nextBoard = boardRows.find((board) => board.id === selectedBoardId) ?? boardRows[0];
      setSelectedBoardId(nextBoard?.id ?? "");
      setBoardTeamDraft(nextBoard?.teamIds ?? []);
      if (errors.length > 0) showMessage([...new Set(errors)].join("；"), "error");
    } finally {
      setLoadingBoards(false);
    }
  }, [boardPage, boardPageSize, debouncedBoardQuery, selectedBoardId, showMessage]);

  const refreshAuditLogs = useCallback(async () => {
    setLoadingAuditLogs(true);
    const errors: string[] = [];
    try {
      const emptyAuditLogs: AuditLogsResponse = { auditLogs: [], total: 0, page: 1, pageSize: auditPageSize };
      const params = new URLSearchParams({
        page: String(auditPage),
        pageSize: String(auditPageSize),
        ...(debouncedAuditQuery.trim() ? { query: debouncedAuditQuery.trim() } : {}),
      });
      const auditPayload = await fetchAdminJson(`/api/admin/audit-logs?${params.toString()}`, emptyAuditLogs, errors, "加载审计日志失败");
      setAuditLogs(Array.isArray(auditPayload.auditLogs) ? auditPayload.auditLogs : []);
      setAuditTotal(Number(auditPayload.total ?? 0));
      if (errors.length > 0) showMessage([...new Set(errors)].join("；"), "error");
    } finally {
      setLoadingAuditLogs(false);
    }
  }, [auditPage, auditPageSize, debouncedAuditQuery, showMessage]);

  const refreshAll = useCallback(async () => {
    await Promise.all([refreshUsers(), refreshTeams(), refreshBoards(), refreshAuditLogs()]);
  }, [refreshAuditLogs, refreshBoards, refreshTeams, refreshUsers]);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    void refreshAll();
  }, [refreshAll]);

  useEffect(() => {
    if (!initialized.current) return;
    void refreshUsers();
  }, [refreshUsers]);

  useEffect(() => {
    if (!initialized.current) return;
    void refreshTeams();
  }, [refreshTeams]);

  useEffect(() => {
    if (!initialized.current) return;
    void refreshBoards();
  }, [refreshBoards]);

  useEffect(() => {
    if (!initialized.current) return;
    void refreshAuditLogs();
  }, [refreshAuditLogs]);

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
  const loadingAdmin = loadingUsers || loadingTeams || loadingBoards || loadingAuditLogs;
  const loadingStats = loadingAdmin && stats.users === 0 && stats.teams === 0 && stats.boards === 0 && stats.explicitUsers === 0;
  const loadingUserList = loadingUsers && users.length === 0;
  const loadingTeamList = loadingTeams && teams.length === 0;
  const loadingBoardList = loadingBoards && boards.length === 0;
  const loadingAuditList = loadingAuditLogs && auditLogs.length === 0;

  const roleOptions = useMemo<SearchableSelectOption[]>(() => {
    const roles: UserRole[] =
      currentUser.role === "super_admin"
        ? ["super_admin", "project_manager", "development_manager", "team_member"]
        : ["team_member"];
    return roles.map((role) => ({ value: role, label: roleLabels[role] }));
  }, [currentUser.role]);

  const jobTitleSelectOptions = useMemo<SearchableSelectOption[]>(
    () => jobTitleOptions.map((option) => ({ value: option.value, label: option.label })),
    []
  );

  const timezoneSelectOptions = useMemo<SearchableSelectOption[]>(
    () => timezoneOptions.map(([value, label]) => ({ value, label })),
    []
  );

  const assignableUserOptions = useMemo<SearchableSelectOption[]>(
    () =>
      assignableUsers.map((user) => ({
        value: user.id,
        label: user.displayName || user.username,
        meta: `${roleLabels[user.role]} · @${user.username}`,
      })),
    [assignableUsers]
  );

  const boardOwnerOptions = useMemo<SearchableSelectOption[]>(
    () =>
      userDirectory
        .filter((user) => user.isActive && canManageKanbanProjects(user.role))
        .map((user) => ({
          value: user.id,
          label: user.displayName || user.username,
          meta: `${roleLabels[user.role]} · @${user.username}`,
        })),
    [userDirectory]
  );

  const teamOptions = useMemo<SearchableSelectOption[]>(
    () =>
      teamOptionsData.map((team) => ({
        value: team.id,
        label: team.name,
        meta: `${team.memberCount} 人 · ${team.ownerUsername}`,
      })),
    [teamOptionsData]
  );

  const teamOwnerOptions = useMemo<SearchableSelectOption[]>(() => {
    const base = assignableUsers
      .filter((user) => user.role === "project_manager" || user.role === "development_manager")
      .map((user) => ({
        value: user.id,
        label: user.displayName || user.username,
        meta: `${roleLabels[user.role]} · @${user.username}`,
      }));
    if (!teamDraft.id || !teamDraft.ownerUserId || base.some((option) => option.value === teamDraft.ownerUserId)) {
      return base;
    }
    const owner = userDirectory.find((user) => user.id === teamDraft.ownerUserId);
    if (!owner) return base;
    return [
      {
        value: owner.id,
        label: owner.displayName || owner.username,
        meta: `${roleLabels[owner.role]} · @${owner.username}`,
      },
      ...base,
    ];
  }, [assignableUsers, teamDraft.id, teamDraft.ownerUserId, userDirectory]);

  const memberById = useMemo(() => {
    const map = new Map<string, TeamMemberSummary>();
    for (const user of assignableUsers) map.set(user.id, user);
    for (const user of users) {
      map.set(user.id, {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        role: user.role,
        avatarKey: user.avatarKey,
        jobTitle: user.jobTitle,
        techStacks: user.techStacks,
        phone: user.phone,
      });
    }
    return map;
  }, [assignableUsers, users]);

  const selectedBoard = boards.find((board) => board.id === selectedBoardId) ?? boards[0] ?? null;
  const teamById = useMemo(() => new Map(teamOptionsData.map((team) => [team.id, team])), [teamOptionsData]);
  const selectedBoardTeams = useMemo(
    () => (selectedBoard?.teamIds ?? []).map((teamId) => teamById.get(teamId)).filter((team): team is AdminTeamOption => Boolean(team)),
    [selectedBoard, teamById]
  );
  const selectedBoardExplicitCount = selectedBoard?.members.length ?? 0;
  const selectedBoardTeamMemberCount = selectedBoardTeams.reduce((sum, team) => sum + team.memberCount, 0);

  const selectedBoardMembers = useMemo(() => {
    if (!selectedBoard) return [];
    const explicitIds = new Set(selectedBoard.members.map((member) => member.user_id));
    const query = memberQuery.trim();
    return userDirectory
      .filter((user) => {
        if (!query) return true;
        const values = [user.username, user.displayName, roleLabels[user.role], jobTitleLabel(user.jobTitle)];
        return values.some((value) => textMatchesSelectQuery(value, query));
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
  }, [memberQuery, selectedBoard, userDirectory]);

  function changeTheme(nextTheme: ThemeId) {
    setThemeId(nextTheme);
    window.localStorage.setItem("kanban-theme", nextTheme);
    document.cookie = `kanban_theme=${nextTheme}; path=/; max-age=31536000; samesite=lax`;
    window.dispatchEvent(new CustomEvent("kanban:theme-change", { detail: { themeId: nextTheme } }));
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
    clearMessage();
    const method = userDraft.id ? "PATCH" : "POST";
    const url = userDraft.id ? `/api/admin/users/${userDraft.id}` : "/api/admin/users";
    const response = await clientFetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(userDraft),
    });
    const payload = (await response.json().catch(() => ({}))) as ManagedUser & { error?: string };
    setSaving(false);
    if (!response.ok) {
      showMessage(payload.error ?? "保存失败", "error");
      return;
    }
    showMessage(userDraft.id ? "用户已保存" : `用户 ${payload.username} 已创建，默认密码为 ${payload.username}@123`, "success");
    resetUserDraft();
    await Promise.all([refreshUsers(), refreshTeams(), refreshBoards()]);
  }

  async function deleteUser(user: ManagedUser) {
    const response = await clientFetch(`/api/admin/users/${user.id}`, { method: "DELETE" }, { operation: "admin.users.delete" });
    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    showMessage(response.ok ? "用户已停用" : payload.error ?? "停用失败", response.ok ? "success" : "error");
    await Promise.all([refreshUsers(), refreshTeams(), refreshBoards()]);
  }

  async function resetPassword(userId: string) {
    const response = await clientFetch(`/api/admin/users/${userId}/reset-password`, { method: "POST" }, { operation: "admin.users.password.reset" });
    const payload = (await response.json().catch(() => ({}))) as { username?: string; password?: string; error?: string };
    showMessage(payload.password ? `${payload.username} 的密码已重置为：${payload.password}` : payload.error ?? "重置失败", payload.password ? "success" : "error");
  }

  function editTeam(team: TeamSummary) {
    setTeamDraft({
      id: team.id,
      name: team.name,
      description: team.description,
      ownerUserId: team.ownerUserId,
      color: team.color,
      memberIds: team.memberIds,
    });
    setActiveTab("teams");
  }

  function canManageTeam(team: TeamSummary) {
    return isSuperAdminRole(currentUser.role) || team.ownerUserId === currentUser.id;
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
    clearMessage();
    const method = teamDraft.id ? "PATCH" : "POST";
    const url = teamDraft.id ? `/api/admin/teams/${teamDraft.id}` : "/api/admin/teams";
    const response = await clientFetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(teamDraft),
    });
    const payload = (await response.json().catch(() => ({}))) as TeamSummary & { error?: string };
    setSaving(false);
    if (!response.ok) {
      showMessage(payload.error ?? "保存失败", "error");
      return;
    }
    showMessage(teamDraft.id ? "团队已保存" : "团队已创建", "success");
    resetTeamDraft();
    await Promise.all([refreshTeams(), refreshBoards()]);
  }

  async function saveBoard(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    clearMessage();
    const method = boardDraft.id ? "PATCH" : "POST";
    const url = boardDraft.id ? `/api/boards/${boardDraft.id}` : "/api/boards";
    const response = await clientFetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(boardDraft),
    });
    const payload = (await response.json().catch(() => ({}))) as BoardSummary & { error?: string };
    setSaving(false);
    if (!response.ok) {
      showMessage(payload.error ?? "保存失败", "error");
      return;
    }
    showMessage(boardDraft.id ? `看板「${payload.name}」已保存` : `看板「${payload.name}」已创建`, "success");
    setBoardDraft(defaultBoardDraft);
    setSelectedBoardId(payload.id);
    setBoardTeamDraft(payload.teamIds ?? []);
    await refreshBoards();
  }

  async function deleteTeam(team: TeamSummary) {
    const response = await clientFetch(`/api/admin/teams/${team.id}`, { method: "DELETE" }, { operation: "admin.teams.delete" });
    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    showMessage(response.ok ? "团队已删除" : payload.error ?? "删除失败", response.ok ? "success" : "error");
    await Promise.all([refreshTeams(), refreshBoards()]);
  }

  async function deleteBoard(board: AdminBoard) {
    const response = await clientFetch(`/api/boards/${board.id}`, { method: "DELETE" }, { operation: "admin.boards.delete" });
    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    showMessage(response.ok ? "看板已删除" : payload.error ?? "删除失败", response.ok ? "success" : "error");
    await refreshBoards();
  }

  async function grant(boardId: string, userId: string, action: "grant" | "revoke") {
    const response = await clientFetch(`/api/admin/boards/${boardId}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, action }),
    });
    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    showMessage(response.ok ? "授权已更新" : payload.error ?? "保存授权失败", response.ok ? "success" : "error");
    await refreshBoards();
  }

  async function saveBoardTeams() {
    if (!selectedBoard) return;
    const response = await clientFetch(`/api/boards/${selectedBoard.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: selectedBoard.name,
        description: selectedBoard.description,
        teamIds: boardTeamDraft,
      }),
    });
    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    showMessage(response.ok ? "看板团队已保存" : payload.error ?? "保存失败", response.ok ? "success" : "error");
    await refreshBoards();
  }

  return (
    <main data-theme={themeId} className="kanban-theme min-h-screen bg-[var(--app-bg)] text-[var(--text)]">
      <OnboardingGuide
        username={currentUser.username}
        role={currentUser.role}
        scope="admin"
        actions={{
          openAdminUsers: () => setActiveTab("users"),
          openAdminTeams: () => setActiveTab("teams"),
          openAdminBoards: () => setActiveTab("boards"),
          goKanban: () => window.location.assign("/"),
        }}
      />
      <header className="border-b border-[var(--border)] bg-[var(--panel)] px-5 py-4">
        <div className="mx-auto flex max-w-[1760px] flex-wrap items-center gap-3">
          <div>
            <h1 className="text-2xl font-semibold">后台管理</h1>
            <p className="mt-1 text-sm text-[var(--muted)]">{currentUser.displayName || currentUser.username}</p>
          </div>
          <LoadingStateBadge active={loadingAdmin} className="ml-2" />
          <div className="ml-auto flex items-center gap-3">
            <SearchableSelect
              value={themeId}
              options={themePresets.map((theme) => ({ value: theme.id, label: theme.label }))}
              onChange={(value) => changeTheme(value as ThemeId)}
              placeholder="配色方案"
              className="min-w-0 flex-1 2xl:w-[180px]"
            />
            {currentUser.role === "super_admin" ? (
              <Link href="/admin/diagnostics" prefetch={false} className="rounded-xl border border-[var(--border)] bg-[var(--panel-muted)] px-4 py-2 text-sm font-semibold text-[var(--text)] transition hover:bg-[var(--hover)]">
                诊断中心
              </Link>
            ) : null}
            <Link href="/" prefetch={false} data-tour="admin-return-kanban" className="rounded-xl bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[var(--accent-hover)]">
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
              data-tour={id === "teams" ? "admin-tab-teams" : id === "boards" ? "admin-tab-boards" : undefined}
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

        {message ? (
          <div
            className={`mt-4 rounded-xl border px-4 py-3 text-sm font-medium shadow-sm ${
              message.tone === "success"
                ? "border-emerald-300/70 bg-emerald-50 text-emerald-700"
                : message.tone === "error"
                  ? "border-rose-300/70 bg-rose-50 text-rose-700"
                  : "border-sky-300/70 bg-sky-50 text-sky-700"
            }`}
          >
            {message.text}
          </div>
        ) : null}

        <div className="sticky top-4 z-10 mt-5 rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-4 shadow-lg backdrop-blur">
          <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
            <SummaryCard label="用户" value={stats.users} loading={loadingStats} />
            <SummaryCard label="启用" value={stats.activeUsers} loading={loadingStats} />
            <SummaryCard label="项目经理" value={stats.projectManagers} loading={loadingStats} />
            <SummaryCard label="团队" value={stats.teams} loading={loadingStats} />
            <SummaryCard label="看板" value={stats.boards} loading={loadingStats} />
            <SummaryCard label="授权" value={stats.explicitUsers} loading={loadingStats} />
          </div>
        </div>

        {currentTab === "users" ? (
          <div className="mt-5 grid gap-5 xl:grid-cols-[420px_minmax(0,1fr)]">
            <Panel title={userDraft.id ? "编辑用户" : "创建用户"} dataTour="admin-users-panel">
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
                    <SearchableSelect
                      value={userDraft.role}
                      options={roleOptions}
                      onChange={(value) => setUserDraft((current) => ({ ...current, role: value as UserRole }))}
                      placeholder="选择角色"
                    />
                  </Field>
                  <Field label="职位">
                    <SearchableSelect
                      value={userDraft.jobTitle}
                      options={jobTitleSelectOptions}
                      onChange={(value) => setUserDraft((current) => ({ ...current, jobTitle: value }))}
                      placeholder="选择职位"
                    />
                  </Field>
                  <Field label="时区">
                    <SearchableSelect
                      value={userDraft.timezone}
                      options={timezoneSelectOptions}
                      onChange={(value) => setUserDraft((current) => ({ ...current, timezone: value }))}
                      placeholder="选择时区"
                    />
                  </Field>
                  <Field label="技术栈">
                  <SearchMultiSelect
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

            <Panel title="用户列表" count={userTotal} loading={loadingUsers}>
              <SearchInput value={userQuery} onChange={(value) => { setUserQuery(value); setUserPage(1); }} placeholder="搜索用户、姓名、手机、角色、时区" />
              <div className="mt-4 grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
                {loadingUserList ? (
                  <AdminCardSkeletonList count={6} />
                ) : users.map((user) => (
                  <UserCard
                    key={user.id}
                    user={user}
                    canManage={permissions.canManageUsers && (isSuperAdminRole(currentUser.role) || !isSuperAdminRole(user.role))}
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
                {!loadingUserList && users.length === 0 ? <EmptyState text="暂无用户" /> : null}
              </div>
              <PaginationBar
                page={userPage}
                total={userTotal}
                pageSize={userPageSize}
                pageSizeOptions={USER_PAGE_SIZE_OPTIONS}
                onChange={setUserPage}
                onPageSizeChange={(value) => {
                  setUserPageSize(value);
                  setUserPage(1);
                }}
                className="mt-4"
              />
            </Panel>
          </div>
        ) : null}

        {currentTab === "teams" ? (
          <div className="mt-5 grid gap-5 xl:grid-cols-[440px_minmax(0,1fr)]">
            <Panel title={teamDraft.id ? "编辑团队" : "创建团队"} dataTour="admin-team-form">
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
                {teamDraft.id ? (
                  <Field label="归属用户">
                    <SearchableSelect
                      value={teamDraft.ownerUserId}
                      options={teamOwnerOptions}
                      onChange={(ownerUserId) => setTeamDraft((current) => ({ ...current, ownerUserId }))}
                      placeholder="选择归属用户"
                    />
                  </Field>
                ) : null}
                <Field label="成员">
                  <div data-tour="admin-team-members">
                    <SearchMultiSelect
                      value={teamDraft.memberIds}
                      options={assignableUserOptions}
                      onChange={(memberIds) => setTeamDraft((current) => ({ ...current, memberIds }))}
                      placeholder="搜索成员"
                    />
                  </div>
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

            <Panel title="团队列表" count={teamTotal} loading={loadingTeams}>
              <SearchInput value={teamQuery} onChange={(value) => { setTeamQuery(value); setTeamPage(1); }} placeholder="搜索团队、说明、拥有者" />
              <div className="mt-4 grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
                {loadingTeamList ? (
                  <AdminCardSkeletonList count={6} />
                ) : teams.map((team) => (
                  <div
                    key={team.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelectedTeam(team)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setSelectedTeam(team);
                      }
                    }}
                    className="cursor-pointer rounded-xl border border-[var(--border)] bg-[var(--panel-soft)] p-4 text-left transition hover:border-[var(--accent)] hover:bg-[var(--panel)]"
                  >
                    <div className="flex items-start gap-3">
                      <span className="mt-1 h-3 w-3 rounded-full" style={{ backgroundColor: team.color }} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold">{team.name}</p>
                        <p className="mt-1 line-clamp-2 text-sm text-[var(--muted)]">{team.description || "无说明"}</p>
                        <p className="mt-2 text-xs text-[var(--muted)]">{team.ownerUsername} · {team.memberCount} 人</p>
                      </div>
                    </div>
                    {canManageTeam(team) ? (
                      <div className="mt-4 flex justify-end gap-2">
                        <SmallButton
                          onClick={() => editTeam(team)}
                        >
                          编辑
                        </SmallButton>
                        <SmallButton
                          onClick={() =>
                            setConfirmState({
                              title: "删除团队",
                              message: `删除团队「${team.name}」后，与该团队绑定的看板关联会同步解除。`,
                              tone: "danger",
                              actionLabel: "删除团队",
                              onConfirm: async () => {
                                await deleteTeam(team);
                                setSelectedTeam(null);
                                setConfirmState(null);
                              },
                            })
                          }
                        >
                          删除
                        </SmallButton>
                      </div>
                    ) : null}
                  </div>
                ))}
                {!loadingTeamList && teams.length === 0 ? <EmptyState text="暂无团队" /> : null}
              </div>
              <PaginationBar
                page={teamPage}
                total={teamTotal}
                pageSize={teamPageSize}
                pageSizeOptions={TEAM_PAGE_SIZE_OPTIONS}
                onChange={setTeamPage}
                onPageSizeChange={(value) => {
                  setTeamPageSize(value);
                  setTeamPage(1);
                }}
                className="mt-4"
              />
            </Panel>
          </div>
        ) : null}

        {currentTab === "boards" ? (
          <div className="mt-5 grid gap-5 xl:grid-cols-[360px_minmax(360px,0.9fr)_minmax(0,1.3fr)]">
            <section className="space-y-5">
              <Panel title={boardDraft.id ? "编辑看板" : "创建看板"} dataTour="admin-board-form">
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
                      <SearchableSelect
                        value={boardDraft.ownerUserId}
                        options={boardOwnerOptions}
                        onChange={(value) => setBoardDraft((current) => ({ ...current, ownerUserId: value }))}
                        placeholder="选择拥有者"
                      />
                    </Field>
                  ) : null}
                  <Field label="关联团队">
                    {teamOptions.length > 0 ? (
                      <div data-tour="admin-board-teams">
                        <SearchMultiSelect
                          value={boardDraft.teamIds}
                          options={teamOptions}
                          onChange={(teamIds) => setBoardDraft((current) => ({ ...current, teamIds }))}
                          placeholder="搜索团队"
                          summaryLabel="团队"
                          searchPlaceholder="搜索团队"
                        />
                      </div>
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
                <BoardMetric label="看板" value={stats.boards} />
                <BoardMetric label="已关联团队" value={stats.boardsWithTeams} />
                <BoardMetric label="显式授权" value={stats.explicitUsers} />
              </div>
            </section>

            <Panel title="看板列表" count={boardTotal} loading={loadingBoards}>
              <SearchInput value={boardQuery} onChange={(value) => { setBoardQuery(value); setBoardPage(1); }} placeholder="搜索看板、说明、拥有者" />
              <div className="mt-4 max-h-[780px] space-y-3 overflow-y-auto pr-1">
                {loadingBoardList ? (
                  <AdminCardSkeletonList count={5} />
                ) : boards.map((board) => {
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
                {!loadingBoardList && boards.length === 0 ? <EmptyState text="暂无看板" /> : null}
              </div>
              <PaginationBar
                page={boardPage}
                total={boardTotal}
                pageSize={boardPageSize}
                pageSizeOptions={BOARD_PAGE_SIZE_OPTIONS}
                onChange={setBoardPage}
                onPageSizeChange={(value) => {
                  setBoardPageSize(value);
                  setBoardPage(1);
                }}
                className="mt-4"
              />
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
                      <BoardMetric label="拥有者" value={selectedBoard.ownerUsername} compact />
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
                        <SearchMultiSelect
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
            <Panel title="审计日志" count={auditTotal} loading={loadingAuditLogs}>
              <SearchInput value={auditQuery} onChange={(value) => { setAuditQuery(value); setAuditPage(1); }} placeholder="搜索账号、姓名、动作、对象、IP、Request ID" />
              <div className="mt-4 overflow-hidden rounded-xl border border-[var(--border)]">
                <div className="grid grid-cols-[150px_160px_180px_minmax(0,1fr)_120px] gap-3 border-b border-[var(--border)] bg-[var(--panel-soft)] px-4 py-3 text-xs font-semibold text-[var(--muted)]">
                  <span>时间</span>
                  <span>用户</span>
                  <span>动作</span>
                  <span>说明</span>
                  <span>结果</span>
                </div>
                <div className="divide-y divide-[var(--border)]">
                  {loadingAuditList ? (
                    <AuditLogSkeletonRows />
                  ) : auditLogs.map((item) => (
                    <div key={item.id} className="grid grid-cols-[150px_160px_180px_minmax(0,1fr)_120px] gap-3 px-4 py-3 text-sm">
                      <span className="text-[var(--muted)]">{formatAuditTime(item.createdAt)}</span>
                      <span className="min-w-0">
                        <span className="block truncate font-semibold text-[var(--text)]">{item.actorDisplayName || item.actorUsername || "-"}</span>
                        <span className="block truncate text-xs text-[var(--muted)]">@{item.actorUsername || "-"}{item.actorRole ? ` · ${item.actorRole}` : ""}</span>
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
                  {!loadingAuditList && auditLogs.length === 0 ? <EmptyState text="暂无审计记录" /> : null}
                </div>
              </div>
              <PaginationBar
                page={auditPage}
                total={auditTotal}
                pageSize={auditPageSize}
                pageSizeOptions={AUDIT_PAGE_SIZE_OPTIONS}
                onChange={setAuditPage}
                onPageSizeChange={(value) => {
                  setAuditPageSize(value);
                  setAuditPage(1);
                }}
                className="mt-4"
              />
            </Panel>
          </div>
        ) : null}
      </section>
      {selectedTeam ? (
        <TeamDetailDialog
          team={selectedTeam}
          members={selectedTeam.memberIds
            .map((memberId) => memberById.get(memberId))
            .filter((member): member is TeamMemberSummary => Boolean(member))}
          canManage={canManageTeam(selectedTeam)}
          onClose={() => setSelectedTeam(null)}
          onSelectMember={setSelectedTeamMember}
          onEdit={() => {
            editTeam(selectedTeam);
            setSelectedTeam(null);
          }}
          onDelete={() =>
            setConfirmState({
              title: "删除团队",
              message: `删除团队「${selectedTeam.name}」后，与该团队绑定的看板关联会同步解除。`,
              tone: "danger",
              actionLabel: "删除团队",
              onConfirm: async () => {
                await deleteTeam(selectedTeam);
                setSelectedTeam(null);
                setConfirmState(null);
              },
            })
          }
        />
      ) : null}
      {selectedTeamMember ? (
        <MemberProfileCard
          member={toMemberProfile(selectedTeamMember)}
          onClose={() => setSelectedTeamMember(null)}
          theme="admin"
          zIndexClass="z-[82]"
        />
      ) : null}
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
          color: var(--text);
          font-size: 0.875rem;
          line-height: 1.25rem;
          outline: none;
        }
        .field::placeholder {
          color: var(--muted);
          font-size: 0.875rem;
          line-height: 1.25rem;
          opacity: 0.72;
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

function SummaryCard({ label, value, loading = false }: { label: string; value: number; loading?: boolean }) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--panel)] px-5 py-4 shadow-sm">
      <p className="text-sm text-[var(--muted)]">{label}</p>
      {loading ? <LoadingSkeleton className="mt-3 h-9 w-20 rounded-lg" /> : <p className="mt-2 text-3xl font-semibold">{value}</p>}
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

function Panel({
  title,
  count,
  children,
  dataTour,
  loading = false,
}: {
  title: string;
  count?: number;
  children: ReactNode;
  dataTour?: string;
  loading?: boolean;
}) {
  return (
    <section data-tour={dataTour} className="rounded-xl border border-[var(--border)] bg-[var(--panel)] p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold">{title}</h2>
          <LoadingStateBadge active={loading} />
        </div>
        {typeof count === "number" ? <span className="rounded-full bg-[var(--tag-bg)] px-3 py-1 text-xs font-semibold text-[var(--text)]">{count}</span> : null}
      </div>
      {children}
    </section>
  );
}

function AdminCardSkeletonList({ count }: { count: number }) {
  return (
    <>
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="rounded-xl border border-[var(--border)] bg-[var(--panel-soft)] p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <LoadingSkeleton className="h-5 w-36 rounded-lg" />
              <LoadingSkeleton className="mt-2 h-3 w-28 rounded-lg" />
              <LoadingSkeleton className="mt-3 h-4 w-4/5 rounded-lg" />
            </div>
            <LoadingSkeleton className="h-7 w-14 rounded-full" />
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <LoadingSkeleton className="h-8 w-14 rounded-lg" />
            <LoadingSkeleton className="h-8 w-16 rounded-lg" />
          </div>
        </div>
      ))}
    </>
  );
}

function AuditLogSkeletonRows() {
  return (
    <>
      {Array.from({ length: 8 }, (_, index) => (
        <div key={index} className="grid grid-cols-[150px_160px_180px_minmax(0,1fr)_120px] gap-3 px-4 py-3">
          <LoadingSkeleton className="h-4 w-24 rounded-lg" />
          <div>
            <LoadingSkeleton className="h-4 w-28 rounded-lg" />
            <LoadingSkeleton className="mt-2 h-3 w-20 rounded-lg" />
          </div>
          <div>
            <LoadingSkeleton className="h-4 w-24 rounded-lg" />
            <LoadingSkeleton className="mt-2 h-3 w-28 rounded-lg" />
          </div>
          <div>
            <LoadingSkeleton className="h-4 w-3/5 rounded-lg" />
            <LoadingSkeleton className="mt-2 h-5 w-4/5 rounded-full" />
          </div>
          <LoadingSkeleton className="h-7 w-14 rounded-full" />
        </div>
      ))}
    </>
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

function PaginationBar({
  page,
  total,
  pageSize,
  pageSizeOptions,
  onChange,
  onPageSizeChange,
  className = "",
}: {
  page: number;
  total: number;
  pageSize: number;
  pageSizeOptions: number[];
  onChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  className?: string;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(page, totalPages);
  const start = total === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const end = Math.min(total, currentPage * pageSize);
  return (
    <div className={`flex flex-wrap items-center justify-between gap-3 ${className}`}>
      <div className="flex flex-wrap items-center gap-3 text-xs text-[var(--muted)]">
        <span>{total > 0 ? `${start}-${end} / ${total}` : "0 / 0"}</span>
        <label className="flex items-center gap-2">
          <span>每页</span>
          <select
            value={pageSize}
            onChange={(event) => onPageSizeChange(Number(event.target.value))}
            className="h-9 rounded-xl border border-[var(--border)] bg-[var(--panel)] px-3 text-xs font-semibold text-[var(--text)] outline-none transition hover:bg-[var(--hover)]"
          >
            {pageSizeOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={currentPage <= 1}
          onClick={() => onChange(Math.max(1, currentPage - 1))}
          className="h-9 rounded-xl border border-[var(--border)] bg-[var(--panel)] px-3 text-xs font-semibold transition hover:bg-[var(--hover)] disabled:cursor-not-allowed disabled:opacity-45"
        >
          上一页
        </button>
        <span className="rounded-xl bg-[var(--tag-bg)] px-3 py-2 text-xs font-semibold text-[var(--text)]">
          {currentPage} / {totalPages}
        </span>
        <button
          type="button"
          disabled={currentPage >= totalPages}
          onClick={() => onChange(Math.min(totalPages, currentPage + 1))}
          className="h-9 rounded-xl border border-[var(--border)] bg-[var(--panel)] px-3 text-xs font-semibold transition hover:bg-[var(--hover)] disabled:cursor-not-allowed disabled:opacity-45"
        >
          下一页
        </button>
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
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
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

function ModalShell({
  children,
  onClose,
  maxWidth = "max-w-[720px]",
  zIndexClass = "z-[70]",
}: {
  children: ReactNode;
  onClose: () => void;
  maxWidth?: string;
  zIndexClass?: string;
}) {
  return (
    <div className={`fixed inset-0 ${zIndexClass} flex items-center justify-center bg-slate-950/36 px-4 py-4 backdrop-blur-[2px]`} onClick={onClose}>
      <div
        className={`relative flex max-h-[calc(100vh-2rem)] w-full flex-col overflow-hidden rounded-[26px] border border-[var(--border)] bg-[var(--panel)] shadow-2xl ${maxWidth}`}
        onClick={(event) => event.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

function useDebouncedValue<T>(value: T, delayMs: number) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [delayMs, value]);

  return debounced;
}

function TeamDetailDialog({
  team,
  members,
  canManage,
  onClose,
  onSelectMember,
  onEdit,
  onDelete,
}: {
  team: TeamSummary;
  members: TeamMemberSummary[];
  canManage: boolean;
  onClose: () => void;
  onSelectMember: (member: TeamMemberSummary) => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <ModalShell onClose={onClose}>
      <div className="flex items-start justify-between gap-4 border-b border-[var(--border)] px-6 py-5">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <span className="h-3.5 w-3.5 rounded-full" style={{ backgroundColor: team.color }} />
            <h3 className="truncate text-xl font-semibold text-[var(--text)]">{team.name}</h3>
          </div>
          <p className="mt-2 text-sm text-[var(--muted)]">{team.ownerUsername} · {team.memberCount} 人</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-[var(--border)] bg-[var(--panel-soft)] text-lg text-[var(--muted)] transition hover:bg-[var(--hover)] hover:text-[var(--text)]"
        >
          ×
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
        <div className="grid gap-3 md:grid-cols-[minmax(0,1.1fr)_minmax(260px,0.9fr)]">
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--panel-soft)] px-4 py-4">
            <div className="text-xs font-medium text-[var(--muted)]">说明</div>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[var(--text)]">{team.description || "无说明"}</p>
          </div>
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--panel-soft)] px-4 py-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <div className="text-xs font-medium text-[var(--muted)]">归属用户</div>
                <div className="mt-2 text-sm font-semibold text-[var(--text)]">{team.ownerUsername}</div>
              </div>
              <div>
                <div className="text-xs font-medium text-[var(--muted)]">最近更新</div>
                <div className="mt-2 text-sm font-semibold text-[var(--text)]">{formatAuditTime(team.updatedAt)}</div>
              </div>
            </div>
          </div>
        </div>
        <div className="mt-5 rounded-2xl border border-[var(--border)] bg-[var(--panel-soft)]">
          <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3">
            <div className="text-sm font-semibold text-[var(--text)]">团队成员</div>
            <span className="rounded-full bg-[var(--tag-bg)] px-2.5 py-1 text-xs font-semibold text-[var(--text)]">{members.length}</span>
          </div>
          <div className="max-h-[min(52vh,28rem)] overflow-y-auto px-4 py-4">
            {members.length > 0 ? (
              <div className="grid gap-2.5">
                {members.map((member) => (
                  <div key={member.id} className="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--panel)] px-3 py-3">
                    <button
                      type="button"
                      onClick={() => onSelectMember(member)}
                      className="shrink-0 cursor-pointer rounded-full transition hover:scale-[1.03] focus:outline-none focus:ring-2 focus:ring-[var(--accent-soft)]"
                      title={`查看${member.displayName || member.username}`}
                    >
                      <MemberProfileAvatar member={toMemberProfile(member)} theme="admin" size={34} />
                    </button>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold text-[var(--text)]">{member.displayName || member.username}</div>
                      <div className="mt-1 flex min-w-0 items-center gap-1.5 text-xs text-[var(--muted)]">
                        <span className="truncate">@{member.username}</span>
                        <span className="shrink-0">·</span>
                        <span className="shrink-0">{jobTitleLabel(member.jobTitle)}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState text="暂无成员" />
            )}
          </div>
        </div>
      </div>
      {canManage ? (
        <div className="flex justify-end gap-2 border-t border-[var(--border)] px-6 py-4">
          <button type="button" onClick={onEdit} className="rounded-xl border border-[var(--border)] bg-[var(--panel-soft)] px-4 py-2 text-sm font-semibold transition hover:bg-[var(--hover)]">
            编辑
          </button>
          <button type="button" onClick={onDelete} className="rounded-xl border border-[var(--border)] bg-[var(--panel-soft)] px-4 py-2 text-sm font-semibold text-[var(--danger)] transition hover:bg-[var(--danger-soft)]">
            删除
          </button>
        </div>
      ) : null}
    </ModalShell>
  );
}
