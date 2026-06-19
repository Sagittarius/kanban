"use client";

import { AlertTriangle, Database, HardDriveDownload, RefreshCw, ShieldAlert, Wrench } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { MaintenanceState } from "@/lib/maintenance";

type MaintenancePageProps = {
  initialState: MaintenanceState;
  appVersion: string;
  imageTag: string;
};

type StatusPayload = {
  active: boolean;
  state: MaintenanceState | null;
  appVersion: string;
  imageTag: string;
};

const statusText: Record<MaintenanceState["mode"], string> = {
  pending_upgrade: "待升级",
  upgrade_running: "升级中",
  upgrade_failed: "升级失败",
};

export default function MaintenancePage({
  initialState,
  appVersion,
  imageTag,
}: MaintenancePageProps) {
  const [maintenanceState, setMaintenanceState] = useState(initialState);
  const [token, setToken] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let cancelled = false;

    const timer = window.setInterval(async () => {
      try {
        const response = await fetch("/api/maintenance/status", { cache: "no-store" });
        const payload = (await response.json()) as StatusPayload;

        if (cancelled) {
          return;
        }

        if (!payload.active) {
          window.location.replace("/");
          return;
        }

        if (payload.state) {
          setMaintenanceState(payload.state);
        }
      } catch {
        // keep current state and continue polling
      }
    }, 3000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  const canSubmit = maintenanceState.mode !== "upgrade_running" && !submitting;

  const rollbackCommand = useMemo(
    () => [
      "docker stop kanban",
      "docker rm kanban",
      "# 使用旧镜像重新启动容器",
      "docker compose up -d",
    ].join("\n"),
    []
  );

  async function triggerUpgrade() {
    setSubmitting(true);
    setMessage("");

    try {
      const response = await fetch("/api/maintenance/upgrade", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ token }),
      });

      const payload = await response.json();

      if (!response.ok) {
        setMessage(payload.error ?? "升级请求失败");
        return;
      }

      setMessage(payload.message ?? "升级任务已启动");
      setMaintenanceState((current) => ({
        ...current,
        mode: "upgrade_running",
        message: payload.message ?? "正在执行数据库升级",
      }));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "升级请求失败");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-[var(--bg)] px-6 py-10 text-[var(--text)]">
      <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-6">
        <section className="rounded-xl border border-[var(--border)] bg-[var(--panel)] p-8 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-3">
              <div className="inline-flex items-center gap-2 rounded-full border border-[var(--warning)] bg-[var(--warning-soft)] px-3 py-1 text-sm font-medium text-[var(--warning)]">
                <ShieldAlert size={15} />
                维护模式
              </div>
              <div>
                <h1 className="text-2xl font-semibold">数据库升级待处理</h1>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--muted)]">
                  当前程序版本与数据库结构不一致。业务页面和业务接口已暂停访问。请先完成安全升级，或回退到旧镜像版本。
                </p>
              </div>
            </div>
            <div className="rounded-lg border border-[var(--border)] bg-[var(--card-section)] px-4 py-3 text-sm">
              <div className="font-medium text-[var(--text)]">{statusText[maintenanceState.mode]}</div>
              <div className="mt-1 text-[var(--muted)]">{maintenanceState.updatedAt || "等待状态更新"}</div>
            </div>
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-6">
            <div className="rounded-xl border border-[var(--border)] bg-[var(--panel)] p-6 shadow-sm">
              <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-[var(--text)]">
                <Database size={16} />
                升级信息
              </div>
              <dl className="grid gap-4 text-sm sm:grid-cols-2">
                <InfoRow label="应用版本" value={appVersion} />
                <InfoRow label="镜像标签" value={imageTag} />
                <InfoRow label="数据库路径" value={maintenanceState.databasePath} full />
                <InfoRow label="数据库版本" value={maintenanceState.lastKnownDbVersion || "unknown"} />
                <InfoRow label="最近备份" value={maintenanceState.lastBackupPath || "暂无"} full />
              </dl>

              <div className="mt-6">
                <div className="mb-2 text-sm font-medium text-[var(--text)]">待执行迁移</div>
                <div className="rounded-lg border border-[var(--border)] bg-[var(--card-section)] p-4">
                  <ul className="space-y-2 text-sm text-[var(--muted)]">
                    {maintenanceState.pendingMigrations.map((migration) => (
                      <li key={migration} className="font-mono text-xs text-[var(--text)]">
                        {migration}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="mt-6">
                <div className="mb-2 text-sm font-medium text-[var(--text)]">当前状态</div>
                <div className="rounded-lg border border-[var(--border)] bg-[var(--card-section)] px-4 py-3 text-sm text-[var(--muted)]">
                  {maintenanceState.message || "等待处理"}
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-[var(--border)] bg-[var(--panel)] p-6 shadow-sm">
              <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-[var(--text)]">
                <Wrench size={16} />
                页面升级
              </div>
              <div className="space-y-4">
                <div>
                  <label htmlFor="maintenance-token" className="mb-2 block text-sm font-medium text-[var(--text)]">
                    维护口令
                  </label>
                  <input
                    id="maintenance-token"
                    type="password"
                    value={token}
                    onChange={(event) => setToken(event.target.value)}
                    placeholder="输入 KANBAN_MAINTENANCE_TOKEN"
                    className="w-full rounded-lg border border-[var(--border)] bg-[var(--card-section)] px-3 py-2.5 text-sm text-[var(--text)] outline-none transition focus:border-[var(--accent)]"
                  />
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={triggerUpgrade}
                    disabled={!canSubmit}
                    className="inline-flex items-center gap-2 rounded-lg bg-[var(--text)] px-4 py-2.5 text-sm font-medium text-[var(--panel)] transition disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {maintenanceState.mode === "upgrade_running" ? <RefreshCw size={15} className="animate-spin" /> : <HardDriveDownload size={15} />}
                    开始升级
                  </button>
                  {message ? <span className="text-sm text-[var(--muted)]">{message}</span> : null}
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="rounded-xl border border-[var(--border)] bg-[var(--panel)] p-6 shadow-sm">
              <div className="mb-4 text-sm font-semibold text-[var(--text)]">命令行升级</div>
              <pre className="overflow-x-auto rounded-lg border border-[var(--border)] bg-[var(--card-section)] p-4 text-xs leading-6 text-[var(--muted)]">
{`docker exec -it kanban sh
node scripts/upgrade-local-sqlite.mjs`}
              </pre>
            </div>

            <div className="rounded-xl border border-[var(--border)] bg-[var(--panel)] p-6 shadow-sm">
              <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-[var(--text)]">
                <AlertTriangle size={16} />
                回退说明
              </div>
              <p className="text-sm leading-6 text-[var(--muted)]">
                程序回退通过回退 Docker 镜像完成。数据库恢复仍是独立运维动作，仅在确认需要恢复备份时执行。
              </p>
              <pre className="mt-4 overflow-x-auto rounded-lg border border-[var(--border)] bg-[var(--card-section)] p-4 text-xs leading-6 text-[var(--muted)]">
                {rollbackCommand}
              </pre>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

function InfoRow({
  label,
  value,
  full = false,
}: {
  label: string;
  value: string;
  full?: boolean;
}) {
  return (
    <div className={full ? "sm:col-span-2" : ""}>
      <dt className="mb-1 text-xs font-medium uppercase tracking-[0.08em] text-[var(--muted)]">{label}</dt>
      <dd className="break-all text-sm text-[var(--text)]">{value || "-"}</dd>
    </div>
  );
}
