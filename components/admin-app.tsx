"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { isThemeId, themePresets, timezoneLabel, timezoneOptions, type ThemeId } from "@/lib/ui-options";
import type { BoardSummary, ManagedUser } from "@/lib/auth-models";

type AdminBoard = BoardSummary & {
  members: Array<{ user_id: string; username: string; role: string }>;
};

export default function AdminApp() {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [boards, setBoards] = useState<AdminBoard[]>([]);
  const [username, setUsername] = useState("");
  const [timezone, setTimezone] = useState("Asia/Shanghai");
  const [message, setMessage] = useState("");
  const [userQuery, setUserQuery] = useState("");
  const [boardQuery, setBoardQuery] = useState("");
  const [memberQuery, setMemberQuery] = useState("");
  const [selectedBoardId, setSelectedBoardId] = useState("");
  const [themeId, setThemeId] = useState<ThemeId>(() => {
    if (typeof window === "undefined") {
      return "notion";
    }
    const savedTheme = window.localStorage.getItem("kanban-theme");
    return isThemeId(savedTheme) ? savedTheme : "notion";
  });
  const initialized = useRef(false);

  async function refresh() {
    const [userRows, boardRows] = await Promise.all([
      fetch("/api/admin/users").then((response) => response.json() as Promise<ManagedUser[]>),
      fetch("/api/admin/boards").then((response) => response.json() as Promise<AdminBoard[]>),
    ]);
    setUsers(userRows);
    setBoards(boardRows);
  }

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    void refresh();
  });

  const normalUsers = useMemo(() => users.filter((user) => user.role === "user"), [users]);

  const filteredUsers = useMemo(() => {
    const query = userQuery.trim().toLowerCase();
    if (!query) return users;
    return users.filter((user) => {
      const displayName = user.displayName.toLowerCase();
      const timezoneName = timezoneLabel(user.timezone).toLowerCase();
      return (
        user.username.toLowerCase().includes(query) ||
        displayName.includes(query) ||
        user.timezone.toLowerCase().includes(query) ||
        timezoneName.includes(query)
      );
    });
  }, [userQuery, users]);

  const filteredBoards = useMemo(() => {
    const query = boardQuery.trim().toLowerCase();
    if (!query) return boards;
    return boards.filter((board) =>
      [board.name, board.description, board.ownerUsername].some((value) => value.toLowerCase().includes(query))
    );
  }, [boardQuery, boards]);

  const effectiveSelectedBoardId =
    filteredBoards.find((board) => board.id === selectedBoardId)?.id ?? filteredBoards[0]?.id ?? "";

  const selectedBoard = filteredBoards.find((board) => board.id === effectiveSelectedBoardId) ?? null;

  const selectedBoardMembers = useMemo(() => {
    if (!selectedBoard) return [];
    const query = memberQuery.trim().toLowerCase();
    return normalUsers
      .map((user) => {
        const member = selectedBoard.members.find((item) => item.user_id === user.id);
        const owner = selectedBoard.ownerUserId === user.id;
        return { user, member, owner };
      })
      .filter(({ user }) => {
        if (!query) return true;
        const timezoneName = timezoneLabel(user.timezone).toLowerCase();
        return (
          user.username.toLowerCase().includes(query) ||
          user.displayName.toLowerCase().includes(query) ||
          user.timezone.toLowerCase().includes(query) ||
          timezoneName.includes(query)
        );
      })
      .sort((left, right) => {
        if (left.owner !== right.owner) return left.owner ? -1 : 1;
        if (Boolean(left.member) !== Boolean(right.member)) return left.member ? -1 : 1;
        return left.user.username.localeCompare(right.user.username);
      });
  }, [memberQuery, normalUsers, selectedBoard]);

  const summary = useMemo(() => {
    const grantedUsers = new Set<string>();
    for (const board of boards) {
      for (const member of board.members) {
        grantedUsers.add(member.user_id);
      }
    }
    return {
      userCount: users.length,
      normalUserCount: normalUsers.length,
      boardCount: boards.length,
      grantedUserCount: grantedUsers.size,
    };
  }, [boards, normalUsers.length, users.length]);

  function changeTheme(nextTheme: ThemeId) {
    setThemeId(nextTheme);
    window.localStorage.setItem("kanban-theme", nextTheme);
  }

  async function createUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    const response = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, timezone }),
    });
    const payload = (await response.json().catch(() => ({}))) as { error?: string; username?: string };
    if (!response.ok) {
      setMessage(payload.error ?? "创建失败");
      return;
    }
    setUsername("");
    setMessage(`用户 ${payload.username} 已创建，默认密码为 ${payload.username}@123`);
    await refresh();
  }

  async function resetPassword(userId: string) {
    const response = await fetch(`/api/admin/users/${userId}/reset-password`, { method: "POST" });
    const payload = (await response.json()) as { username?: string; password?: string; error?: string };
    setMessage(payload.password ? `${payload.username} 的密码已重置为：${payload.password}` : payload.error ?? "重置失败");
  }

  async function grant(boardId: string, userId: string, action: "grant" | "revoke") {
    await fetch(`/api/admin/boards/${boardId}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, action }),
    });
    await refresh();
  }

  return (
    <main data-theme={themeId} className="kanban-theme min-h-screen bg-[var(--app-bg)] text-[var(--text)]">
      <header className="border-b border-[var(--border)] bg-[var(--panel)] px-6 py-5">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-3">
          <h1 className="text-3xl font-semibold">后台管理</h1>
          <div className="ml-auto flex items-center gap-3">
            <select
              value={themeId}
              onChange={(event) => changeTheme(event.target.value as ThemeId)}
              className="h-11 rounded-2xl border border-[var(--border)] bg-[var(--panel)] px-3 text-sm text-[var(--text)] outline-none"
            >
              {themePresets.map((theme) => (
                <option key={theme.id} value={theme.id}>
                  {theme.label}
                </option>
              ))}
            </select>
            <Link href="/" className="rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[var(--accent-hover)]">
              返回看板
            </Link>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-[1600px] px-6 py-6">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <SummaryCard label="用户总数" value={summary.userCount} />
          <SummaryCard label="普通用户" value={summary.normalUserCount} />
          <SummaryCard label="看板数量" value={summary.boardCount} />
          <SummaryCard label="已授权用户" value={summary.grantedUserCount} />
        </div>
      </section>

      <section className="mx-auto grid max-w-[1600px] gap-6 px-6 pb-8 xl:grid-cols-[380px_minmax(0,420px)_minmax(0,1fr)]">
        <aside className="space-y-6">
          <form onSubmit={createUser} className="rounded-[24px] border border-[var(--border)] bg-[var(--panel)] p-5 shadow-sm">
            <h2 className="text-lg font-semibold">创建普通用户</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">用户名仅支持英文和数字；默认密码为“用户名@123”。</p>
            <div className="mt-5 space-y-3">
              <input
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                pattern="[A-Za-z0-9]+"
                placeholder="例如 zhangsan01"
                className="h-11 w-full rounded-2xl border border-[var(--border)] bg-[var(--input)] px-3 outline-none focus:border-[var(--accent)]"
              />
              <select
                value={timezone}
                onChange={(event) => setTimezone(event.target.value)}
                className="h-11 w-full rounded-2xl border border-[var(--border)] bg-[var(--input)] px-3 outline-none focus:border-[var(--accent)]"
              >
                {timezoneOptions.map(([value, label]) => (
                  <option key={`${value}-${label}`} value={value}>
                    {label}
                  </option>
                ))}
              </select>
              <button className="h-11 w-full rounded-2xl bg-[var(--accent)] font-semibold text-white transition hover:bg-[var(--accent-hover)]">
                创建用户
              </button>
            </div>
            {message ? <p className="mt-4 rounded-2xl bg-[var(--panel-soft)] px-3 py-3 text-sm text-[var(--text)]">{message}</p> : null}
          </form>

          <section className="rounded-[24px] border border-[var(--border)] bg-[var(--panel)] p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">用户列表</h2>
              <span className="rounded-full bg-[var(--tag-bg)] px-3 py-1 text-xs font-semibold text-[var(--text)]">{filteredUsers.length}</span>
            </div>
            <div className="mt-4">
              <input
                value={userQuery}
                onChange={(event) => setUserQuery(event.target.value)}
                placeholder="搜索用户名、昵称、时区"
                className="h-11 w-full rounded-2xl border border-[var(--border)] bg-[var(--input)] px-3 outline-none focus:border-[var(--accent)]"
              />
            </div>
            <div className="mt-4 max-h-[620px] space-y-2 overflow-y-auto pr-1">
              {filteredUsers.map((user) => {
                const boardCount = boards.filter(
                  (board) => board.ownerUserId === user.id || board.members.some((member) => member.user_id === user.id)
                ).length;
                return (
                  <div key={user.id} className="rounded-2xl border border-[var(--border)] bg-[var(--panel-soft)] p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-semibold">{user.displayName || user.username}</p>
                        <p className="truncate text-xs text-[var(--muted)]">@{user.username}</p>
                        <p className="mt-1 text-xs text-[var(--muted)]">{user.role} · {timezoneLabel(user.timezone)}</p>
                      </div>
                      {user.role === "user" ? (
                        <button
                          onClick={() => void resetPassword(user.id)}
                          className="shrink-0 rounded-xl border border-[var(--border)] bg-[var(--panel)] px-3 py-1.5 text-xs font-semibold transition hover:bg-[var(--hover)]"
                        >
                          重置密码
                        </button>
                      ) : null}
                    </div>
                    <div className="mt-3 flex items-center justify-between text-xs text-[var(--muted)]">
                      <span>{user.isActive ? "启用中" : "已停用"}</span>
                      <span>{boardCount} 个看板</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </aside>

        <section className="rounded-[24px] border border-[var(--border)] bg-[var(--panel)] p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">看板列表</h2>
            <span className="rounded-full bg-[var(--tag-bg)] px-3 py-1 text-xs font-semibold text-[var(--text)]">{filteredBoards.length}</span>
          </div>
          <div className="mt-4">
            <input
              value={boardQuery}
              onChange={(event) => setBoardQuery(event.target.value)}
              placeholder="搜索看板名称、说明、拥有者"
              className="h-11 w-full rounded-2xl border border-[var(--border)] bg-[var(--input)] px-3 outline-none focus:border-[var(--accent)]"
            />
          </div>
          <div className="mt-4 max-h-[720px] space-y-2 overflow-y-auto pr-1">
            {filteredBoards.map((board) => (
              <button
                key={board.id}
                type="button"
                onClick={() => setSelectedBoardId(board.id)}
                className={`w-full rounded-2xl border p-4 text-left transition ${
                  effectiveSelectedBoardId === board.id
                    ? "border-[var(--accent)] bg-[var(--accent-soft)]"
                    : "border-[var(--border)] bg-[var(--panel-soft)] hover:bg-[var(--hover)]"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{board.name}</p>
                    <p className="mt-1 line-clamp-2 text-sm text-[var(--muted)]">{board.description || "无说明"}</p>
                  </div>
                  <span className="shrink-0 rounded-full bg-[var(--panel)] px-3 py-1 text-xs font-semibold text-[var(--muted)]">
                    {board.members.length}
                  </span>
                </div>
                <div className="mt-3 text-xs text-[var(--muted)]">拥有者：{board.ownerUsername}</div>
              </button>
            ))}
          </div>
        </section>

        <section className="rounded-[24px] border border-[var(--border)] bg-[var(--panel)] p-5 shadow-sm">
          {selectedBoard ? (
            <>
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--border)] pb-4">
                <div>
                  <h2 className="text-xl font-semibold">{selectedBoard.name}</h2>
                  <p className="mt-1 text-sm text-[var(--muted)]">{selectedBoard.description || "无说明"}</p>
                  <p className="mt-2 text-sm text-[var(--muted)]">拥有者：{selectedBoard.ownerUsername}</p>
                </div>
                <div className="grid grid-cols-2 gap-2 text-right">
                  <MiniMetric label="成员" value={selectedBoard.members.length} />
                  <MiniMetric label="候选用户" value={normalUsers.length} />
                </div>
              </div>

              <div className="mt-5">
                <input
                  value={memberQuery}
                  onChange={(event) => setMemberQuery(event.target.value)}
                  placeholder="搜索授权用户"
                  className="h-11 w-full rounded-2xl border border-[var(--border)] bg-[var(--input)] px-3 outline-none focus:border-[var(--accent)]"
                />
              </div>

              <div className="mt-4 space-y-3">
                {selectedBoardMembers.map(({ user, member, owner }) => (
                  <div key={user.id} className="flex items-center justify-between gap-3 rounded-2xl border border-[var(--border)] bg-[var(--panel-soft)] px-4 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{user.displayName || user.username}</p>
                      <p className="truncate text-xs text-[var(--muted)]">@{user.username} · {timezoneLabel(user.timezone)}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="rounded-full bg-[var(--panel)] px-3 py-1 text-xs font-semibold text-[var(--muted)]">
                        {owner ? "拥有者" : member ? member.role : "未授权"}
                      </span>
                      {!owner ? (
                        <button
                          onClick={() => void grant(selectedBoard.id, user.id, member ? "revoke" : "grant")}
                          className={`rounded-xl px-3 py-2 text-xs font-semibold transition ${
                            member
                              ? "border border-[var(--border)] bg-[var(--panel)] text-[var(--text)] hover:bg-[var(--hover)]"
                              : "bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)]"
                          }`}
                        >
                          {member ? "取消授权" : "授权查看"}
                        </button>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="grid min-h-[420px] place-items-center rounded-[20px] border border-dashed border-[var(--border)] bg-[var(--panel-soft)] text-sm text-[var(--muted)]">
              选择一个看板以查看成员授权
            </div>
          )}
        </section>
      </section>
    </main>
  );
}

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-[24px] border border-[var(--border)] bg-[var(--panel)] px-5 py-4 shadow-sm">
      <p className="text-sm text-[var(--muted)]">{label}</p>
      <p className="mt-2 text-3xl font-semibold">{value}</p>
    </div>
  );
}

function MiniMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--panel-soft)] px-4 py-3">
      <p className="text-xs text-[var(--muted)]">{label}</p>
      <p className="mt-1 text-lg font-semibold">{value}</p>
    </div>
  );
}
