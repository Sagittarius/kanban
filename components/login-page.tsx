"use client";

import { useState, type FormEvent } from "react";

export default function LoginPage() {
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "登录失败");
      }
      window.location.href = "/";
    } catch (err) {
      setError(err instanceof Error ? err.message : "登录失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen overflow-hidden bg-[#f3efe7] text-[#1f2933]">
      <div className="absolute inset-0 opacity-70 [background:radial-gradient(circle_at_20%_20%,#d7f4ec_0,transparent_28%),radial-gradient(circle_at_80%_10%,#dbeafe_0,transparent_25%),radial-gradient(circle_at_70%_90%,#ffe8d6_0,transparent_28%)]" />
      <div className="relative mx-auto grid min-h-screen max-w-6xl items-center gap-10 px-6 py-12 lg:grid-cols-[1.1fr_0.9fr]">
        <section className="space-y-8">
          <div className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white/70 px-4 py-2 text-sm font-semibold shadow-sm backdrop-blur">
            <span className="grid h-7 w-7 place-items-center rounded-full bg-[#0f766e] text-white">K</span>
            Private Kanban
          </div>
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.28em] text-[#0f766e]">Project Operations</p>
            <h1 className="mt-4 max-w-3xl text-5xl font-semibold tracking-tight text-[#18202a] lg:text-7xl">
              为内网私有化部署设计的项目看板
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-[#5f6b7a]">
              用户、权限、看板隔离、活动审计和多数据库部署都在本地运行；页面字体、图形和装饰均来自 CSS 与内置 SVG，不依赖联网资源。
            </p>
          </div>
          <div className="grid max-w-2xl gap-3 sm:grid-cols-3">
            {["离线可用", "多看板隔离", "时区感知"].map((item) => (
              <div key={item} className="rounded-2xl border border-white/70 bg-white/70 p-4 text-sm font-semibold shadow-sm backdrop-blur">
                {item}
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-[2rem] border border-white/70 bg-white/85 p-6 shadow-2xl shadow-slate-900/10 backdrop-blur lg:p-8">
          <div className="mb-8">
            <h2 className="text-2xl font-semibold">登录看板</h2>
            <p className="mt-2 text-sm text-[#6b7280]">默认超级管理员：admin / admin@123，部署后请立即修改初始密码。</p>
          </div>
          <form onSubmit={submit} className="space-y-5">
            <label className="block space-y-2 text-sm font-medium">
              <span>用户名</span>
              <input
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                pattern="[A-Za-z0-9]+"
                autoComplete="username"
                className="h-12 w-full rounded-xl border border-slate-200 bg-white px-4 outline-none transition focus:border-[#0f766e] focus:ring-4 focus:ring-[#0f766e]/10"
                placeholder="仅支持英文和数字"
              />
            </label>
            <label className="block space-y-2 text-sm font-medium">
              <span>密码</span>
              <input
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                type="password"
                autoComplete="current-password"
                className="h-12 w-full rounded-xl border border-slate-200 bg-white px-4 outline-none transition focus:border-[#0f766e] focus:ring-4 focus:ring-[#0f766e]/10"
                placeholder="输入密码"
              />
            </label>
            {error ? <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
            <button
              disabled={loading}
              className="h-12 w-full rounded-xl bg-[#0f766e] font-semibold text-white shadow-lg shadow-[#0f766e]/20 transition hover:bg-[#0b625b] disabled:opacity-60"
            >
              {loading ? "登录中..." : "进入工作台"}
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}
