import Link from "next/link";
import LoginPage from "@/components/login-page";
import { getDiagnosticsSnapshot, type DiagnosticLogEntry } from "@/lib/diagnostics";
import { withPageLogging } from "@/lib/page-logging";
import { getOptionalSessionUser } from "@/lib/server-session";

export const dynamic = "force-dynamic";

export default async function DiagnosticsPage() {
  return withPageLogging("/admin/diagnostics", async (pageLogContext) => {
    const user = await getOptionalSessionUser();
    if (!user) {
      return <LoginPage />;
    }

    pageLogContext.setContext({ username: user.username, display_name: user.displayName || "" });
    if (user.role !== "super_admin") {
      return (
        <DiagnosticsShell title="无权访问诊断中心">
          <section className="rounded-2xl border border-white/10 bg-white/6 p-6">
            <p className="text-sm leading-7 text-slate-300">当前页面仅允许超级管理员访问。</p>
            <Link href="/admin" prefetch={false} className="mt-5 inline-flex rounded-xl bg-cyan-300 px-4 py-2 text-sm font-semibold text-slate-950">
              返回后台
            </Link>
          </section>
        </DiagnosticsShell>
      );
    }

    const snapshot = getDiagnosticsSnapshot();
    const logConfigRows = [
      ["应用日志级别", snapshot.logConfig.app.level],
      ["控制台日志", snapshot.logConfig.app.consoleEnabled ? "开启" : "关闭"],
      ["文件日志", snapshot.logConfig.app.fileEnabled ? "开启" : "关闭"],
      ["日志文件", snapshot.logConfig.app.filePath || "未配置"],
      ["文件存在", snapshot.logConfig.appFileExists ? "是" : "否"],
      ["文件大小", `${snapshot.logConfig.appFileSizeBytes} bytes`],
      ["滚动大小", `${snapshot.logConfig.app.maxSizeMb} MB`],
      ["保留文件", `${snapshot.logConfig.app.maxFiles}`],
      ["保留天数", `${snapshot.logConfig.app.retentionDays}`],
    ];

    return (
      <DiagnosticsShell title="诊断中心">
        <div className="grid gap-4 md:grid-cols-3">
          <Metric label="应用版本" value={snapshot.appVersion} />
          <Metric label="镜像标签" value={snapshot.imageTag} />
          <Metric label="数据库类型" value={snapshot.databaseType} />
        </div>

        <section className="rounded-2xl border border-white/10 bg-white/6 p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-base font-semibold text-white">日志配置</h2>
            <span className="rounded-full border border-cyan-200/20 px-3 py-1 text-xs text-cyan-100">/data/logs/kanban.log</span>
          </div>
          <div className="grid gap-2 md:grid-cols-3">
            {logConfigRows.map(([label, value]) => (
              <div key={label} className="rounded-xl border border-white/8 bg-slate-950/35 p-3">
                <p className="text-xs text-slate-400">{label}</p>
                <p className="mt-1 break-all font-mono text-xs text-slate-100">{value}</p>
              </div>
            ))}
          </div>
        </section>

        <LogPanel title="最近错误日志" entries={snapshot.recentErrors} emptyText="暂无错误日志" />
        <LogPanel title="客户端错误" entries={snapshot.clientErrors} emptyText="暂无客户端错误" />
        <LogPanel title="资源加载错误" entries={snapshot.resourceErrors} emptyText="暂无资源加载错误" />
      </DiagnosticsShell>
    );
  });
}

function DiagnosticsShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-[linear-gradient(135deg,#07111f_0%,#0f172a_48%,#04111f_100%)] px-6 py-8 text-slate-100">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-5">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-100/70">KANBAN Diagnostics</p>
            <h1 className="mt-2 text-2xl font-semibold text-white">{title}</h1>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/admin" prefetch={false} className="rounded-xl border border-white/12 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:bg-white/8">
              后台管理
            </Link>
            <Link href="/" prefetch={false} className="rounded-xl bg-cyan-300 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200">
              返回看板
            </Link>
          </div>
        </header>
        {children}
      </div>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <section className="rounded-2xl border border-white/10 bg-white/6 p-5">
      <p className="text-xs text-slate-400">{label}</p>
      <p className="mt-2 break-all font-mono text-sm font-semibold text-cyan-50">{value}</p>
    </section>
  );
}

function LogPanel({ title, entries, emptyText }: { title: string; entries: DiagnosticLogEntry[]; emptyText: string }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-white/10 bg-white/6">
      <div className="flex items-center justify-between gap-3 border-b border-white/10 px-5 py-4">
        <h2 className="text-base font-semibold text-white">{title}</h2>
        <span className="text-xs text-slate-400">{entries.length} 条</span>
      </div>
      <div className="max-h-[440px] overflow-auto">
        {entries.length === 0 ? (
          <p className="px-5 py-6 text-sm text-slate-400">{emptyText}</p>
        ) : (
          <div className="divide-y divide-white/8">
            {entries.map((entry, index) => (
              <article key={`${entry.time}-${entry.requestId ?? index}-${entry.msg}`} className="px-5 py-4">
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                  <span>{entry.time || "-"}</span>
                  <span className="rounded-full border border-white/10 px-2 py-0.5 text-slate-200">{entry.level || "-"}</span>
                  {entry.source ? <span className="rounded-full border border-cyan-200/20 px-2 py-0.5 text-cyan-100">{entry.source}</span> : null}
                  {entry.status ? <span>status {entry.status}</span> : null}
                  {entry.durationMs ? <span>{entry.durationMs}ms</span> : null}
                </div>
                <p className="mt-2 text-sm font-semibold text-white">{entry.msg || entry.message || "-"}</p>
                {entry.errorMessage ? <p className="mt-1 text-xs leading-6 text-rose-100/85">{entry.errorName ? `${entry.errorName}: ` : ""}{entry.errorMessage}</p> : null}
                <div className="mt-2 grid gap-1 font-mono text-[11px] leading-5 text-slate-400 md:grid-cols-2">
                  {entry.requestId ? <span className="break-all">requestId: {entry.requestId}</span> : null}
                  {entry.path ? <span className="break-all">path: {entry.path}</span> : null}
                  {entry.username ? <span className="break-all">username: {entry.username}</span> : null}
                  {entry.display_name ? <span className="break-all">display_name: {entry.display_name}</span> : null}
                  {entry.boardId ? <span className="break-all">boardId: {entry.boardId}</span> : null}
                  {entry.resourceTag ? <span className="break-all">resource: {entry.resourceTag}</span> : null}
                  {entry.resourceUrl ? <span className="break-all">resourceUrl: {entry.resourceUrl}</span> : null}
                  {entry.url ? <span className="break-all">url: {entry.url}</span> : null}
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
