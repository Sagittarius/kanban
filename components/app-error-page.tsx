"use client";

import { AlertTriangle, ChartNoAxesCombined, LogOut, RotateCcw } from "lucide-react";
import type { ReactNode } from "react";
import { clientFetch } from "@/lib/client-observability";

type AppErrorPageProps = {
  title: string;
  message?: string;
  detail?: string;
  requestId?: string;
  onRetry?: () => void;
};

export default function AppErrorPage({ title, message, detail, requestId, onRetry }: AppErrorPageProps) {
  const actionButtonClass =
    "inline-flex h-11 min-w-[120px] items-center justify-center rounded-xl px-4 text-sm font-semibold";

  async function logout() {
    await clientFetch("/api/auth/logout", { method: "POST" }, { operation: "auth.logout.error-page" }).catch(() => {});
    window.location.assign("/");
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[radial-gradient(circle_at_top,rgba(103,232,249,0.18),transparent_28%),radial-gradient(circle_at_80%_18%,rgba(167,139,250,0.14),transparent_24%),linear-gradient(135deg,#050816_0%,#091428_48%,#030712_100%)] px-6 py-10 text-[#e6f6ff]">
      <div className="pointer-events-none absolute inset-0 opacity-35 [background-image:linear-gradient(rgba(125,211,252,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(125,211,252,0.04)_1px,transparent_1px)] [background-size:64px_64px]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,rgba(2,8,23,0.2)_52%,rgba(2,8,23,0.88)_100%)]" />
      <section className="relative w-full max-w-2xl overflow-hidden rounded-[28px] border border-cyan-100/18 bg-slate-950/68 p-8 shadow-[0_34px_100px_rgba(0,0,0,0.48),0_0_0_1px_rgba(125,211,252,0.06)] backdrop-blur-2xl">
        <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-cyan-200/80 to-transparent" />
        <div className="pointer-events-none absolute right-[-18%] top-[-24%] h-72 w-72 rounded-full bg-cyan-300/10 blur-3xl" />

        <div className="flex items-start gap-4">
          <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl border border-cyan-200/18 bg-cyan-300/12 text-cyan-100 shadow-[0_0_30px_rgba(34,211,238,0.14)]">
            <AlertTriangle size={26} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-[0.32em] text-cyan-100/70">应用异常</p>
            <h1 className="mt-2 text-2xl font-semibold text-white">{title}</h1>
            {message ? <p className="mt-3 text-sm leading-7 text-slate-300">{message}</p> : null}
            {detail ? <p className="mt-2 text-xs leading-6 text-slate-400">{detail}</p> : null}
            {requestId ? (
              <p className="mt-3 rounded-xl border border-cyan-100/12 bg-white/6 px-3 py-2 font-mono text-xs leading-6 text-cyan-100/85">
                Request ID: {requestId}
              </p>
            ) : null}

            <div className="mt-7 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => (onRetry ? onRetry() : window.location.reload())}
                className={`${actionButtonClass} bg-cyan-300 text-[#03111f] shadow-[0_18px_44px_rgba(34,211,238,0.22)] transition hover:bg-cyan-200`}
              >
                <ActionButtonContent icon={<RotateCcw size={15} />} label="刷新页面" />
              </button>
              <button
                type="button"
                onClick={() => void logout()}
                className={`${actionButtonClass} border border-cyan-100/18 bg-white/8 text-cyan-50 transition hover:bg-white/12`}
              >
                <ActionButtonContent icon={<LogOut size={15} />} label="退出登录" />
              </button>
              <a
                href="/dashboard"
                className={`${actionButtonClass} border border-cyan-100/18 bg-slate-900/60 text-slate-200 transition hover:bg-slate-800/70`}
              >
                <ActionButtonContent icon={<ChartNoAxesCombined size={15} />} label="返回大屏" />
              </a>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

function ActionButtonContent({ icon, label }: { icon?: ReactNode; label: string }) {
  return (
    <span className="inline-flex items-center gap-2 leading-none">
      <span className="grid h-[15px] w-[15px] shrink-0 place-items-center">
        {icon ?? <span aria-hidden className="h-[15px] w-[15px] opacity-0" />}
      </span>
      <span className="text-sm font-semibold leading-none">{label}</span>
    </span>
  );
}
