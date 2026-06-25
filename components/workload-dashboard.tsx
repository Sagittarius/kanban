"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { Activity, ChevronDown, ChevronRight, Moon, Sun } from "lucide-react";
import type { CurrentUser, TeamSummary } from "@/lib/auth-models";
import type { BoardStatus } from "@/lib/board-data";

type DashboardTheme = "dark" | "light";

type DashboardProject = {
  id: string;
  name: string;
  teamId: string;
  boardId: string;
};

type DashboardTask = {
  id: string;
  title: string;
  description: string;
  projectId: string;
  projectName: string;
  status: BoardStatus;
  progress: number;
};

type DashboardMember = {
  id: string;
  username: string;
  displayName: string;
  avatarKey: string;
  taskCount: number;
  progress: number;
  tasks: DashboardTask[];
};

type DashboardData = {
  filters: { teamId: string; projectId: string };
  teams: TeamSummary[];
  projects: DashboardProject[];
  totals: {
    teams: number;
    projects: number;
    members: number;
    tasks: number;
    progress: number;
  };
  members: DashboardMember[];
};

type SelectOption = {
  value: string;
  label: string;
  meta?: string;
};

const emptyDashboard: DashboardData = {
  filters: { teamId: "", projectId: "" },
  teams: [],
  projects: [],
  totals: { teams: 0, projects: 0, members: 0, tasks: 0, progress: 0 },
  members: [],
};

export default function WorkloadDashboard({ currentUser, publicView = false }: { currentUser: CurrentUser; publicView?: boolean }) {
  const [data, setData] = useState<DashboardData>(emptyDashboard);
  const [teamId, setTeamId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [theme, setTheme] = useState<DashboardTheme>("dark");
  const [expandedMemberId, setExpandedMemberId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const params = new URLSearchParams();
    if (teamId) params.set("teamId", teamId);
    if (projectId) params.set("projectId", projectId);
    fetch(`/api/dashboard?${params.toString()}`)
      .then((response) => response.json() as Promise<DashboardData>)
      .then((payload) => {
        if (active) setData(payload);
      });
    return () => {
      active = false;
    };
  }, [projectId, teamId]);

  const teamOptions = useMemo<SelectOption[]>(
    () => data.teams.map((team) => ({ value: team.id, label: team.name, meta: `${team.memberCount} 人` })),
    [data.teams]
  );

  const projectOptions = useMemo<SelectOption[]>(
    () =>
      data.projects
        .filter((project) => !teamId || project.teamId === teamId)
        .map((project) => ({ value: project.id, label: project.name })),
    [data.projects, teamId]
  );

  const busiest = data.members[0];
  const idleCount = data.members.filter((member) => member.taskCount === 0).length;

  return (
    <main data-dashboard-theme={theme} className="min-h-screen bg-[var(--dash-bg)] text-[var(--dash-text)]">
      <div className="mx-auto flex min-h-screen w-full max-w-[2160px] flex-col gap-5 px-5 py-5 2xl:px-8">
        <header className="flex flex-wrap items-center gap-4 border-b border-[var(--dash-line)] pb-5">
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-2xl border border-[var(--dash-line)] bg-[var(--dash-panel)]">
              <Activity size={20} />
            </div>
            <div>
              <h1 className="text-2xl font-semibold 2xl:text-4xl">工作饱和度</h1>
              <p className="mt-1 text-sm text-[var(--dash-muted)]">
                {publicView ? "公共视图" : currentUser.displayName || currentUser.username}
              </p>
            </div>
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-3">
            <DashboardSearchSelect
              value={teamId}
              options={teamOptions}
              onChange={(value) => {
                setTeamId(value);
                setProjectId("");
              }}
              placeholder="全部团队"
            />
            <DashboardSearchSelect
              value={projectId}
              options={projectOptions}
              onChange={setProjectId}
              placeholder="全部项目"
            />
            <button
              type="button"
              onClick={() => setTheme((current) => (current === "dark" ? "light" : "dark"))}
              className="grid h-11 w-11 place-items-center rounded-2xl border border-[var(--dash-line)] bg-[var(--dash-panel)] transition hover:bg-[var(--dash-hover)]"
            >
              {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <Link href="/" className="inline-flex h-11 items-center rounded-2xl bg-[var(--dash-accent)] px-4 text-sm font-semibold text-[var(--dash-accent-text)]">
              返回看板
            </Link>
          </div>
        </header>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <Metric label="团队" value={data.totals.teams} />
          <Metric label="项目" value={data.totals.projects} />
          <Metric label="人员" value={data.totals.members} />
          <Metric label="任务" value={data.totals.tasks} />
          <Metric label="平均进度" value={`${data.totals.progress}%`} />
        </section>

        <section className="grid min-h-0 flex-1 gap-5 xl:grid-cols-[minmax(0,1fr)_380px] 2xl:grid-cols-[minmax(0,1fr)_440px]">
          <div className="rounded-3xl border border-[var(--dash-line)] bg-[var(--dash-panel)] p-4 shadow-[0_24px_70px_var(--dash-shadow)]">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">成员状态</h2>
            </div>
            <div className="space-y-3">
              {data.members.map((member) => {
                const expanded = expandedMemberId === member.id;
                const width = Math.min(100, Math.max(0, member.progress));
                return (
                  <article key={member.id} className="rounded-2xl border border-[var(--dash-line)] bg-[var(--dash-card)] p-4">
                    <button
                      type="button"
                      onClick={() => setExpandedMemberId((current) => (current === member.id ? null : member.id))}
                      className="flex w-full items-center gap-4 text-left"
                    >
                      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[var(--dash-accent-soft)] text-sm font-semibold text-[var(--dash-accent)]">
                        {(member.displayName || member.username).slice(0, 1).toUpperCase()}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center justify-between gap-3">
                          <span className="truncate font-semibold">{member.displayName || member.username}</span>
                          <span className="text-sm text-[var(--dash-muted)]">{member.taskCount} 项 · {member.progress}%</span>
                        </span>
                        <span className="mt-3 block h-3 overflow-hidden rounded-full bg-[var(--dash-track)]">
                          <span
                            className="block h-full rounded-full bg-[linear-gradient(90deg,var(--dash-accent),var(--dash-hot))] transition-all duration-500"
                            style={{ width: `${width}%` }}
                          />
                        </span>
                      </span>
                      {expanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                    </button>
                    {expanded ? (
                      <div className="mt-4 grid gap-2 border-t border-[var(--dash-line)] pt-4">
                        {member.tasks.length > 0 ? (
                          member.tasks.map((task) => (
                            <div
                              key={task.id}
                              title={task.description || task.title}
                              className="flex items-center justify-between gap-3 rounded-xl bg-[var(--dash-panel)] px-3 py-2 text-sm"
                            >
                              <span className="min-w-0 truncate">{task.title}</span>
                              <span className="shrink-0 text-xs text-[var(--dash-muted)]">{task.projectName}</span>
                            </div>
                          ))
                        ) : (
                          <div className="rounded-xl border border-dashed border-[var(--dash-line)] px-3 py-5 text-center text-sm text-[var(--dash-muted)]">
                            暂无任务
                          </div>
                        )}
                      </div>
                    ) : null}
                  </article>
                );
              })}
              {data.members.length === 0 ? (
                <div className="grid min-h-[280px] place-items-center rounded-2xl border border-dashed border-[var(--dash-line)] text-sm text-[var(--dash-muted)]">
                  暂无成员
                </div>
              ) : null}
            </div>
          </div>

          <aside className="space-y-4">
            <SidePanel title="分布">
              <div className="grid grid-cols-2 gap-3">
                <MiniStat label="空闲" value={idleCount} />
                <MiniStat label="最高负载" value={busiest ? busiest.taskCount : 0} />
              </div>
            </SidePanel>
            <SidePanel title="任务池">
              <div className="space-y-3">
                {data.projects.slice(0, 10).map((project) => {
                  const count = data.members.reduce(
                    (total, member) => total + member.tasks.filter((task) => task.projectId === project.id).length,
                    0
                  );
                  return (
                    <div key={project.id} className="flex items-center justify-between gap-3 rounded-2xl bg-[var(--dash-card)] px-3 py-3 text-sm">
                      <span className="min-w-0 truncate">{project.name}</span>
                      <span className="rounded-full bg-[var(--dash-panel)] px-2.5 py-1 text-xs text-[var(--dash-muted)]">{count}</span>
                    </div>
                  );
                })}
                {data.projects.length === 0 ? <div className="py-8 text-center text-sm text-[var(--dash-muted)]">暂无项目</div> : null}
              </div>
            </SidePanel>
          </aside>
        </section>
      </div>
      <style>{`
        [data-dashboard-theme="dark"] {
          --dash-bg: #070b14;
          --dash-panel: rgba(15, 23, 42, 0.82);
          --dash-card: rgba(30, 41, 59, 0.62);
          --dash-text: #e5f3ff;
          --dash-muted: #8aa2bd;
          --dash-line: rgba(148, 163, 184, 0.22);
          --dash-hover: rgba(51, 65, 85, 0.8);
          --dash-track: rgba(148, 163, 184, 0.18);
          --dash-accent: #67e8f9;
          --dash-accent-soft: rgba(103, 232, 249, 0.12);
          --dash-accent-text: #04111d;
          --dash-hot: #a78bfa;
          --dash-shadow: rgba(0, 0, 0, 0.28);
        }
        [data-dashboard-theme="light"] {
          --dash-bg: #f5f7fb;
          --dash-panel: rgba(255, 255, 255, 0.86);
          --dash-card: rgba(241, 245, 249, 0.92);
          --dash-text: #0f172a;
          --dash-muted: #64748b;
          --dash-line: rgba(15, 23, 42, 0.12);
          --dash-hover: #eef2f7;
          --dash-track: rgba(15, 23, 42, 0.1);
          --dash-accent: #0f766e;
          --dash-accent-soft: rgba(15, 118, 110, 0.12);
          --dash-accent-text: #ffffff;
          --dash-hot: #2563eb;
          --dash-shadow: rgba(15, 23, 42, 0.08);
        }
      `}</style>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-3xl border border-[var(--dash-line)] bg-[var(--dash-panel)] px-5 py-4">
      <p className="text-sm text-[var(--dash-muted)]">{label}</p>
      <p className="mt-2 text-3xl font-semibold 2xl:text-4xl">{value}</p>
    </div>
  );
}

function SidePanel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-3xl border border-[var(--dash-line)] bg-[var(--dash-panel)] p-4">
      <h2 className="mb-4 text-lg font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl bg-[var(--dash-card)] px-4 py-3">
      <p className="text-xs text-[var(--dash-muted)]">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
    </div>
  );
}

function DashboardSearchSelect({
  value,
  options,
  onChange,
  placeholder,
}: {
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  placeholder: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selected = options.find((option) => option.value === value);
  const filtered = options.filter((option) => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return true;
    return [option.label, option.meta ?? ""].some((text) => text.toLowerCase().includes(normalized));
  });
  return (
    <div className="relative w-[210px] max-w-full">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="flex h-11 w-full items-center justify-between gap-3 rounded-2xl border border-[var(--dash-line)] bg-[var(--dash-panel)] px-3 text-left text-sm transition hover:bg-[var(--dash-hover)]"
      >
        <span className="min-w-0 truncate">{selected?.label ?? placeholder}</span>
        <span className="text-[var(--dash-muted)]">⌄</span>
      </button>
      {open ? (
        <div className="absolute right-0 z-40 mt-2 w-[260px] rounded-2xl border border-[var(--dash-line)] bg-[var(--dash-panel)] p-2 shadow-2xl">
          <div className="flex gap-2">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索"
              className="h-10 min-w-0 flex-1 rounded-xl border border-[var(--dash-line)] bg-[var(--dash-card)] px-3 text-sm outline-none"
            />
            {value ? (
              <button
                type="button"
                onClick={() => {
                  onChange("");
                  setOpen(false);
                }}
                className="rounded-xl border border-[var(--dash-line)] px-3 text-sm text-[var(--dash-muted)]"
              >
                清除
              </button>
            ) : null}
          </div>
          <div className="mt-2 max-h-[260px] overflow-y-auto">
            {filtered.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                  setQuery("");
                }}
                className="block w-full rounded-xl px-3 py-2 text-left text-sm hover:bg-[var(--dash-hover)]"
              >
                <span className="font-medium">{option.label}</span>
                {option.meta ? <span className="ml-2 text-xs text-[var(--dash-muted)]">{option.meta}</span> : null}
              </button>
            ))}
            {filtered.length === 0 ? <div className="px-3 py-4 text-center text-sm text-[var(--dash-muted)]">无匹配项</div> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
