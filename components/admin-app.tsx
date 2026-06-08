"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import type { BoardSummary, ManagedUser } from "@/lib/repositories/kanban-repository";

type AdminBoard = BoardSummary & {
  members: Array<{ user_id: string; username: string; role: string }>;
};

export default function AdminApp() {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [boards, setBoards] = useState<AdminBoard[]>([]);
  const [username, setUsername] = useState("");
  const [timezone, setTimezone] = useState("Asia/Shanghai");
  const [message, setMessage] = useState("");

  async function refresh() {
    const [userRows, boardRows] = await Promise.all([
      fetch("/api/admin/users").then((response) => response.json() as Promise<ManagedUser[]>),
      fetch("/api/admin/boards").then((response) => response.json() as Promise<AdminBoard[]>),
    ]);
    setUsers(userRows);
    setBoards(boardRows);
  }

  const initialized = useRef(false);
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    void refresh();
  });

  const normalUsers = useMemo(() => users.filter((user) => user.role === "user"), [users]);

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
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white px-6 py-5">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-[#0f766e]">Admin Console</p>
            <h1 className="mt-1 text-3xl font-semibold">后台管理</h1>
          </div>
          <Link href="/" className="ml-auto rounded-full bg-[#0f766e] px-4 py-2 text-sm font-semibold text-white">返回看板</Link>
        </div>
      </header>

      <section className="mx-auto grid max-w-7xl gap-6 px-6 py-6 lg:grid-cols-[380px_minmax(0,1fr)]">
        <aside className="space-y-6">
          <form onSubmit={createUser} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold">创建普通用户</h2>
            <p className="mt-1 text-sm text-slate-500">用户名仅支持英文和数字；默认密码为“用户名@123”。</p>
            <div className="mt-5 space-y-3">
              <input value={username} onChange={(event) => setUsername(event.target.value)} pattern="[A-Za-z0-9]+" placeholder="例如 zhangsan01" className="h-11 w-full rounded-xl border border-slate-200 px-3 outline-none focus:border-[#0f766e]" />
              <select value={timezone} onChange={(event) => setTimezone(event.target.value)} className="h-11 w-full rounded-xl border border-slate-200 px-3">
                <option value="Asia/Shanghai">Asia/Shanghai 中国时区</option>
                <option value="America/Los_Angeles">America/Los_Angeles</option>
                <option value="America/New_York">America/New_York</option>
                <option value="Europe/London">Europe/London</option>
              </select>
              <button className="h-11 w-full rounded-xl bg-[#0f766e] font-semibold text-white">创建用户</button>
            </div>
            {message ? <p className="mt-4 rounded-xl bg-slate-100 px-3 py-2 text-sm text-slate-700">{message}</p> : null}
          </form>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold">用户列表</h2>
            <div className="mt-4 space-y-2">
              {users.map((user) => (
                <div key={user.id} className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold">{user.username}</p>
                      <p className="text-xs text-slate-500">{user.role} · {user.timezone}</p>
                    </div>
                    {user.role === "user" ? (
                      <button onClick={() => void resetPassword(user.id)} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold hover:bg-slate-100">重置密码</button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </aside>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold">看板授权</h2>
          <p className="mt-1 text-sm text-slate-500">超级管理员可查看所有看板，并可为普通用户分配查看权限。</p>
          <div className="mt-5 space-y-4">
            {boards.map((board) => (
              <div key={board.id} className="rounded-2xl border border-slate-200 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold">{board.name}</h3>
                    <p className="text-sm text-slate-500">拥有者：{board.ownerUsername}</p>
                  </div>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600">{board.members.length} 个成员</span>
                </div>
                <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                  {normalUsers.map((user) => {
                    const member = board.members.find((item) => item.user_id === user.id);
                    const owner = board.ownerUserId === user.id;
                    return (
                      <div key={user.id} className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2">
                        <div>
                          <p className="text-sm font-semibold">{user.username}</p>
                          <p className="text-xs text-slate-500">{owner ? "拥有者" : member ? member.role : "未授权"}</p>
                        </div>
                        {!owner ? (
                          <button
                            onClick={() => void grant(board.id, user.id, member ? "revoke" : "grant")}
                            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold hover:bg-slate-100"
                          >
                            {member ? "取消" : "授权"}
                          </button>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </section>
      </section>
    </main>
  );
}
