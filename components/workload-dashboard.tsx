"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import Image from "next/image";
import { AlertTriangle, ChartNoAxesCombined, ChartPie, ChevronDown, ChevronRight, ClipboardList, Clock3, Moon, ShieldAlert, Sun, Tag, Trophy, UsersRound, X } from "lucide-react";
import SearchMultiSelect from "@/components/search-multi-select";
import { avatarOptions, jobTitleLabel, roleLabel } from "@/lib/ui-options";
import type { CurrentUser, TeamSummary } from "@/lib/auth-models";
import type { BoardStatus } from "@/lib/board-data";

type DashboardTheme = "dark" | "light";

type DashboardTask = {
  id: string;
  title: string;
  description: string;
  projectId: string;
  projectName: string;
  status: BoardStatus;
  progress: number;
  workloadDays: number | null;
  effectiveWorkloadDays: number;
  owner: string;
  tester: string;
  priority: string;
  designDueDate: string;
  testDueDate: string;
  dueDate: string;
  blockedReason: string;
  tags: string[];
  completedAt: string | null;
  dueSoon: boolean;
  overdue: boolean;
  blocked: boolean;
  assigneeKind: "owner" | "tester";
};

type DashboardProject = {
  id: string;
  name: string;
  teamId: string;
  teamName: string;
  boardId: string;
  description: string;
  taskCount: number;
  workloadDays: number;
  statusCounts: Record<BoardStatus, number>;
  dueSoonCount: number;
  overdueCount: number;
  blockedCount: number;
  tasks: DashboardTask[];
};

type DashboardMember = {
  id: string;
  username: string;
  displayName: string;
  avatarKey: string;
  role: string;
  jobTitle: string;
  techStacks: string[];
  phone: string;
  taskCount: number;
  workloadDays: number;
  progress: number;
  dueSoonCount: number;
  overdueCount: number;
  blockedCount: number;
  tasks: DashboardTask[];
};

type DashboardData = {
  filters: { teamIds: string[]; projectIds: string[] };
  teams: TeamSummary[];
  projects: DashboardProject[];
  totals: {
    teams: number;
    projects: number;
    members: number;
    tasks: number;
    workloadDays: number;
    progress: number;
    dueSoon: number;
    overdue: number;
    blocked: number;
  };
  members: DashboardMember[];
  dueSoonDays: number;
  todayKey: string;
};

const emptyDashboard: DashboardData = {
  filters: { teamIds: [], projectIds: [] },
  teams: [],
  projects: [],
  totals: { teams: 0, projects: 0, members: 0, tasks: 0, workloadDays: 0, progress: 0, dueSoon: 0, overdue: 0, blocked: 0 },
  members: [],
  dueSoonDays: 2,
  todayKey: "",
};

export default function WorkloadDashboard(props: { currentUser: CurrentUser; publicView?: boolean }) {
  const { publicView = false } = props;
  const [data, setData] = useState<DashboardData>(emptyDashboard);
  const [selectedTeamIds, setSelectedTeamIds] = useState<string[]>([]);
  const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>([]);
  const [theme, setTheme] = useState<DashboardTheme>("dark");
  const [expandedMemberId, setExpandedMemberId] = useState<string | null>(null);
  const [selectedTask, setSelectedTask] = useState<DashboardTask | null>(null);
  const [selectedProject, setSelectedProject] = useState<DashboardProject | null>(null);
  const [selectedMember, setSelectedMember] = useState<DashboardMember | null>(null);

  useEffect(() => {
    let active = true;
    const params = new URLSearchParams();
    for (const teamId of selectedTeamIds) params.append("teamId", teamId);
    for (const projectId of selectedProjectIds) params.append("projectId", projectId);
    fetch(`/api/dashboard?${params.toString()}`)
      .then((response) => response.json() as Promise<DashboardData>)
      .then((payload) => {
        if (active) setData(payload);
      });
    return () => {
      active = false;
    };
  }, [selectedProjectIds, selectedTeamIds]);

  const teamOptions = useMemo(
    () =>
      data.teams.map((team) => ({
        value: team.id,
        label: team.name,
        meta: `${team.memberCount} 人`,
      })),
    [data.teams]
  );

  const projectOptions = useMemo(
    () =>
      data.projects
        .filter((project) => selectedTeamIds.length === 0 || selectedTeamIds.includes(project.teamId))
        .map((project) => ({
          value: project.id,
          label: project.name,
          meta: `${project.teamName || "未分组"} · ${project.taskCount} 项 · ${project.workloadDays} 人日`,
        })),
    [data.projects, selectedTeamIds]
  );

  const busiest = data.members[0];
  const idleCount = data.members.filter((member) => member.taskCount === 0).length;
  const rankedMembers = data.members.slice(0, 5);

  return (
    <main data-dashboard-theme={theme} className="relative min-h-screen overflow-hidden bg-[var(--dash-bg)] text-[var(--dash-text)]">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute left-[-8%] top-[-12%] h-[420px] w-[420px] rounded-full bg-[radial-gradient(circle,var(--dash-accent-glow),transparent_68%)] blur-3xl" />
        <div className="absolute right-[-10%] top-[18%] h-[460px] w-[460px] rounded-full bg-[radial-gradient(circle,var(--dash-hot-glow),transparent_72%)] blur-3xl" />
        <div className="absolute bottom-[-18%] left-[26%] h-[420px] w-[520px] rounded-full bg-[radial-gradient(circle,var(--dash-rim),transparent_72%)] blur-3xl" />
        <div className="absolute inset-0 opacity-40 [background-image:linear-gradient(rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.04)_1px,transparent_1px)] [background-size:32px_32px]" />
      </div>

      <div className="relative mx-auto flex min-h-screen w-full max-w-[2160px] flex-col gap-5 px-5 py-5 2xl:px-8">
        <header className="relative z-30 flex flex-wrap items-center gap-4 rounded-[28px] border border-[var(--dash-line)] bg-[var(--dash-panel-strong)] px-5 py-5 shadow-[0_24px_80px_var(--dash-shadow-soft)] backdrop-blur-xl">
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-2xl border border-[var(--dash-line)] bg-[var(--dash-panel)] shadow-[0_0_0_1px_rgba(255,255,255,0.04)]">
              <ChartNoAxesCombined size={20} />
            </div>
            <div>
              <h1 className="text-2xl font-semibold 2xl:text-4xl">项目负载大屏</h1>
            </div>
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-3">
            <div className="w-[240px] max-w-full">
              <SearchMultiSelect
                value={selectedTeamIds}
                options={teamOptions}
                onChange={(values) => {
                  setSelectedTeamIds(values);
                  setSelectedProjectIds((current) => current.filter((item) => projectOptions.some((option) => option.value === item)));
                }}
                placeholder="全部团队"
                summaryLabel="团队"
                searchPlaceholder="搜索团队"
                compact
                panelClassName="bg-[var(--dash-panel)]"
              />
            </div>
            <div className="w-[280px] max-w-full">
              <SearchMultiSelect
                value={selectedProjectIds}
                options={projectOptions}
                onChange={setSelectedProjectIds}
                placeholder="全部项目"
                summaryLabel="项目"
                searchPlaceholder="搜索项目"
                compact
                panelClassName="bg-[var(--dash-panel)]"
              />
            </div>
            <button
              type="button"
              onClick={() => setTheme((current) => (current === "dark" ? "light" : "dark"))}
              className="grid h-11 w-11 place-items-center rounded-2xl border border-[var(--dash-line)] bg-[var(--dash-panel)] transition hover:bg-[var(--dash-hover)] hover:shadow-[0_0_0_1px_var(--dash-rim)]"
            >
              {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            {!publicView ? (
              <Link
                href="/"
                prefetch={false}
                className="inline-flex h-11 items-center rounded-2xl bg-[linear-gradient(135deg,var(--dash-accent),var(--dash-hot))] px-4 text-sm font-semibold text-[var(--dash-accent-text)] shadow-[0_18px_38px_var(--dash-shadow)] transition hover:opacity-95"
              >
                进入看板
              </Link>
            ) : null}
          </div>
        </header>

        <section className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-9">
          <Metric label="团队" value={data.totals.teams} />
          <Metric label="项目" value={data.totals.projects} />
          <Metric label="人员" value={data.totals.members} />
          <Metric label="任务" value={data.totals.tasks} />
          <Metric label="人日" value={data.totals.workloadDays} />
          <Metric label="平均进度" value={`${data.totals.progress}%`} />
          <Metric label="临期" value={data.totals.dueSoon} accent="info" />
          <Metric label="超期" value={data.totals.overdue} accent="danger" />
          <Metric label="阻塞" value={data.totals.blocked} accent="warning" />
        </section>

        <section className="grid min-h-0 flex-1 gap-5 xl:grid-cols-[minmax(0,1fr)_400px] 2xl:grid-cols-[minmax(0,1fr)_460px]">
          <div className="rounded-3xl border border-[var(--dash-line)] bg-[var(--dash-panel)] p-4 shadow-[0_24px_70px_var(--dash-shadow-soft)] backdrop-blur-xl">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="flex items-center gap-2 text-lg font-semibold">
                <span className="grid h-7 w-7 place-items-center rounded-xl bg-[var(--dash-accent-soft)] text-[var(--dash-accent)]">
                  <UsersRound size={17} />
                </span>
                人员状态
              </h2>
              <div className="rounded-full border border-[var(--dash-line)] bg-[var(--dash-card)] px-3 py-1 text-xs text-[var(--dash-muted)]">
                提测临期阈值 {data.dueSoonDays} 天
              </div>
            </div>
            <div className="space-y-3">
              {data.members.map((member) => {
                const expanded = expandedMemberId === member.id;
                const width = Math.min(100, Math.max(0, member.progress));
                const previewTechStacks = member.techStacks.slice(0, 2);
                const hiddenTechStackCount = member.techStacks.length - previewTechStacks.length;
                return (
                  <article
                    key={member.id}
                    className="rounded-2xl border border-[var(--dash-line)] bg-[linear-gradient(180deg,var(--dash-card),var(--dash-card-bottom))] p-4 shadow-[0_18px_38px_var(--dash-shadow)] transition duration-300 hover:-translate-y-0.5 hover:border-[var(--dash-rim)] hover:shadow-[0_22px_48px_var(--dash-shadow-soft)]"
                  >
                    <div className="flex items-stretch gap-4">
                      <button type="button" onClick={() => setSelectedMember(member)} className="shrink-0 cursor-pointer">
                        <DashboardAvatar member={member} size="member" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setExpandedMemberId((current) => (current === member.id ? null : member.id))}
                        className="flex min-w-0 flex-1 items-stretch gap-3 text-left"
                      >
                        <span className="grid min-w-0 flex-1 content-between py-0.5">
                          <span className="flex min-w-0 items-start justify-between gap-3">
                            <span className="truncate font-semibold text-[var(--dash-name)]">{member.displayName || member.username}</span>
                            <span className="shrink-0 text-right text-xs text-[var(--dash-muted)]">
                              {member.taskCount} 项 · {member.workloadDays} 人日 · {member.progress}%
                            </span>
                          </span>
                          <span className="flex">
                            <span className="inline-flex rounded-full border border-[var(--dash-rim)] bg-[var(--dash-accent-soft)] px-2 py-0.5 text-[11px] font-semibold text-[var(--dash-accent)]">
                              {jobTitleLabel(member.jobTitle)}
                            </span>
                          </span>
                          <span className="flex min-w-0 items-center justify-between gap-3">
                            <span className="flex min-w-0 flex-wrap items-center gap-2 text-[11px]">
                              {previewTechStacks.map((item) => (
                                <span key={item} className="rounded-full border border-[var(--dash-hot)] bg-[var(--dash-hot-glow)] px-2 py-0.5 font-semibold text-[var(--dash-hot)]">{item}</span>
                              ))}
                              {hiddenTechStackCount > 0 ? (
                                <span className="rounded-full border border-[var(--dash-line)] bg-[var(--dash-track)] px-2 py-0.5 font-semibold text-[var(--dash-muted)]">
                                  +{hiddenTechStackCount}
                                </span>
                              ) : null}
                              {member.techStacks.length === 0 ? (
                                <span className="rounded-full bg-[var(--dash-track)] px-2 py-0.5 text-[var(--dash-muted)]">未设置技术栈</span>
                              ) : null}
                            </span>
                            {member.dueSoonCount > 0 || member.overdueCount > 0 || member.blockedCount > 0 ? (
                              <span className="ml-auto flex shrink-0 flex-wrap justify-end gap-1.5">
                                {member.dueSoonCount > 0 ? <WarningChip active tone="info">临期 {member.dueSoonCount}</WarningChip> : null}
                                {member.overdueCount > 0 ? <WarningChip active tone="danger">超期 {member.overdueCount}</WarningChip> : null}
                                {member.blockedCount > 0 ? <WarningChip active tone="warning">阻塞 {member.blockedCount}</WarningChip> : null}
                              </span>
                            ) : null}
                          </span>
                        </span>
                        {expanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                      </button>
                    </div>
                    <div className="mt-3 h-3 w-full overflow-hidden rounded-full bg-[var(--dash-track)] shadow-inner">
                      <div
                        className="h-full rounded-full bg-[linear-gradient(90deg,var(--dash-accent),var(--dash-hot))] shadow-[0_0_20px_var(--dash-accent-glow)] transition-all duration-700 ease-out"
                        style={{ width: `${width}%` }}
                      />
                    </div>
                    {expanded ? (
                      <div className="mt-4 grid gap-2 border-t border-[var(--dash-line)] pt-4">
                        {member.tasks.length > 0 ? (
                          member.tasks.map((task) => (
                            <DashboardCompactTaskRow key={task.id} task={task} onSelect={setSelectedTask} />
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
            <SidePanel title="分布" icon={<ChartPie size={17} />}>
              <div className="grid grid-cols-2 gap-3">
                <MiniStat label="空闲" value={idleCount} />
                <MiniStat label="最高负载" value={busiest ? busiest.taskCount : 0} />
                <MiniStat label="临期" value={data.totals.dueSoon} tone="info" />
                <MiniStat label="超期" value={data.totals.overdue} tone="danger" />
              </div>
            </SidePanel>
            <SidePanel title="负载排行" icon={<Trophy size={17} />}>
              <div className="space-y-3">
                {rankedMembers.length > 0 ? (
                  rankedMembers.map((member, index) => (
                    <button
                      key={member.id}
                      type="button"
                      onClick={() => setSelectedMember(member)}
                      className="w-full rounded-2xl bg-[var(--dash-card)] px-3 py-3 text-left shadow-[0_12px_28px_var(--dash-shadow)] transition hover:border-[var(--dash-rim)] hover:shadow-[0_20px_38px_var(--dash-shadow-soft)]"
                    >
                      <div className="flex items-center gap-3">
                        <div className="grid h-8 w-8 place-items-center rounded-xl bg-[var(--dash-accent-soft)] text-xs font-semibold text-[var(--dash-accent)]">
                          {index + 1}
                        </div>
                        <DashboardAvatar member={member} size="sm" />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-3">
                            <span className="truncate text-sm font-semibold">{member.displayName || member.username}</span>
                            <span className="text-xs text-[var(--dash-muted)]">{member.workloadDays} 人日</span>
                          </div>
                          <div className="mt-1 text-[11px] text-[var(--dash-muted)]">{jobTitleLabel(member.jobTitle)}</div>
                          <div className="mt-2 h-2 overflow-hidden rounded-full bg-[var(--dash-track)]">
                            <div
                              className="h-full rounded-full bg-[linear-gradient(90deg,var(--dash-hot),var(--dash-accent))] transition-all duration-700 ease-out"
                              style={{ width: `${Math.min(100, Math.max(14, member.progress))}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    </button>
                  ))
                ) : (
                  <div className="py-8 text-center text-sm text-[var(--dash-muted)]">暂无排行</div>
                )}
              </div>
            </SidePanel>
            <SidePanel title="任务池" icon={<ClipboardList size={17} />}>
              <div className="space-y-3">
                {data.projects.slice(0, 10).map((project) => (
                  <button
                    key={project.id}
                    type="button"
                    onClick={() => setSelectedProject(project)}
                    className="flex w-full items-start justify-between gap-3 rounded-2xl bg-[var(--dash-card)] px-3 py-3 text-left text-sm shadow-[0_12px_28px_var(--dash-shadow)] transition hover:border-[var(--dash-rim)] hover:shadow-[0_20px_38px_var(--dash-shadow-soft)]"
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{project.name}</span>
                      <span className="mt-1 flex flex-wrap gap-2 text-[11px] text-[var(--dash-muted)]">
                        <span className="rounded-full bg-[var(--dash-track)] px-2 py-0.5">{project.teamName || "未分组"}</span>
                        <span className="rounded-full bg-[var(--dash-track)] px-2 py-0.5">{project.workloadDays} 人日</span>
                      </span>
                    </span>
                    <span className="shrink-0 space-y-1">
                      {project.dueSoonCount > 0 ? <WarningDot tone="info" label={String(project.dueSoonCount)} /> : null}
                      {project.overdueCount > 0 ? <WarningDot tone="danger" label={String(project.overdueCount)} /> : null}
                      {project.blockedCount > 0 ? <WarningDot tone="warning" label={String(project.blockedCount)} /> : null}
                    </span>
                  </button>
                ))}
                {data.projects.length === 0 ? <div className="py-8 text-center text-sm text-[var(--dash-muted)]">暂无项目</div> : null}
              </div>
            </SidePanel>
          </aside>
        </section>
      </div>
      <style>{dashboardThemeCss}</style>
      {selectedProject ? <DashboardProjectDialog project={selectedProject} onClose={() => setSelectedProject(null)} onSelectTask={setSelectedTask} /> : null}
      {selectedTask ? (
        <DashboardTaskDialog
          task={selectedTask}
          members={data.members}
          onSelectMember={setSelectedMember}
          onClose={() => setSelectedTask(null)}
        />
      ) : null}
      {selectedMember ? <DashboardMemberDialog member={selectedMember} onClose={() => setSelectedMember(null)} /> : null}
    </main>
  );
}

function Metric({
  label,
  value,
  accent = "default",
}: {
  label: string;
  value: number | string;
  accent?: "default" | "info" | "danger" | "warning";
}) {
  return (
    <div
      className={`rounded-2xl border bg-[linear-gradient(180deg,var(--dash-panel-strong),var(--dash-panel))] px-3 py-3 shadow-[0_14px_30px_var(--dash-shadow)] backdrop-blur-xl transition duration-300 hover:-translate-y-0.5 ${metricToneClass(accent)}`}
    >
      <p className="text-xs text-[var(--dash-muted)]">{label}</p>
      <p className="mt-1 text-xl font-semibold 2xl:text-2xl">{value}</p>
    </div>
  );
}

function SidePanel({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-3xl border border-[var(--dash-line)] bg-[linear-gradient(180deg,var(--dash-panel),var(--dash-card-bottom))] p-4 shadow-[0_18px_48px_var(--dash-shadow)] backdrop-blur-xl">
      <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
        <span className="grid h-7 w-7 place-items-center rounded-xl bg-[var(--dash-accent-soft)] text-[var(--dash-accent)]">
          {icon}
        </span>
        {title}
      </h2>
      {children}
    </section>
  );
}

function MiniStat({ label, value, tone = "default" }: { label: string; value: number; tone?: "default" | "info" | "danger" }) {
  return (
    <div className={`rounded-2xl px-4 py-3 shadow-[0_14px_30px_var(--dash-shadow)] ${miniStatToneClass(tone)}`}>
      <p className="text-xs text-[var(--dash-muted)]">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
    </div>
  );
}

function DashboardAvatar({
  member,
  size = "md",
}: {
  member: Pick<DashboardMember, "avatarKey" | "displayName" | "username">;
  size?: "sm" | "md" | "lg" | "member" | "xl";
}) {
  const avatar = avatarOptions.find((item) => item.key === member.avatarKey);
  const sizeClass =
    size === "sm"
      ? "h-8 w-8 rounded-xl"
      : size === "lg"
        ? "h-[66px] w-[66px] rounded-2xl"
        : size === "member"
          ? "h-[84px] w-[84px] rounded-2xl"
          : size === "xl"
            ? "h-[88px] w-[88px] rounded-2xl"
            : "h-11 w-11 rounded-2xl";
  const imageSize = size === "sm" ? 32 : size === "lg" ? 66 : size === "member" ? 84 : size === "xl" ? 88 : 44;
  if (avatar) {
    return (
      <Image
        src={avatar.src}
        alt={member.displayName || member.username}
        width={imageSize}
        height={imageSize}
        className={`${sizeClass} shrink-0 border border-[var(--dash-line)] object-cover shadow-[0_8px_20px_var(--dash-shadow)]`}
      />
    );
  }
  return (
    <span className={`grid shrink-0 place-items-center bg-[var(--dash-accent-soft)] font-semibold text-[var(--dash-accent)] ${size === "sm" ? "h-8 w-8 rounded-xl text-xs" : size === "lg" ? "h-[66px] w-[66px] rounded-2xl text-lg" : size === "member" ? "h-[84px] w-[84px] rounded-2xl text-xl" : size === "xl" ? "h-[88px] w-[88px] rounded-2xl text-lg" : "h-11 w-11 rounded-2xl text-sm"}`}>
      {(member.displayName || member.username).slice(0, 1).toUpperCase()}
    </span>
  );
}

function MemberInline({
  label,
  name,
  member,
  onSelectMember,
}: {
  label: string;
  name: string;
  member: DashboardMember | null;
  onSelectMember: (member: DashboardMember) => void;
}) {
  const displayName = member?.displayName || name || member?.username || "-";
  return (
    <div className="rounded-2xl border border-[var(--dash-line)] bg-[var(--dash-card)] p-3">
      <div className="text-xs text-[var(--dash-muted)]">{label}</div>
      <button
        type="button"
        onClick={() => {
          if (member) {
            onSelectMember(member);
          }
        }}
        disabled={!member}
        className="mt-2 flex w-full items-center gap-2 rounded-xl text-left transition enabled:hover:bg-[var(--dash-hover)]"
      >
        {member ? <DashboardAvatar member={member} size="sm" /> : <span className="grid h-8 w-8 place-items-center rounded-xl bg-[var(--dash-track)] text-xs text-[var(--dash-muted)]">-</span>}
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold text-[var(--dash-text)]">{displayName}</span>
          <span className="block truncate text-[11px] text-[var(--dash-muted)]">{member ? `@${member.username}` : "未匹配成员"}</span>
        </span>
      </button>
    </div>
  );
}

function DashboardTaskDialog({
  task,
  members,
  onSelectMember,
  onClose,
}: {
  task: DashboardTask;
  members: DashboardMember[];
  onSelectMember: (member: DashboardMember) => void;
  onClose: () => void;
}) {
  const owner = findDashboardMemberByName(members, task.owner);
  const tester = findDashboardMemberByName(members, task.tester);
  return (
    <DialogShell title={task.title} onClose={onClose} eyebrow={statusLabel(task.status)}>
      <p className="mt-2 text-sm leading-6 text-[var(--dash-muted)]">{task.description || "暂无描述"}</p>
      {task.dueSoon || task.overdue || task.blocked ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {task.dueSoon ? <WarningChip active tone="info">临期</WarningChip> : null}
          {task.overdue ? <WarningChip active tone="danger">超期</WarningChip> : null}
          {task.blocked ? <WarningChip active tone="warning">阻塞</WarningChip> : null}
        </div>
      ) : null}
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <DashInfo label="项目" value={task.projectName} />
        <div className="rounded-2xl border border-[var(--dash-line)] bg-[var(--dash-card)] p-3">
          <div className="text-xs text-[var(--dash-muted)]">优先级</div>
          <span className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${priorityChipClass(task.priority)}`}>
            {priorityLabel(task.priority)}
          </span>
        </div>
        <MemberInline label="负责人" name={task.owner} member={owner} onSelectMember={onSelectMember} />
        <MemberInline label="测试员" name={task.tester} member={tester} onSelectMember={onSelectMember} />
        <DashInfo label="设计截止" value={task.designDueDate || "-"} />
        <DashInfo label="提测日期" value={task.testDueDate || "-"} />
        <DashInfo label="交付日期" value={task.dueDate || "-"} />
        <ProgressInfo value={task.progress} />
        <DashInfo label="工作量" value={`${task.effectiveWorkloadDays} 人日`} />
        <div className="rounded-2xl border border-[var(--dash-line)] bg-[var(--dash-card)] p-3">
          <div className="text-xs text-[var(--dash-muted)]">负载类型</div>
          <span className="mt-2 inline-flex rounded-full border border-[var(--dash-rim)] bg-[var(--dash-accent-soft)] px-2.5 py-1 text-xs font-semibold text-[var(--dash-accent)]">
            {task.assigneeKind === "tester" ? "测试负载" : "开发负载"}
          </span>
        </div>
      </div>
      <div className="mt-4 rounded-2xl border border-[var(--dash-line)] bg-[var(--dash-card)] p-4">
        <div className="flex items-center gap-1.5 text-xs text-[var(--dash-muted)]">
          <Tag size={13} />
          标签
        </div>
        <div className="mt-2 flex flex-wrap gap-2 text-sm font-medium">
          {task.tags.length > 0 ? (
            task.tags.map((tag) => (
              <span key={tag} className="rounded-full border border-[var(--dash-line)] bg-[var(--dash-track)] px-2.5 py-1 text-xs text-[var(--dash-text)]">
                {tag}
              </span>
            ))
          ) : (
            <span className="text-[var(--dash-muted)]">暂无标签</span>
          )}
        </div>
        {task.blockedReason ? <p className="mt-4 text-sm text-[var(--dash-muted)]">阻塞原因：{task.blockedReason}</p> : null}
      </div>
    </DialogShell>
  );
}

function DashboardCompactTaskRow({
  task,
  onSelect,
}: {
  task: DashboardTask;
  onSelect: (task: DashboardTask) => void;
}) {
  return (
    <button
      type="button"
      title={task.description || task.title}
      onClick={() => onSelect(task)}
      className={`group flex w-full flex-col rounded-2xl border bg-[linear-gradient(180deg,var(--dash-panel),var(--dash-card-bottom))] px-3 py-3 text-sm transition ${taskWarningFrameClass(task)}`}
    >
      <span className="flex w-full min-w-0 items-center gap-3 text-left">
        <span className="flex min-w-0 flex-1 items-baseline gap-2">
          <span className="shrink-0 truncate font-medium text-[var(--dash-text)]">{task.title}</span>
          <span className="flex min-w-0 flex-1 items-center gap-1.5 text-[11px] text-[var(--dash-muted)]">
            <span className="truncate">{task.description || task.projectName}</span>
            {task.tags.slice(0, 3).map((tag) => (
              <span
                key={tag}
                className="inline-flex shrink-0 items-center gap-1 rounded-full border border-[var(--dash-line)] bg-[var(--dash-track)] px-1.5 py-0.5 font-semibold text-[var(--dash-text)]"
              >
                <Tag size={10} />
                {tag}
              </span>
            ))}
            {task.tags.length > 3 ? (
              <span className="shrink-0 rounded-full bg-[var(--dash-track)] px-1.5 py-0.5 font-semibold text-[var(--dash-muted)]">
                +{task.tags.length - 3}
              </span>
            ) : null}
          </span>
        </span>
        <span className="ml-auto flex shrink-0 flex-wrap justify-end gap-1.5">
          {task.dueSoon ? <WarningDot tone="info" label="临期" /> : null}
          {task.overdue ? <WarningDot tone="danger" label="超期" /> : null}
          {task.blocked ? <WarningDot tone="warning" label="阻塞" /> : null}
        </span>
      </span>
      <span className="mt-2 flex items-center gap-2">
        <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--dash-track)]">
          <span
            className="block h-full rounded-full bg-[var(--dash-accent)] transition-all duration-500"
            style={{ width: `${Math.min(100, Math.max(0, task.progress))}%` }}
          />
        </span>
        <span className="w-9 text-right text-[11px] font-semibold text-[var(--dash-muted)]">{task.progress}%</span>
      </span>
    </button>
  );
}

function DashboardProjectDialog({
  project,
  onClose,
  onSelectTask,
}: {
  project: DashboardProject;
  onClose: () => void;
  onSelectTask: (task: DashboardTask) => void;
}) {
  return (
    <DialogShell title={project.name} onClose={onClose} eyebrow="项目概览" maxWidth="max-w-[760px]">
      <p className="mt-2 text-sm leading-6 text-[var(--dash-muted)]">{project.description || "暂无项目说明"}</p>
      {project.dueSoonCount > 0 || project.overdueCount > 0 || project.blockedCount > 0 ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {project.dueSoonCount > 0 ? <WarningChip active tone="info">临期 {project.dueSoonCount}</WarningChip> : null}
          {project.overdueCount > 0 ? <WarningChip active tone="danger">超期 {project.overdueCount}</WarningChip> : null}
          {project.blockedCount > 0 ? <WarningChip active tone="warning">阻塞 {project.blockedCount}</WarningChip> : null}
        </div>
      ) : null}
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <DashInfo label="团队" value={project.teamName || "-"} />
        <DashInfo label="任务总数" value={`${project.taskCount}`} />
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-5">
        <DashInfo label="需求池" value={`${project.statusCounts.backlog}`} />
        <DashInfo label="设计中" value={`${project.statusCounts.design}`} />
        <DashInfo label="开发中" value={`${project.statusCounts.dev}`} />
        <DashInfo label="测试中" value={`${project.statusCounts.test}`} />
        <DashInfo label="已完成" value={`${project.statusCounts.done}`} />
      </div>
      <div className="mt-5 space-y-2">
        {project.tasks.length > 0 ? (
          project.tasks.map((task) => (
            <DashboardCompactTaskRow key={task.id} task={task} onSelect={onSelectTask} />
          ))
        ) : (
          <div className="rounded-xl border border-dashed border-[var(--dash-line)] px-3 py-5 text-center text-sm text-[var(--dash-muted)]">
            暂无任务
          </div>
        )}
      </div>
    </DialogShell>
  );
}

function DashboardMemberDialog({
  member,
  onClose,
}: {
  member: DashboardMember;
  onClose: () => void;
}) {
  return (
    <DialogShell onClose={onClose} maxWidth="max-w-[520px]">
      <div className="flex items-stretch gap-4">
        <DashboardAvatar member={member} size="xl" />
        <div className="grid h-[88px] min-w-0 flex-1 content-center gap-3 py-0.5">
          <p className="truncate text-xl font-semibold leading-none text-[var(--dash-name)]">{member.displayName || member.username}</p>
          <span className="inline-flex w-fit items-center overflow-hidden rounded-full border border-[var(--dash-rim)] text-xs font-semibold leading-none">
            <span className="border-r border-[var(--dash-line)] bg-[var(--dash-card)] px-2 py-1 text-[var(--dash-muted)]">系统角色</span>
            <span className="bg-[var(--dash-accent-soft)] px-2.5 py-1 text-[var(--dash-accent)]">{roleLabel(member.role)}</span>
          </span>
        </div>
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <DashInfo label="职位" value={jobTitleLabel(member.jobTitle)} />
        <DashInfo label="手机" value={member.phone || "-"} />
      </div>
      <div className="mt-3 rounded-2xl border border-[var(--dash-line)] bg-[var(--dash-card)] px-4 py-3">
        <div className="text-xs text-[var(--dash-muted)]">技术栈</div>
        <div className="mt-2 flex flex-wrap gap-2">
          {member.techStacks.length > 0 ? (
            member.techStacks.map((item) => (
              <span key={item} className="rounded-full border border-[var(--dash-hot)] bg-[var(--dash-hot-glow)] px-2.5 py-1 text-xs font-semibold text-[var(--dash-hot)]">
                {item}
              </span>
            ))
          ) : (
            <span className="rounded-full bg-[var(--dash-track)] px-2.5 py-1 text-xs text-[var(--dash-muted)]">未设置技术栈</span>
          )}
        </div>
      </div>
    </DialogShell>
  );
}

function DialogShell({
  title,
  eyebrow,
  children,
  onClose,
  maxWidth = "max-w-[560px]",
}: {
  title?: string;
  eyebrow?: string;
  children: ReactNode;
  onClose: () => void;
  maxWidth?: string;
}) {
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/35 px-4">
      <div className={`w-full ${maxWidth} rounded-[28px] border border-[var(--dash-line)] bg-[linear-gradient(180deg,var(--dash-panel-strong),var(--dash-panel))] p-6 shadow-[0_28px_90px_var(--dash-shadow-soft)] backdrop-blur-xl`}>
        <div className="flex items-start justify-between gap-3">
          <div>
            {eyebrow ? (
              <div className="inline-flex rounded-full bg-[var(--dash-accent-soft)] px-3 py-1 text-xs font-semibold text-[var(--dash-accent)]">
                {eyebrow}
              </div>
            ) : null}
            {title ? <h3 className="mt-3 text-xl font-semibold">{title}</h3> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-10 w-10 place-items-center rounded-2xl border border-[var(--dash-line)] bg-[var(--dash-panel)] text-[var(--dash-muted)] transition hover:text-[var(--dash-text)]"
          >
            <X size={16} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function DashInfo({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[var(--dash-line)] bg-[var(--dash-card)] px-4 py-3">
      <div className="text-xs text-[var(--dash-muted)]">{label}</div>
      <div className="mt-1 text-sm font-medium">{value}</div>
    </div>
  );
}

function ProgressInfo({ value }: { value: number }) {
  const width = Math.min(100, Math.max(0, value));
  return (
    <div className="rounded-2xl border border-[var(--dash-line)] bg-[var(--dash-card)] px-4 py-3">
      <div className="flex items-center justify-between gap-3 text-xs text-[var(--dash-muted)]">
        <span>进度</span>
        <span className="font-semibold text-[var(--dash-text)]">{width}%</span>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-[var(--dash-track)]">
        <div
          className="h-full rounded-full bg-[linear-gradient(90deg,var(--dash-accent),var(--dash-hot))] transition-all duration-700 ease-out"
          style={{ width: `${width}%` }}
        />
      </div>
    </div>
  );
}

function WarningChip({
  children,
  active,
  tone,
}: {
  children: ReactNode;
  active?: boolean;
  tone: "default" | "info" | "danger" | "warning";
}) {
  return <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${warningChipClass(tone, active ?? false)}`}>{children}</span>;
}

function WarningDot({ tone, label }: { tone: "info" | "danger" | "warning"; label: string }) {
  const icon = tone === "danger" ? <AlertTriangle size={12} /> : tone === "warning" ? <ShieldAlert size={12} /> : <Clock3 size={12} />;
  return <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-semibold ${warningChipClass(tone, true)}`}>{icon}{label}</span>;
}

function taskWarningFrameClass(task: Pick<DashboardTask, "dueSoon" | "overdue" | "blocked">) {
  if (task.overdue) {
    return "border-[var(--dash-danger-line)] shadow-[0_0_0_1px_var(--dash-danger-line),0_12px_28px_var(--dash-shadow)] hover:border-[var(--dash-danger-rim)] hover:shadow-[0_0_28px_var(--dash-danger-soft),0_20px_38px_var(--dash-shadow-soft)]";
  }
  if (task.blocked) {
    return "border-[var(--dash-warning-line)] shadow-[0_0_0_1px_var(--dash-warning-line),0_12px_28px_var(--dash-shadow)] hover:border-[var(--dash-warning-rim)] hover:shadow-[0_0_28px_var(--dash-warning-soft),0_20px_38px_var(--dash-shadow-soft)]";
  }
  if (task.dueSoon) {
    return "border-[var(--dash-info-line)] shadow-[0_0_0_1px_var(--dash-info-line),0_12px_28px_var(--dash-shadow)] hover:border-[var(--dash-info-rim)] hover:shadow-[0_0_28px_var(--dash-info-soft),0_20px_38px_var(--dash-shadow-soft)]";
  }
  return "border-[var(--dash-line)] shadow-[0_12px_28px_var(--dash-shadow)] hover:border-[var(--dash-rim)] hover:shadow-[0_20px_38px_var(--dash-shadow-soft)]";
}

function statusLabel(value: BoardStatus) {
  return {
    backlog: "需求池",
    design: "设计中",
    dev: "开发中",
    test: "测试中",
    done: "已完成",
  }[value];
}

function priorityLabel(value: string) {
  if (value === "high") return "高优先级";
  if (value === "medium") return "中优先级";
  if (value === "low") return "低优先级";
  return value || "-";
}

function priorityChipClass(value: string) {
  if (value === "high") return "bg-[rgba(220,38,38,0.16)] text-[#ef4444]";
  if (value === "medium") return "bg-[rgba(245,158,11,0.16)] text-[#f59e0b]";
  if (value === "low") return "bg-[rgba(34,197,94,0.16)] text-[#22c55e]";
  return "bg-[var(--dash-track)] text-[var(--dash-muted)]";
}

function findDashboardMemberByName(members: DashboardMember[], name: string) {
  const normalized = name.trim().toLowerCase();
  if (!normalized) {
    return null;
  }
  return (
    members.find((member) => member.displayName.trim().toLowerCase() === normalized) ??
    members.find((member) => member.username.trim().toLowerCase() === normalized) ??
    null
  );
}

function metricToneClass(tone: "default" | "info" | "danger" | "warning") {
  if (tone === "info") return "border-[var(--dash-info-line)] hover:border-[var(--dash-info-rim)]";
  if (tone === "danger") return "border-[var(--dash-danger-line)] hover:border-[var(--dash-danger-rim)]";
  if (tone === "warning") return "border-[var(--dash-warning-line)] hover:border-[var(--dash-warning-rim)]";
  return "border-[var(--dash-line)] hover:border-[var(--dash-rim)]";
}

function miniStatToneClass(tone: "default" | "info" | "danger") {
  if (tone === "info") return "bg-[linear-gradient(180deg,var(--dash-info-soft),var(--dash-card-bottom))]";
  if (tone === "danger") return "bg-[linear-gradient(180deg,var(--dash-danger-soft),var(--dash-card-bottom))]";
  return "bg-[linear-gradient(180deg,var(--dash-card),var(--dash-card-bottom))]";
}

function warningChipClass(tone: "default" | "info" | "danger" | "warning", active: boolean) {
  if (tone === "info") return active ? "bg-[var(--dash-info-soft)] text-[var(--dash-info)]" : "bg-[var(--dash-track)] text-[var(--dash-muted)]";
  if (tone === "danger") return active ? "bg-[var(--dash-danger-soft)] text-[var(--dash-danger)]" : "bg-[var(--dash-track)] text-[var(--dash-muted)]";
  if (tone === "warning") return active ? "bg-[var(--dash-warning-soft)] text-[var(--dash-warning)]" : "bg-[var(--dash-track)] text-[var(--dash-muted)]";
  return active ? "bg-[var(--dash-track)] text-[var(--dash-text)]" : "bg-[var(--dash-track)] text-[var(--dash-muted)]";
}

const dashboardThemeCss = `
  [data-dashboard-theme="dark"] {
    --dash-bg: #070b14;
    --dash-panel-strong: rgba(8, 13, 27, 0.78);
    --dash-panel: rgba(15, 23, 42, 0.82);
    --dash-card: rgba(30, 41, 59, 0.62);
    --dash-card-bottom: rgba(17, 24, 39, 0.78);
    --dash-text: #e5f3ff;
    --dash-name: #ffffff;
    --dash-muted: #8aa2bd;
    --dash-line: rgba(148, 163, 184, 0.22);
    --dash-hover: rgba(51, 65, 85, 0.8);
    --dash-track: rgba(148, 163, 184, 0.18);
    --dash-accent: #67e8f9;
    --dash-accent-soft: rgba(103, 232, 249, 0.12);
    --dash-accent-glow: rgba(103, 232, 249, 0.28);
    --dash-accent-text: #04111d;
    --dash-hot: #a78bfa;
    --dash-hot-glow: rgba(167, 139, 250, 0.22);
    --dash-rim: rgba(103, 232, 249, 0.32);
    --dash-shadow: rgba(0, 0, 0, 0.28);
    --dash-shadow-soft: rgba(0, 0, 0, 0.44);
    --dash-info: #fb923c;
    --dash-info-soft: rgba(251, 146, 60, 0.18);
    --dash-info-line: rgba(251, 146, 60, 0.28);
    --dash-info-rim: rgba(251, 146, 60, 0.48);
    --dash-danger: #f43f5e;
    --dash-danger-soft: rgba(244, 63, 94, 0.18);
    --dash-danger-line: rgba(244, 63, 94, 0.28);
    --dash-danger-rim: rgba(244, 63, 94, 0.5);
    --dash-warning: #fbbf24;
    --dash-warning-soft: rgba(251, 191, 36, 0.14);
    --dash-warning-line: rgba(251, 191, 36, 0.18);
    --dash-warning-rim: rgba(251, 191, 36, 0.38);
  }
  [data-dashboard-theme="light"] {
    --dash-bg: #eef4fb;
    --dash-panel-strong: rgba(255, 255, 255, 0.92);
    --dash-panel: rgba(255, 255, 255, 0.88);
    --dash-card: rgba(247, 250, 255, 0.96);
    --dash-card-bottom: rgba(237, 243, 253, 0.98);
    --dash-text: #0f172a;
    --dash-name: #0f172a;
    --dash-muted: #5b6b84;
    --dash-line: rgba(15, 23, 42, 0.14);
    --dash-hover: #f3f7fd;
    --dash-track: rgba(15, 23, 42, 0.1);
    --dash-accent: #0f766e;
    --dash-accent-soft: rgba(15, 118, 110, 0.12);
    --dash-accent-glow: rgba(15, 118, 110, 0.18);
    --dash-accent-text: #ffffff;
    --dash-hot: #2563eb;
    --dash-hot-glow: rgba(37, 99, 235, 0.18);
    --dash-rim: rgba(37, 99, 235, 0.26);
    --dash-shadow: rgba(15, 23, 42, 0.1);
    --dash-shadow-soft: rgba(15, 23, 42, 0.16);
    --dash-info: #ea580c;
    --dash-info-soft: rgba(234, 88, 12, 0.12);
    --dash-info-line: rgba(234, 88, 12, 0.18);
    --dash-info-rim: rgba(234, 88, 12, 0.32);
    --dash-danger: #dc2626;
    --dash-danger-soft: rgba(220, 38, 38, 0.1);
    --dash-danger-line: rgba(220, 38, 38, 0.14);
    --dash-danger-rim: rgba(220, 38, 38, 0.26);
    --dash-warning: #d97706;
    --dash-warning-soft: rgba(217, 119, 6, 0.12);
    --dash-warning-line: rgba(217, 119, 6, 0.14);
    --dash-warning-rim: rgba(217, 119, 6, 0.26);
  }
`;
