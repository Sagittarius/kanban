"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Image from "next/image";
import { avatarOptions, timezoneOptions } from "@/lib/ui-options";
import type { BoardSummary, CurrentUser, TeamSummary } from "@/lib/auth-models";

type BoardDraft = {
  name: string;
  description: string;
  teamIds: string[];
};

type TeamsResponse = {
  teams: TeamSummary[];
};

type ShellSelectOption = {
  value: string;
  label: string;
  meta?: string;
};

export default function AuthenticatedShell({
  user,
  boards,
  activeBoardId,
  children,
}: {
  user: CurrentUser;
  boards: BoardSummary[];
  activeBoardId: string;
  children: ReactNode;
}) {
  const [currentUser, setCurrentUser] = useState(user);
  const [boardList, setBoardList] = useState(boards);
  const [menuOpen, setMenuOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [createBoardOpen, setCreateBoardOpen] = useState(false);
  const [editBoardOpen, setEditBoardOpen] = useState(false);
  const [boardPickerOpen, setBoardPickerOpen] = useState(false);
  const [boardQuery, setBoardQuery] = useState("");
  const [teamQuery, setTeamQuery] = useState("");
  const [teamOptions, setTeamOptions] = useState<TeamSummary[]>([]);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingBoard, setSavingBoard] = useState(false);
  const [passwordDraft, setPasswordDraft] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const menuRef = useRef<HTMLDivElement | null>(null);
  const activeBoard = boardList.find((board) => board.id === activeBoardId);
  const readOnly = activeBoard?.role === "viewer";
  const canManageBoard = activeBoard?.role !== "viewer";
  const canUseAdmin = currentUser.role === "super_admin" || currentUser.role === "project_manager";
  const canCreateBoard = canUseAdmin;
  const [profileDraft, setProfileDraft] = useState({
    timezone: user.timezone || "Asia/Shanghai",
    avatarKey: user.avatarKey || avatarOptions[0].key,
  });
  const [boardDraft, setBoardDraft] = useState<BoardDraft>({
    name: activeBoard?.name ?? "",
    description: activeBoard?.description ?? "",
    teamIds: activeBoard?.teamIds ?? [],
  });
  const [newBoardDraft, setNewBoardDraft] = useState<BoardDraft>({
    name: "",
    description: "",
    teamIds: [],
  });

  const filteredBoards = boardList.filter((board) => {
    const query = boardQuery.trim().toLowerCase();
    if (!query) return true;
    return (
      board.name.toLowerCase().includes(query) ||
      board.description.toLowerCase().includes(query) ||
      board.ownerUsername.toLowerCase().includes(query)
    );
  });
  const timezoneSelectOptions: ShellSelectOption[] = timezoneOptions.map(([value, label]) => ({ value, label }));

  useEffect(() => {
    if (!menuOpen) return;

    function handlePointerDown(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
        setBoardPickerOpen(false);
      }
    }

    window.addEventListener("mousedown", handlePointerDown);
    return () => window.removeEventListener("mousedown", handlePointerDown);
  }, [menuOpen]);

  useEffect(() => {
    if (!canUseAdmin) return;
    fetch("/api/admin/teams")
      .then((response) => response.json() as Promise<TeamsResponse>)
      .then((payload) => setTeamOptions(payload.teams ?? []))
      .catch(() => setTeamOptions([]));
  }, [canUseAdmin]);

  async function switchBoard(boardId: string) {
    await fetch(`/api/boards/${boardId}/select`, { method: "POST" });
    setBoardPickerOpen(false);
    window.location.assign("/");
  }

  async function createBoard() {
    if (!newBoardDraft.name.trim()) return;

    setSavingBoard(true);
    const response = await fetch("/api/boards", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newBoardDraft),
    });
    const payload = (await response.json().catch(() => ({}))) as BoardSummary & { error?: string };
    setSavingBoard(false);
    if (!response.ok) {
      window.alert(payload.error ?? "创建看板失败");
      return;
    }
    setCreateBoardOpen(false);
    setNewBoardDraft({ name: "", description: "", teamIds: [] });
    await switchBoard(payload.id);
  }

  async function saveProfile() {
    if (passwordDraft.newPassword || passwordDraft.currentPassword || passwordDraft.confirmPassword) {
      if (passwordDraft.newPassword !== passwordDraft.confirmPassword) {
        window.alert("两次输入的新密码不一致");
        return;
      }
    }

    setSavingProfile(true);
    const response = await fetch("/api/auth/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        timezone: profileDraft.timezone,
        avatarKey: profileDraft.avatarKey,
        currentPassword: passwordDraft.currentPassword,
        newPassword: passwordDraft.newPassword,
      }),
    });
    const payload = (await response.json().catch(() => ({}))) as { user?: CurrentUser; error?: string };
    setSavingProfile(false);
    if (!response.ok || !payload.user) {
      window.alert(payload.error ?? "保存个人设置失败");
      return;
    }
    setCurrentUser(payload.user);
    setPasswordDraft({ currentPassword: "", newPassword: "", confirmPassword: "" });
    setProfileOpen(false);
    window.location.reload();
  }

  async function saveBoard() {
    if (!activeBoard || !boardDraft.name.trim()) return;

    setSavingBoard(true);
    const response = await fetch(`/api/boards/${activeBoard.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(boardDraft),
    });
    const payload = (await response.json().catch(() => ({}))) as BoardSummary & { error?: string };
    setSavingBoard(false);
    if (!response.ok) {
      window.alert(payload.error ?? "保存看板信息失败");
      return;
    }
    setBoardList((current) => current.map((board) => (board.id === payload.id ? payload : board)));
    setEditBoardOpen(false);
    window.location.reload();
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.assign("/");
  }

  return (
    <>
      <div className="fixed right-5 top-5 z-40">
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenuOpen((current) => !current)}
            className="flex h-12 items-center gap-3 rounded-full border border-white/70 bg-white/88 px-3 pr-4 text-sm font-medium text-slate-700 shadow-[0_14px_40px_rgba(15,23,42,0.12)] backdrop-blur transition hover:bg-white"
          >
            <UserAvatar
              src={avatarOptions.find((item) => item.key === currentUser.avatarKey)?.src}
              name={currentUser.displayName || currentUser.username}
            />
            <div className="flex min-w-0 flex-col items-start leading-tight">
              <span className="max-w-[150px] truncate text-sm font-semibold text-slate-900">{currentUser.displayName || currentUser.username}</span>
              <span className="max-w-[150px] truncate text-xs text-slate-500">@{currentUser.username}</span>
            </div>
          </button>

          {menuOpen ? (
            <div className="absolute right-0 top-[calc(100%+12px)] w-[340px] rounded-[24px] border border-white/80 bg-white/96 p-3 shadow-[0_24px_60px_rgba(15,23,42,0.18)] backdrop-blur">
              <div className="flex items-center gap-3 rounded-2xl bg-slate-50 px-3 py-3">
                <UserAvatar
                  src={avatarOptions.find((item) => item.key === currentUser.avatarKey)?.src}
                  name={currentUser.displayName || currentUser.username}
                />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-900">{currentUser.displayName || currentUser.username}</p>
                  <p className="truncate text-xs text-slate-500">@{currentUser.username}</p>
                </div>
              </div>

              <div className="space-y-3 px-1 py-3">
                <div className="space-y-2">
                  <div className="px-2 text-xs font-semibold text-slate-500">看板切换</div>
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setBoardPickerOpen((current) => !current)}
                      className="flex h-12 w-full items-center justify-between rounded-2xl border border-slate-200 bg-white px-3 text-left shadow-sm transition hover:border-[#0f766e]/40"
                    >
                      <div className="min-w-0">
                        <div className="text-[11px] font-medium text-slate-500">当前看板</div>
                        <div className="mt-0.5 truncate text-sm font-semibold text-slate-900">{activeBoard?.name || "未选择看板"}</div>
                      </div>
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
                        {activeBoard ? (activeBoard.role === "owner" ? "拥有者" : activeBoard.role === "admin" ? "管理" : "只读") : "-"}
                      </span>
                    </button>

                    {boardPickerOpen ? (
                      <div className="absolute left-0 right-0 top-[calc(100%+8px)] z-20 rounded-[22px] border border-slate-200 bg-white p-2 shadow-[0_18px_40px_rgba(15,23,42,0.14)]">
                        <input
                          value={boardQuery}
                          onChange={(event) => setBoardQuery(event.target.value)}
                          placeholder="搜索看板"
                          className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm outline-none focus:border-[#0f766e]"
                        />
                        <div className="mt-2 max-h-[220px] space-y-2 overflow-y-auto pr-1">
                          {filteredBoards.map((board) => (
                            <button
                              key={board.id}
                              type="button"
                              onClick={() => void switchBoard(board.id)}
                              className={`w-full rounded-2xl border px-3 py-3 text-left transition ${
                                board.id === activeBoardId
                                  ? "border-[#0f766e] bg-[#e7f2ef]"
                                  : "border-transparent bg-slate-50 hover:border-slate-200 hover:bg-white"
                              }`}
                            >
                              <div className="flex items-center justify-between gap-3">
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-semibold text-slate-900">{board.name}</p>
                                  <p className="truncate text-xs text-slate-500">{board.description || "无说明"}</p>
                                </div>
                                <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600">
                                  {board.role === "owner" ? "拥有者" : board.role === "admin" ? "管理" : "只读"}
                                </span>
                              </div>
                            </button>
                          ))}
                          {filteredBoards.length === 0 ? (
                            <div className="rounded-2xl border border-dashed border-slate-200 px-3 py-5 text-center text-sm text-slate-500">
                              未找到匹配看板
                            </div>
                          ) : null}
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="space-y-2">
                  <MenuButton onClick={() => { setProfileOpen(true); setMenuOpen(false); }}>
                    个人设置
                  </MenuButton>
                  {canCreateBoard ? (
                    <MenuButton onClick={() => { setCreateBoardOpen(true); setMenuOpen(false); }}>
                      创建看板
                    </MenuButton>
                  ) : null}
                  {canManageBoard ? (
                    <MenuButton
                      onClick={() => {
                        setBoardDraft({
                          name: activeBoard?.name ?? "",
                          description: activeBoard?.description ?? "",
                          teamIds: activeBoard?.teamIds ?? [],
                        });
                        setEditBoardOpen(true);
                        setMenuOpen(false);
                      }}
                    >
                      看板设置
                    </MenuButton>
                  ) : null}
                  {canUseAdmin ? (
                    <MenuButton onClick={() => window.location.assign("/dashboard")}>工作饱和度</MenuButton>
                  ) : null}
                  {canUseAdmin ? (
                    <MenuButton onClick={() => window.location.assign("/admin")}>后台管理</MenuButton>
                  ) : null}
                  <MenuButton onClick={() => void logout()}>退出登录</MenuButton>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {currentUser.role !== "super_admin" ? <style>{'button[title="系统参数"]{display:none!important}'}</style> : null}
      {readOnly ? (
        <style>{'main.kanban-theme aside form,button[title="新建项目"],button[title="编辑项目"],button[title="归档项目"]{display:none!important}'}</style>
      ) : null}
      {children}

      {profileOpen ? (
        <ShellModal title="个人设置" onClose={() => setProfileOpen(false)}>
          <div className="space-y-4">
            <label className="block space-y-2 text-sm">
              <span className="font-medium text-slate-700">用户名</span>
              <input value={currentUser.username} disabled className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-slate-500" />
            </label>
            <label className="block space-y-2 text-sm">
              <span className="font-medium text-slate-700">姓名</span>
              <input value={currentUser.displayName || "-"} disabled className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-slate-500" />
            </label>
            <label className="block space-y-2 text-sm">
              <span className="font-medium text-slate-700">时区</span>
              <ShellSearchSelect
                value={profileDraft.timezone}
                options={timezoneSelectOptions}
                onChange={(value) => setProfileDraft((current) => ({ ...current, timezone: value }))}
                placeholder="选择时区"
              />
            </label>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="block space-y-2 text-sm">
                <span className="font-medium text-slate-700">当前密码</span>
                <input
                  type="password"
                  value={passwordDraft.currentPassword}
                  onChange={(event) => setPasswordDraft((current) => ({ ...current, currentPassword: event.target.value }))}
                  className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 outline-none focus:border-[#0f766e]"
                  placeholder="留空则不修改"
                />
              </label>
              <label className="block space-y-2 text-sm">
                <span className="font-medium text-slate-700">新密码</span>
                <input
                  type="password"
                  value={passwordDraft.newPassword}
                  onChange={(event) => setPasswordDraft((current) => ({ ...current, newPassword: event.target.value }))}
                  className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 outline-none focus:border-[#0f766e]"
                  placeholder="至少 6 位"
                />
              </label>
            </div>
            <label className="block space-y-2 text-sm">
              <span className="font-medium text-slate-700">确认新密码</span>
              <input
                type="password"
                value={passwordDraft.confirmPassword}
                onChange={(event) => setPasswordDraft((current) => ({ ...current, confirmPassword: event.target.value }))}
                className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 outline-none focus:border-[#0f766e]"
                placeholder="再次输入新密码"
              />
            </label>
            <div className="space-y-2 text-sm">
              <span className="font-medium text-slate-700">头像</span>
              <div className="grid grid-cols-4 gap-3">
                {avatarOptions.map((avatar) => (
                  <button
                    key={avatar.key}
                    type="button"
                    onClick={() => setProfileDraft((current) => ({ ...current, avatarKey: avatar.key }))}
                    className={`rounded-2xl border p-2 transition ${profileDraft.avatarKey === avatar.key ? "border-[#0f766e] bg-[#e7f5f2]" : "border-slate-200 hover:bg-slate-50"}`}
                  >
                    <Image src={avatar.src} alt={avatar.label} width={56} height={56} className="h-14 w-14 rounded-xl" />
                    <span className="mt-1 block truncate text-[11px] font-medium text-slate-600">{avatar.label}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button type="button" onClick={() => setProfileOpen(false)} className="h-10 rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-700">
                取消
              </button>
              <button type="button" onClick={() => void saveProfile()} disabled={savingProfile} className="h-10 rounded-xl bg-[#0f766e] px-4 text-sm font-semibold text-white disabled:opacity-60">
                {savingProfile ? "保存中..." : "保存"}
              </button>
            </div>
          </div>
        </ShellModal>
      ) : null}

      {createBoardOpen ? (
        <ShellModal title="创建看板" onClose={() => setCreateBoardOpen(false)}>
          <div className="space-y-4">
            <label className="block space-y-2 text-sm">
              <span className="font-medium text-slate-700">名称</span>
              <input
                value={newBoardDraft.name}
                onChange={(event) => setNewBoardDraft((current) => ({ ...current, name: event.target.value }))}
                className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 outline-none focus:border-[#0f766e]"
                placeholder="输入看板名称"
              />
            </label>
            <label className="block space-y-2 text-sm">
              <span className="font-medium text-slate-700">说明</span>
              <textarea
                value={newBoardDraft.description}
                onChange={(event) => setNewBoardDraft((current) => ({ ...current, description: event.target.value }))}
                className="min-h-[96px] w-full rounded-xl border border-slate-200 bg-white px-3 py-3 outline-none focus:border-[#0f766e]"
                placeholder="输入看板说明"
              />
            </label>
            <div className="space-y-2 text-sm">
              <span className="font-medium text-slate-700">团队</span>
              {teamOptions.length > 0 ? (
                <ShellTeamMultiSelect
                  teams={teamOptions}
                  value={newBoardDraft.teamIds}
                  query={teamQuery}
                  onQueryChange={setTeamQuery}
                  onChange={(teamIds) => setNewBoardDraft((current) => ({ ...current, teamIds }))}
                />
              ) : (
                <button type="button" onClick={() => window.location.assign("/admin")} className="h-11 w-full rounded-xl border border-dashed border-slate-200 text-sm text-slate-500">
                  创建团队
                </button>
              )}
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button type="button" onClick={() => setCreateBoardOpen(false)} className="h-10 rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-700">
                取消
              </button>
              <button type="button" onClick={() => void createBoard()} disabled={savingBoard} className="h-10 rounded-xl bg-[#0f766e] px-4 text-sm font-semibold text-white disabled:opacity-60">
                {savingBoard ? "创建中..." : "创建"}
              </button>
            </div>
          </div>
        </ShellModal>
      ) : null}

      {editBoardOpen ? (
        <ShellModal title="看板设置" onClose={() => setEditBoardOpen(false)}>
          <div className="space-y-4">
            <label className="block space-y-2 text-sm">
              <span className="font-medium text-slate-700">名称</span>
              <input
                value={boardDraft.name}
                onChange={(event) => setBoardDraft((current) => ({ ...current, name: event.target.value }))}
                className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 outline-none focus:border-[#0f766e]"
                placeholder="输入看板名称"
              />
            </label>
            <label className="block space-y-2 text-sm">
              <span className="font-medium text-slate-700">说明</span>
              <textarea
                value={boardDraft.description}
                onChange={(event) => setBoardDraft((current) => ({ ...current, description: event.target.value }))}
                className="min-h-[96px] w-full rounded-xl border border-slate-200 bg-white px-3 py-3 outline-none focus:border-[#0f766e]"
                placeholder="输入看板说明"
              />
            </label>
            <div className="space-y-2 text-sm">
              <span className="font-medium text-slate-700">团队</span>
              {teamOptions.length > 0 ? (
                <ShellTeamMultiSelect
                  teams={teamOptions}
                  value={boardDraft.teamIds}
                  query={teamQuery}
                  onQueryChange={setTeamQuery}
                  onChange={(teamIds) => setBoardDraft((current) => ({ ...current, teamIds }))}
                />
              ) : (
                <button type="button" onClick={() => window.location.assign("/admin")} className="h-11 w-full rounded-xl border border-dashed border-slate-200 text-sm text-slate-500">
                  创建团队
                </button>
              )}
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button type="button" onClick={() => setEditBoardOpen(false)} className="h-10 rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-700">
                取消
              </button>
              <button type="button" onClick={() => void saveBoard()} disabled={savingBoard} className="h-10 rounded-xl bg-[#0f766e] px-4 text-sm font-semibold text-white disabled:opacity-60">
                {savingBoard ? "保存中..." : "保存"}
              </button>
            </div>
          </div>
        </ShellModal>
      ) : null}
    </>
  );
}

function MenuButton({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-11 w-full items-center rounded-2xl px-3 text-left text-sm font-medium leading-none text-slate-700 transition hover:bg-slate-50"
    >
      {children}
    </button>
  );
}

function ShellSearchSelect({
  value,
  options,
  onChange,
  placeholder,
}: {
  value: string;
  options: ShellSelectOption[];
  onChange: (value: string) => void;
  placeholder: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement | null>(null);
  const selected = options.find((option) => option.value === value);
  const normalizedQuery = query.trim().toLowerCase();
  const filtered = normalizedQuery
    ? options.filter((option) =>
        [option.label, option.meta ?? "", option.value].some((text) => text.toLowerCase().includes(normalizedQuery))
      )
    : options;

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
        className="flex h-11 w-full items-center justify-between rounded-xl border border-slate-200 bg-white px-3 text-left text-sm outline-none transition hover:border-[#0f766e]/40"
      >
        <span className={selected ? "text-slate-900" : "text-slate-500"}>{selected?.label ?? placeholder}</span>
        <span className="text-slate-400">⌄</span>
      </button>
      {open ? (
        <div className="absolute left-0 right-0 top-[calc(100%+8px)] z-40 rounded-2xl border border-slate-200 bg-white p-2 shadow-xl">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索"
            className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm outline-none focus:border-[#0f766e]"
            autoFocus
          />
          <div className="mt-2 max-h-[220px] overflow-y-auto">
            {filtered.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                  setQuery("");
                }}
                className={`block w-full rounded-xl px-3 py-2 text-left text-sm transition ${
                  option.value === value ? "bg-[#e7f5f2] text-[#0f766e]" : "text-slate-700 hover:bg-slate-50"
                }`}
              >
                <span className="font-medium">{option.label}</span>
                {option.meta ? <span className="ml-2 text-xs text-slate-500">{option.meta}</span> : null}
              </button>
            ))}
            {filtered.length === 0 ? <div className="px-3 py-4 text-center text-sm text-slate-500">无匹配项</div> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ShellTeamMultiSelect({
  teams,
  value,
  query,
  onQueryChange,
  onChange,
}: {
  teams: TeamSummary[];
  value: string[];
  query: string;
  onQueryChange: (value: string) => void;
  onChange: (value: string[]) => void;
}) {
  const selected = teams.filter((team) => value.includes(team.id));
  const filtered = teams.filter((team) => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return true;
    return [team.name, team.description, team.ownerUsername].some((text) => text.toLowerCase().includes(normalized));
  });

  function toggle(teamId: string) {
    onChange(value.includes(teamId) ? value.filter((item) => item !== teamId) : [...value, teamId]);
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-2">
      <div className="flex flex-wrap gap-2">
        {selected.map((team) => (
          <button
            key={team.id}
            type="button"
            onClick={() => toggle(team.id)}
            className="rounded-lg bg-[#e7f5f2] px-2.5 py-1 text-xs font-semibold text-[#0f766e]"
          >
            {team.name} ×
          </button>
        ))}
        {selected.length > 0 ? (
          <button type="button" onClick={() => onChange([])} className="rounded-lg px-2.5 py-1 text-xs text-slate-500 hover:bg-white">
            清空
          </button>
        ) : null}
      </div>
      <input
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
        placeholder="搜索团队"
        className="mt-2 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-[#0f766e]"
      />
      <div className="mt-2 max-h-[200px] overflow-y-auto">
        {filtered.map((team) => {
          const active = value.includes(team.id);
          return (
            <button
              key={team.id}
              type="button"
              onClick={() => toggle(team.id)}
              className={`block w-full rounded-lg px-3 py-2 text-left text-sm transition ${
                active ? "bg-[#e7f5f2] text-[#0f766e]" : "hover:bg-white"
              }`}
            >
              <span className="font-medium">{team.name}</span>
              <span className="ml-2 text-xs text-slate-500">{team.memberCount} 人</span>
            </button>
          );
        })}
        {filtered.length === 0 ? <div className="px-3 py-4 text-center text-sm text-slate-500">无匹配团队</div> : null}
      </div>
    </div>
  );
}

function UserAvatar({ src, name }: { src?: string; name: string }) {
  if (src) {
    return <Image src={src} alt={name} width={32} height={32} className="h-8 w-8 rounded-full border border-slate-200 object-cover" />;
  }

  return (
    <span className="grid h-8 w-8 place-items-center rounded-full bg-[#0f766e] text-xs font-semibold text-white">
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}

function ShellModal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/25 px-4 py-8">
      <div className="w-full max-w-[520px] rounded-[28px] border border-white/70 bg-white p-6 shadow-2xl shadow-slate-900/15">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-slate-900">{title}</h2>
          <button type="button" onClick={onClose} className="rounded-full border border-slate-200 px-3 py-1 text-sm font-semibold text-slate-600">
            关闭
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
