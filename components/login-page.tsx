"use client";

import { useState, type CSSProperties, type FormEvent } from "react";
import LoginOrb from "@/components/login-orb";
import { clientFetch } from "@/lib/client-observability";

const particles = [
  { x: 8, y: 18, size: 3, delay: 0, duration: 9 },
  { x: 16, y: 72, size: 2, delay: 1.2, duration: 11 },
  { x: 24, y: 34, size: 4, delay: 0.4, duration: 10 },
  { x: 31, y: 12, size: 2, delay: 2.1, duration: 12 },
  { x: 38, y: 82, size: 3, delay: 1.7, duration: 10 },
  { x: 46, y: 27, size: 2, delay: 0.9, duration: 13 },
  { x: 53, y: 58, size: 4, delay: 2.8, duration: 9 },
  { x: 61, y: 18, size: 2, delay: 1.4, duration: 12 },
  { x: 68, y: 74, size: 3, delay: 0.2, duration: 11 },
  { x: 76, y: 38, size: 2, delay: 2.5, duration: 10 },
  { x: 84, y: 15, size: 4, delay: 1.1, duration: 13 },
  { x: 91, y: 66, size: 2, delay: 0.7, duration: 12 },
  { x: 12, y: 48, size: 2, delay: 3.1, duration: 10 },
  { x: 29, y: 63, size: 3, delay: 2.3, duration: 14 },
  { x: 58, y: 88, size: 2, delay: 1.8, duration: 12 },
  { x: 88, y: 47, size: 3, delay: 3.4, duration: 11 },
  { x: 6, y: 86, size: 2, delay: 4.2, duration: 9 },
  { x: 19, y: 24, size: 2, delay: 3.7, duration: 12 },
  { x: 35, y: 45, size: 3, delay: 4.8, duration: 10 },
  { x: 44, y: 70, size: 2, delay: 5.1, duration: 13 },
  { x: 64, y: 33, size: 3, delay: 3.9, duration: 11 },
  { x: 73, y: 8, size: 2, delay: 4.5, duration: 12 },
  { x: 82, y: 84, size: 2, delay: 5.6, duration: 10 },
  { x: 95, y: 29, size: 3, delay: 4.1, duration: 14 },
  { x: 4, y: 39, size: 1.5, delay: 6.3, duration: 15 },
  { x: 10, y: 9, size: 2, delay: 7.1, duration: 12.5 },
  { x: 15, y: 89, size: 1.5, delay: 8.4, duration: 16 },
  { x: 21, y: 53, size: 2, delay: 6.8, duration: 13.5 },
  { x: 27, y: 18, size: 1.5, delay: 9.2, duration: 14.5 },
  { x: 33, y: 77, size: 2, delay: 7.7, duration: 17 },
  { x: 40, y: 31, size: 1.5, delay: 10.1, duration: 12.8 },
  { x: 48, y: 7, size: 2, delay: 8.9, duration: 15.2 },
  { x: 51, y: 80, size: 1.5, delay: 6.1, duration: 13.8 },
  { x: 56, y: 42, size: 2, delay: 9.8, duration: 16.5 },
  { x: 62, y: 63, size: 1.5, delay: 7.4, duration: 14.2 },
  { x: 66, y: 11, size: 2, delay: 10.6, duration: 17.5 },
  { x: 70, y: 50, size: 1.5, delay: 8.1, duration: 12.2 },
  { x: 78, y: 91, size: 2, delay: 11.3, duration: 15.8 },
  { x: 80, y: 25, size: 1.5, delay: 6.6, duration: 14.8 },
  { x: 86, y: 58, size: 2, delay: 9.5, duration: 16.8 },
  { x: 90, y: 5, size: 1.5, delay: 7.9, duration: 13.2 },
  { x: 93, y: 78, size: 2, delay: 10.9, duration: 18 },
  { x: 2, y: 64, size: 1.5, delay: 12.1, duration: 15.5 },
  { x: 18, y: 6, size: 1.5, delay: 11.7, duration: 16.2 },
  { x: 37, y: 95, size: 2, delay: 12.8, duration: 13.7 },
  { x: 59, y: 4, size: 1.5, delay: 13.4, duration: 17.2 },
  { x: 72, y: 68, size: 2, delay: 12.5, duration: 14.4 },
  { x: 98, y: 44, size: 1.5, delay: 13.9, duration: 16.9 },
];

function particleStyle(particle: (typeof particles)[number]): CSSProperties {
  return {
    left: `${particle.x}%`,
    top: `${particle.y}%`,
    width: `${particle.size}px`,
    height: `${particle.size}px`,
    animationDelay: `${particle.delay}s`,
    animationDuration: `${particle.duration}s`,
  };
}

const visibleParticles = particles;

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
      const response = await clientFetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      }, { operation: "auth.login" });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "登录失败");
      }
      window.location.href = "/dashboard";
    } catch (err) {
      setError(err instanceof Error ? err.message : "登录失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#020817] text-[#e6f6ff]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_18%,rgba(37,99,235,0.42),transparent_28%),radial-gradient(circle_at_76%_12%,rgba(34,211,238,0.24),transparent_26%),radial-gradient(circle_at_72%_82%,rgba(14,165,233,0.2),transparent_30%),linear-gradient(135deg,#020817_0%,#061323_44%,#030712_100%)]" />
      <div className="absolute inset-0 opacity-35 [background-image:linear-gradient(rgba(125,211,252,0.055)_1px,transparent_1px),linear-gradient(90deg,rgba(125,211,252,0.045)_1px,transparent_1px)] [background-size:64px_64px]" />
      <LoginOrb className="absolute left-[8%] top-[14%] h-[min(82vw,34rem)] w-[min(82vw,34rem)] opacity-90 lg:h-[34rem] lg:w-[34rem]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,rgba(2,8,23,0.24)_52%,rgba(2,8,23,0.86)_100%)]" />
      <div className="pointer-events-none absolute inset-0">
        <div className="login-orbit absolute left-[8%] top-[14%] h-[34rem] w-[34rem] rounded-full border border-cyan-300/[0.06]" />
        <div className="login-orbit login-orbit-slow absolute right-[6%] top-[10%] h-[28rem] w-[28rem] rounded-full border border-blue-200/[0.06]" />
        <span className="login-comet-path absolute left-[-18%] top-[12%] h-3 w-64 [--comet-angle:18deg]">
          <span className="login-comet absolute left-0 top-0 h-full w-full">
            <span className="login-comet-tail absolute left-0 top-1/2 h-px w-full -translate-y-1/2 rounded-full" />
            <span className="login-comet-head absolute right-0 top-1/2 h-1.5 w-3 -translate-y-1/2 rounded-full" />
          </span>
        </span>
        <span className="login-comet-path absolute left-[-22%] top-[34%] h-3 w-52 [--comet-angle:14deg]">
          <span className="login-comet login-comet-two absolute left-0 top-0 h-full w-full">
            <span className="login-comet-tail absolute left-0 top-1/2 h-px w-full -translate-y-1/2 rounded-full" />
            <span className="login-comet-head absolute right-0 top-1/2 h-1.5 w-3 -translate-y-1/2 rounded-full" />
          </span>
        </span>
        <span className="login-comet-path absolute left-[-16%] top-[56%] h-3 w-72 [--comet-angle:20deg]">
          <span className="login-comet login-comet-three absolute left-0 top-0 h-full w-full">
            <span className="login-comet-tail absolute left-0 top-1/2 h-px w-full -translate-y-1/2 rounded-full" />
            <span className="login-comet-head absolute right-0 top-1/2 h-1.5 w-3 -translate-y-1/2 rounded-full" />
          </span>
        </span>
        <span className="login-comet-path absolute left-[-28%] top-[24%] h-3 w-44 [--comet-angle:16deg]">
          <span className="login-comet login-comet-four absolute left-0 top-0 h-full w-full">
            <span className="login-comet-tail absolute left-0 top-1/2 h-px w-full -translate-y-1/2 rounded-full" />
            <span className="login-comet-head absolute right-0 top-1/2 h-1.5 w-3 -translate-y-1/2 rounded-full" />
          </span>
        </span>
        {visibleParticles.map((particle, index) => (
          <span key={index} className="login-particle absolute rounded-full bg-cyan-100 shadow-[0_0_18px_rgba(125,211,252,0.9)]" style={particleStyle(particle)} />
        ))}
      </div>

      <div className="relative mx-auto grid min-h-screen max-w-6xl items-center gap-10 px-6 py-12 lg:grid-cols-[1.05fr_0.95fr]">
        <section className="space-y-8">
          <div className="inline-flex items-center gap-2 rounded-full border border-cyan-200/20 bg-slate-900/70 px-4 py-2 text-sm font-semibold text-cyan-50 shadow-[0_0_40px_rgba(34,211,238,0.12)]">
            <span className="grid h-7 w-7 place-items-center rounded-full bg-cyan-300 text-[#03111f]">K</span>
            Kanban
          </div>
          <div>
            <h1 className="mt-4 max-w-3xl text-5xl font-semibold tracking-tight text-white drop-shadow-[0_0_36px_rgba(34,211,238,0.2)] lg:text-7xl">
              项目看板
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-300">
              用于管理项目、任务与协作节奏，支持容器部署，并可按场景选择 SQLite 或 PostgreSQL 等数据库方案。
            </p>
          </div>
          <div className="grid max-w-2xl gap-3 sm:grid-cols-3">
            {["容器部署", "多数据库方案", "看板隔离"].map((item) => (
              <div key={item} className="rounded-2xl border border-cyan-100/15 bg-slate-900/58 p-4 text-sm font-semibold text-cyan-50 shadow-[0_16px_48px_rgba(2,8,23,0.28)]">
                {item}
              </div>
            ))}
          </div>
        </section>

        <section className="relative overflow-hidden rounded-[2rem] border border-cyan-100/18 bg-slate-950/58 p-6 shadow-[0_34px_100px_rgba(0,0,0,0.45),0_0_0_1px_rgba(125,211,252,0.08)] backdrop-blur-2xl lg:p-8">
          <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-cyan-200/80 to-transparent" />
          <div className="pointer-events-none absolute right-[-20%] top-[-30%] h-64 w-64 rounded-full bg-cyan-300/10 blur-3xl" />
          <div className="mb-8">
            <h2 className="text-2xl font-semibold text-white">登录看板</h2>
          </div>
          <form onSubmit={submit} className="space-y-5">
            <label className="block space-y-2 text-sm font-medium text-slate-200">
              <span>用户名</span>
              <input
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                autoComplete="username"
                className="h-12 w-full rounded-xl border border-cyan-100/15 bg-slate-900/70 px-4 text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-200/70 focus:ring-4 focus:ring-cyan-300/10"
                placeholder="输入用户名"
                name="username"
              />
            </label>
            <label className="block space-y-2 text-sm font-medium text-slate-200">
              <span>密码</span>
              <input
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                type="password"
                autoComplete="current-password"
                className="h-12 w-full rounded-xl border border-cyan-100/15 bg-slate-900/70 px-4 text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-200/70 focus:ring-4 focus:ring-cyan-300/10"
                placeholder="输入密码"
                name="password"
              />
            </label>
            {error ? <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
            <button
              disabled={loading}
              className="h-12 w-full rounded-xl bg-cyan-300 font-semibold text-[#03111f] shadow-[0_18px_44px_rgba(34,211,238,0.24)] transition hover:bg-cyan-200 disabled:opacity-60"
            >
              {loading ? "登录中..." : "进入工作台"}
            </button>
          </form>
        </section>
      </div>
      <style>{`
        @keyframes login-pulse {
          0%, 100% { transform: scale(0.82); opacity: 0.14; }
          28% { transform: scale(1.22); opacity: 0.48; }
          62% { transform: scale(1.42); opacity: 0.68; }
        }
        @keyframes login-comet {
          0% { transform: translate3d(0, 0, 0); opacity: 0; }
          18% { opacity: 0.85; }
          100% { transform: translate3d(150vw, 0, 0); opacity: 0; }
        }
        @keyframes login-orbit {
          from { transform: rotate(0deg) scale(1); }
          to { transform: rotate(360deg) scale(1.03); }
        }
        .login-particle { animation: login-pulse ease-in-out infinite; }
        .login-orb-container {
          pointer-events: none;
          z-index: 0;
          contain: layout paint style;
          mix-blend-mode: screen;
          filter: drop-shadow(0 0 48px rgba(34,211,238,0.18));
        }
        .login-orb-canvas {
          display: block;
          height: 100%;
          width: 100%;
        }
        .login-comet-path {
          transform: rotate(var(--comet-angle));
          transform-origin: left center;
        }
        .login-comet { animation: login-comet 7.8s ease-in-out infinite; }
        .login-comet-two { animation-delay: 2.6s; animation-duration: 12.8s; }
        .login-comet-three { animation-delay: 5.4s; animation-duration: 17.8s; }
        .login-comet-four { animation-delay: 8.2s; animation-duration: 22.8s; }
        .login-orbit { animation: login-orbit 24s linear infinite; }
        .login-orbit-slow { animation-duration: 36s; animation-direction: reverse; }
        .login-comet-tail {
          background: linear-gradient(90deg, transparent 0%, rgba(224,242,254,0.18) 28%, rgba(224,242,254,0.72) 68%, rgba(255,255,255,0.94) 100%);
          box-shadow: 0 0 14px rgba(186,230,253,0.26), 0 0 30px rgba(125,211,252,0.18);
        }
        .login-comet-head {
          background: rgba(255,255,255,0.94);
          box-shadow: 0 0 14px rgba(255,255,255,0.38), 0 0 30px rgba(186,230,253,0.26);
        }
      `}</style>
    </main>
  );
}
