"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import type { BoardSummary, CurrentUser } from "@/lib/repositories/kanban-repository";

const timezoneOptions = [
  ["Asia/Shanghai", "中国时区 UTC+8"],
  ["Asia/Tokyo", "东京"],
  ["Europe/London", "伦敦"],
  ["Europe/Berlin", "柏林"],
  ["America/Los_Angeles", "洛杉矶"],
  ["America/New_York", "纽约"],
];

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
  const [timezone, setTimezone] = useState(user.timezone || "Asia/Shanghai");
  const [creating, setCreating] = useState(false);
  const activeBoard = boards.find((board) => board.id === activeBoardId);
  const readOnly = activeBoard?.role === "viewer";

  async function switchBoard(boardId: string) {
    await fetch(`/api/boards/${boardId}/select`, { method: "POST" });
    window.location.href = "/";
  }

  async function createBoard() {
    const name = window.prompt("请输入新看板名称", "我的看板");
    if (!name?.trim()) return;
    setCreating(true);
    const response = await fetch("/api/boards", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const board = (await response.json()) as BoardSummary;
    await switchBoard(board.id);
  }

  async function changeTimezone(nextTimezone: string) {
    setTimezone(nextTimezone);
    await fetch("/api/auth/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ timezone: nextTimezone }),
    });
    window.location.reload();
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/";
  }

  return (
    <>
      <div className="sticky top-0 z-[80] border-b border-slate-200 bg-white/95 px-4 py-3 shadow-sm backdrop-blur">
        <div className="mx-auto flex max-w-[2160px] flex-wrap items-center gap-3">
          <Link href="/" className="rounded-full bg-[#0f766e] px-4 py-2 text-sm font-semibold text-white">前台看板</Link>
          {user.role === "super_admin" ? (
            <a href="/admin" className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">后台管理</a>
          ) : null}
          <select
            value={activeBoardId}
            onChange={(event) => void switchBoard(event.target.value)}
            className="h-10 min-w-[220px] rounded-full border border-slate-200 bg-white px-4 text-sm"
          >
            {boards.map((board) => (
              <option key={board.id} value={board.id}>{board.name}</option>
            ))}
          </select>
          <button onClick={() => void createBoard()} disabled={creating} className="h-10 rounded-full border border-slate-200 px-4 text-sm font-semibold hover:bg-slate-50">
            新建看板
          </button>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-700">{user.username}</span>
            <select value={timezone} onChange={(event) => void changeTimezone(event.target.value)} className="h-10 rounded-full border border-slate-200 bg-white px-3 text-sm">
              {timezoneOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <button onClick={() => void logout()} className="h-10 rounded-full border border-slate-200 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50">
              退出
            </button>
          </div>
        </div>
      </div>
      {user.role !== "super_admin" ? <style>{'button[title="系统参数"]{display:none!important}'}</style> : null}
      {readOnly ? (
        <>
          <div className="bg-amber-50 px-4 py-2 text-center text-sm font-semibold text-amber-800">当前看板为只读授权，普通编辑入口已隐藏。</div>
          <style>{'main.kanban-theme aside form,button[title="新建项目"],button[title="编辑项目"],button[title="归档项目"]{display:none!important}'}</style>
        </>
      ) : null}
      {children}
    </>
  );
}
