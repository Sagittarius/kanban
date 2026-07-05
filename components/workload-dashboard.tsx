"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import Image from "next/image";
import MatrixRain from "react-matrix-rain";
import { AlertTriangle, Binary, ChartNoAxesCombined, ChartPie, ChevronDown, ChevronRight, ClipboardList, Clock3, Copyright, Edit3, Moon, ShieldAlert, Sun, Tag, Trophy, UsersRound, X } from "lucide-react";
import { LoadingSkeleton, LoadingStateBadge } from "@/components/loading-hint";
import DashboardParticles from "@/components/dashboard-particles";
import MemberProfileCard from "@/components/member-profile-card";
import OnboardingGuide from "@/components/onboarding-guide";
import SearchMultiSelect from "@/components/search-multi-select";
import { clientFetch, reportClientError } from "@/lib/client-observability";
import { avatarOptions, jobTitleLabel } from "@/lib/ui-options";
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

const dashboardRefreshEventKey = "kanban:dashboard-refresh";
const dashboardThemeStorageKey = "kanban:dashboard-theme";
const dashboardMatrixStorageKey = "kanban:dashboard-matrix-enabled";
const dashboardProgressSegmentCount = 48;
const dashboardMemberProgressSegmentCount = dashboardProgressSegmentCount * 2;
const dashboardMemberTaskProgressSegmentCount = dashboardMemberProgressSegmentCount * 2;
const dashboardProjectTaskProgressSegmentCount = dashboardProgressSegmentCount * 2;
const matrixAlphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz$+-*/=%\"'#&_(),.;:?!\\|{}<>[]^~アカサタナハマヤラワイキシチニヒミリウクスツヌフムユルエケセテネヘメレオコソトノホモヨロヲン";
const matrixMaxPixels = { width: 2200, height: 1400 };

export default function WorkloadDashboard(props: { currentUser: CurrentUser; publicView?: boolean; initialTheme?: DashboardTheme; appVersion?: string }) {
  const { publicView = false, initialTheme = "dark" } = props;
  const [data, setData] = useState<DashboardData>(emptyDashboard);
  const [selectedTeamIds, setSelectedTeamIds] = useState<string[]>([]);
  const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>([]);
  const [theme, setTheme] = useState<DashboardTheme>(initialTheme);
  const [expandedMemberId, setExpandedMemberId] = useState<string | null>(null);
  const [selectedTask, setSelectedTask] = useState<DashboardTask | null>(null);
  const [selectedProject, setSelectedProject] = useState<DashboardProject | null>(null);
  const [selectedMember, setSelectedMember] = useState<DashboardMember | null>(null);
  const [loadingDashboard, setLoadingDashboard] = useState(true);
  const [dashboardLoaded, setDashboardLoaded] = useState(false);
  const [matrixEnabled, setMatrixEnabled] = useState(false);

  const meteors = useMemo(
    () =>
      [
        { left: "-30%", top: "6%", angle: "18deg", delay: "0s", duration: "9.8s", width: "18rem" },
        { left: "-24%", top: "22%", angle: "21deg", delay: "2.6s", duration: "15.4s", width: "19rem" },
        { left: "-28%", top: "38%", angle: "16deg", delay: "5.4s", duration: "20.6s", width: "17rem" },
        { left: "-26%", top: "13%", angle: "24deg", delay: "7.8s", duration: "9.8s", width: "18rem" },
        { left: "-20%", top: "48%", angle: "19deg", delay: "10.4s", duration: "15.4s", width: "20rem" },
        { left: "-32%", top: "30%", angle: "15deg", delay: "13s", duration: "20.6s", width: "17rem" },
      ].map((meteor, index) => ({
        id: index,
        ...meteor,
      })),
    []
  );

  const loadDashboard = useCallback(async (signal?: AbortSignal) => {
    const params = new URLSearchParams();
    for (const teamId of selectedTeamIds) params.append("teamId", teamId);
    for (const projectId of selectedProjectIds) params.append("projectId", projectId);
    const response = await clientFetch(
      `/api/dashboard?${params.toString()}`,
      { signal },
      { operation: "dashboard.load" }
    );
    if (!response.ok) {
      throw new Error(`Dashboard request failed: ${response.status}`);
    }
    return response.json() as Promise<DashboardData>;
  }, [selectedProjectIds, selectedTeamIds]);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setLoadingDashboard(true);
    loadDashboard(controller.signal)
      .then((payload) => {
        if (active) setData(payload);
      })
      .catch((error: unknown) => {
        if (!active || controller.signal.aborted) return;
        reportClientError({
          source: "dashboard-refresh",
          message: error instanceof Error ? error.message : "Dashboard load failed",
          stack: error instanceof Error ? error.stack : undefined,
          operation: "dashboard.load",
        });
      })
      .finally(() => {
        if (active) {
          setLoadingDashboard(false);
          setDashboardLoaded(true);
        }
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [loadDashboard]);

  useEffect(() => {
    const saved = window.localStorage.getItem(dashboardThemeStorageKey);
    if (saved === "light" || saved === "dark") {
      setTheme(saved);
    }
    setMatrixEnabled(window.localStorage.getItem(dashboardMatrixStorageKey) === "true");
  }, []);

  useEffect(() => {
    window.localStorage.setItem(dashboardThemeStorageKey, theme);
    document.cookie = `kanban_dashboard_theme=${theme}; path=/; max-age=31536000; samesite=lax`;
  }, [theme]);

  useEffect(() => {
    window.localStorage.setItem(dashboardMatrixStorageKey, matrixEnabled ? "true" : "false");
  }, [matrixEnabled]);

  useEffect(() => {
    const handleRefresh = () => {
      setLoadingDashboard(true);
      void loadDashboard()
        .then((payload) => {
          setData(payload);
        })
        .catch((error: unknown) => {
          reportClientError({
            source: "dashboard-refresh",
            message: error instanceof Error ? error.message : "Dashboard refresh failed",
            stack: error instanceof Error ? error.stack : undefined,
            operation: "dashboard.refresh",
          });
        })
        .finally(() => {
          setLoadingDashboard(false);
          setDashboardLoaded(true);
        });
    };

    const handleStorage = (event: StorageEvent) => {
      if (event.key === dashboardRefreshEventKey) {
        handleRefresh();
      }
    };

    const handleBroadcast = (event: MessageEvent) => {
      if (typeof event.data === "string") {
        handleRefresh();
      }
    };

    const handleWindow = () => handleRefresh();

    window.addEventListener(dashboardRefreshEventKey, handleWindow as EventListener);
    window.addEventListener("storage", handleStorage);

    const channel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel(dashboardRefreshEventKey) : null;
    channel?.addEventListener("message", handleBroadcast);

    return () => {
      window.removeEventListener(dashboardRefreshEventKey, handleWindow as EventListener);
      window.removeEventListener("storage", handleStorage);
      channel?.removeEventListener("message", handleBroadcast);
      channel?.close();
    };
  }, [loadDashboard]);

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
  const progressSortedMembers = useMemo(
    () => [...data.members].sort((left, right) => right.progress - left.progress || right.taskCount - left.taskCount || left.displayName.localeCompare(right.displayName, "zh-Hans-CN")),
    [data.members]
  );
  const initialDashboardLoading = loadingDashboard && !dashboardLoaded;

  return (
    <main data-dashboard-theme={theme} className="relative min-h-screen overflow-hidden bg-[var(--dash-bg)] text-[var(--dash-text)]">
      {!publicView ? (
        <OnboardingGuide
          username={props.currentUser.username}
          role={props.currentUser.role}
          scope="dashboard"
          actions={{
            goKanban: () => window.location.assign("/"),
          }}
        />
      ) : null}
      <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(103,232,249,0.08),transparent_36%),radial-gradient(circle_at_78%_18%,rgba(167,139,250,0.14),transparent_28%),radial-gradient(circle_at_50%_100%,rgba(59,130,246,0.12),transparent_38%)]" />
        <div className="absolute left-[-6%] top-[-10%] h-[300px] w-[300px] rounded-full bg-[radial-gradient(circle,var(--dash-accent-glow),transparent_68%)] blur-2xl opacity-80" />
        <div className="absolute right-[-8%] top-[18%] h-[320px] w-[320px] rounded-full bg-[radial-gradient(circle,var(--dash-hot-glow),transparent_72%)] blur-2xl opacity-75" />
        <div className="absolute bottom-[-14%] left-[28%] h-[300px] w-[380px] rounded-full bg-[radial-gradient(circle,var(--dash-rim),transparent_72%)] blur-2xl opacity-70" />
        <div className="absolute inset-x-0 top-[6%] h-[1px] bg-[linear-gradient(90deg,transparent,var(--dash-rim),transparent)] opacity-60" />
        <div className="absolute inset-x-0 top-[36%] h-[1px] bg-[linear-gradient(90deg,transparent,var(--dash-line),transparent)] opacity-50" />
        {matrixEnabled ? <DashboardMatrixRain theme={theme} /> : <DashboardParticles theme={theme} className="absolute inset-0 z-[1]" />}
        {/* 流星 */}
        {!matrixEnabled ? meteors.map((meteor) => (
          <span
            key={meteor.id}
            className="absolute z-[3] h-3"
            style={{ left: meteor.left, top: meteor.top, width: meteor.width, transform: `rotate(${meteor.angle})`, transformOrigin: "left center" }}
          >
            <span
              className="absolute left-0 top-0 h-full w-full dashboard-meteor"
              style={{ animationDelay: meteor.delay, animationDuration: meteor.duration }}
            >
              <span className="absolute left-0 top-1/2 h-px w-full -translate-y-1/2 rounded-full dashboard-meteor-tail" />
              <span className="absolute right-0 top-1/2 h-[4px] w-[10px] -translate-y-1/2 rounded-full dashboard-meteor-head" />
            </span>
          </span>
        )) : null}
        <div className="absolute inset-0 opacity-40 [background-image:linear-gradient(rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.04)_1px,transparent_1px)] [background-size:32px_32px]" />
        <div className="absolute inset-0 opacity-[0.14] [background-image:radial-gradient(circle_at_center,rgba(255,255,255,0.22)_0,transparent_54%)]" />
      </div>

      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-[2160px] flex-col gap-5 px-5 py-5 2xl:px-8">
        <header className="relative z-30 flex flex-wrap items-center gap-4 rounded-[28px] border border-[var(--dash-line)] bg-[var(--dash-panel-strong)] px-5 py-5 shadow-[0_18px_48px_var(--dash-shadow-soft)]">
          <div className="pointer-events-none absolute inset-x-10 top-0 h-px bg-[linear-gradient(90deg,transparent,var(--dash-rim),transparent)] opacity-70" />
          <div className="pointer-events-none absolute right-[-8%] top-[-28%] h-32 w-32 rounded-full bg-[radial-gradient(circle,var(--dash-accent-glow),transparent_70%)] blur-xl opacity-70" />
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-2xl border border-[var(--dash-line)] bg-[var(--dash-panel)] shadow-[0_0_0_1px_rgba(255,255,255,0.04)]">
              <ChartNoAxesCombined size={20} />
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-semibold 2xl:text-4xl">项目负载大屏</h1>
                <div className="mt-1 inline-flex items-center gap-2 rounded-full border border-[var(--dash-line)] bg-[var(--dash-card)] px-2.5 py-1 text-[11px] font-medium text-[var(--dash-muted)]">
                  <span className="h-1.5 w-1.5 rounded-full bg-[var(--dash-accent)] shadow-[0_0_12px_var(--dash-accent-glow)] dashboard-pulse" />
                  实时观察
                </div>
                <LoadingStateBadge active={loadingDashboard} />
              </div>
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
                panelClassName="dashboard-filter-panel"
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
                panelClassName="dashboard-filter-panel"
              />
            </div>
            <button
              type="button"
              onClick={() => setTheme((current) => (current === "dark" ? "light" : "dark"))}
              className="grid h-11 w-11 place-items-center rounded-2xl border border-[var(--dash-line)] bg-[var(--dash-panel)] transition hover:bg-[var(--dash-hover)] hover:shadow-[0_0_0_1px_var(--dash-rim)]"
            >
              {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <button
              type="button"
              onClick={() => setMatrixEnabled((current) => !current)}
              title={matrixEnabled ? "关闭矩阵动效" : "开启矩阵动效"}
              aria-pressed={matrixEnabled}
              className={`inline-flex h-11 items-center gap-2 rounded-2xl border px-3 text-sm font-semibold transition ${
                matrixEnabled
                  ? "border-[var(--dash-matrix-strong)] bg-[var(--dash-matrix-soft)] text-[var(--dash-matrix-text)] shadow-[0_0_0_1px_var(--dash-matrix-strong),0_12px_32px_var(--dash-matrix-glow)]"
                  : "border-[var(--dash-line)] bg-[var(--dash-panel)] text-[var(--dash-text)] hover:bg-[var(--dash-hover)] hover:shadow-[0_0_0_1px_var(--dash-rim)]"
              }`}
            >
              <Binary size={17} />
              <span>Matrix</span>
            </button>
            {!publicView ? (
              <button
                type="button"
                data-tour="dashboard-enter-kanban"
                onClick={() => window.location.assign("/")}
                className="inline-flex h-11 items-center rounded-2xl bg-[linear-gradient(135deg,var(--dash-accent),var(--dash-hot))] px-4 text-sm font-semibold text-[var(--dash-accent-text)] shadow-[0_18px_38px_var(--dash-shadow)] transition hover:opacity-95"
              >
                进入看板
              </button>
            ) : null}
          </div>
        </header>

        <section className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-9">
          {initialDashboardLoading ? (
            Array.from({ length: 9 }, (_, index) => <MetricSkeleton key={index} />)
          ) : (
            <>
              <Metric label="团队" value={data.totals.teams} />
              <Metric label="项目" value={data.totals.projects} />
              <Metric label="人员" value={data.totals.members} />
              <Metric label="任务" value={data.totals.tasks} />
              <Metric label="人日" value={data.totals.workloadDays} />
              <Metric label="平均进度" value={`${data.totals.progress}%`} />
              <Metric label="临期" value={data.totals.dueSoon} accent="info" />
              <Metric label="超期" value={data.totals.overdue} accent="danger" />
              <Metric label="阻塞" value={data.totals.blocked} accent="warning" />
            </>
          )}
        </section>

        <section className="grid min-h-0 flex-1 gap-5 xl:grid-cols-[minmax(0,1fr)_400px] 2xl:grid-cols-[minmax(0,1fr)_460px]">
          <div className="relative overflow-hidden rounded-3xl border border-[var(--dash-line)] bg-[var(--dash-panel)] p-4 shadow-[0_18px_48px_var(--dash-shadow-soft)]">
            <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-[linear-gradient(90deg,transparent,var(--dash-rim),transparent)] opacity-60" />
            <div className="pointer-events-none absolute right-[-14%] top-[-16%] h-40 w-40 rounded-full bg-[radial-gradient(circle,var(--dash-hot-glow),transparent_70%)] blur-2xl opacity-40" />
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="flex items-center gap-2 text-base font-semibold">
                <span className="grid h-6 w-6 place-items-center rounded-lg bg-[var(--dash-accent-soft)] text-[var(--dash-accent)]">
                  <UsersRound size={15} />
                </span>
                人员状态
              </h2>
              <div className="rounded-full border border-[var(--dash-line)] bg-[var(--dash-card)] px-2.5 py-0.5 text-[11px] text-[var(--dash-muted)]">
                提测临期阈值 {data.dueSoonDays} 天
              </div>
            </div>
            <div className="space-y-2.5">
              {initialDashboardLoading ? (
                <DashboardMemberSkeletonList />
              ) : progressSortedMembers.map((member) => {
                const expanded = expandedMemberId === member.id;
                const width = Math.min(100, Math.max(0, member.progress));
                const previewTechStacks = member.techStacks.slice(0, 2);
                const hiddenTechStackCount = member.techStacks.length - previewTechStacks.length;
                return (
                  <article
                    key={member.id}
                    className="relative overflow-hidden rounded-2xl border border-[var(--dash-line)] bg-[linear-gradient(180deg,var(--dash-card),var(--dash-card-bottom))] p-3 shadow-[0_14px_30px_var(--dash-shadow)] transition duration-300 hover:-translate-y-0.5 hover:border-[var(--dash-rim)] hover:shadow-[0_18px_38px_var(--dash-shadow-soft)]"
                  >
                    <div className="pointer-events-none absolute inset-x-6 top-0 h-px bg-[linear-gradient(90deg,transparent,var(--dash-rim),transparent)] opacity-50" />
                    <div className="pointer-events-none absolute right-[-10%] top-[-14%] h-20 w-20 rounded-full bg-[radial-gradient(circle,var(--dash-accent-glow),transparent_68%)] blur-xl opacity-40" />
                    <div className="flex items-stretch gap-3">
                      <button type="button" onClick={() => setSelectedMember(member)} className="shrink-0 cursor-pointer">
                        <DashboardAvatar member={member} size="member" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setExpandedMemberId((current) => (current === member.id ? null : member.id))}
                        className="flex min-w-0 flex-1 items-stretch gap-2.5 text-left"
                      >
                        <span className="grid min-w-0 flex-1 content-between">
                          <span className="flex min-w-0 items-start justify-between gap-2.5">
                            <span className="truncate text-sm font-semibold leading-5 text-[var(--dash-name)]">{member.displayName || member.username}</span>
                            <span className="shrink-0 text-right text-xs leading-5 text-[var(--dash-muted)]">
                              {member.taskCount} 项 · {member.workloadDays} 人日 · {member.progress}%
                            </span>
                          </span>
                          <span className="flex">
                            <span className="inline-flex rounded-full border border-[var(--dash-rim)] bg-[var(--dash-accent-soft)] px-1.5 py-0.5 text-[11px] font-semibold leading-4 text-[var(--dash-accent)]">
                              {jobTitleLabel(member.jobTitle)}
                            </span>
                          </span>
                          <span className="flex min-w-0 items-center justify-between gap-2">
                            <span className="flex min-w-0 flex-wrap items-center gap-1.5 text-[11px] leading-4">
                              {previewTechStacks.map((item) => (
                                <span key={item} className="rounded-full border border-[var(--dash-hot)] bg-[var(--dash-hot-glow)] px-1.5 py-0.5 font-semibold text-[var(--dash-hot)]">{item}</span>
                              ))}
                              {hiddenTechStackCount > 0 ? (
                                <span className="rounded-full border border-[var(--dash-line)] bg-[var(--dash-track)] px-1.5 py-0.5 font-semibold text-[var(--dash-muted)]">
                                  +{hiddenTechStackCount}
                                </span>
                              ) : null}
                              {member.techStacks.length === 0 ? (
                                <span className="rounded-full bg-[var(--dash-track)] px-1.5 py-0.5 text-[var(--dash-muted)]">未设置技术栈</span>
                              ) : null}
                            </span>
                            {member.dueSoonCount > 0 || member.overdueCount > 0 || member.blockedCount > 0 ? (
                              <span className="ml-auto flex shrink-0 flex-wrap justify-end gap-1">
                                {member.dueSoonCount > 0 ? <WarningChip active tone="info">临期 {member.dueSoonCount}</WarningChip> : null}
                                {member.overdueCount > 0 ? <WarningChip active tone="danger">超期 {member.overdueCount}</WarningChip> : null}
                                {member.blockedCount > 0 ? <WarningChip active tone="warning">阻塞 {member.blockedCount}</WarningChip> : null}
                              </span>
                            ) : null}
                          </span>
                        </span>
                        {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                      </button>
                    </div>
                    <DashboardProgressBar value={width} size="sm" segments={dashboardMemberProgressSegmentCount} className="mt-2.5" />
                    {expanded ? (
                      <div className="mt-3 grid gap-1.5 border-t border-[var(--dash-line)] pt-3">
                        {member.tasks.length > 0 ? (
                          member.tasks.map((task) => (
                            <DashboardCompactTaskRow
                              key={task.id}
                              task={task}
                              onSelect={setSelectedTask}
                              progressSegments={dashboardMemberTaskProgressSegmentCount}
                              progressTone="member-task"
                              density="compact"
                            />
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
              {!initialDashboardLoading && data.members.length === 0 ? (
                <div className="grid min-h-[280px] place-items-center rounded-2xl border border-dashed border-[var(--dash-line)] text-sm text-[var(--dash-muted)]">
                  暂无成员
                </div>
              ) : null}
            </div>
          </div>

          <aside className="space-y-4">
            <SidePanel title="分布" icon={<ChartPie size={17} />}>
              {initialDashboardLoading ? (
                <DashboardSideSkeleton variant="stats" />
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <MiniStat label="空闲" value={idleCount} />
                  <MiniStat label="最高负载" value={busiest ? busiest.taskCount : 0} />
                  <MiniStat label="临期" value={data.totals.dueSoon} tone="info" />
                  <MiniStat label="超期" value={data.totals.overdue} tone="danger" />
                </div>
              )}
            </SidePanel>
            <SidePanel title="负载排行" icon={<Trophy size={17} />}>
              <div className="space-y-3">
                {initialDashboardLoading ? (
                  <DashboardSideSkeleton variant="rank" />
                ) : rankedMembers.length > 0 ? (
                  rankedMembers.map((member, index) => (
                    <button
                      key={member.id}
                      type="button"
                      onClick={() => setSelectedMember(member)}
                      className="w-full rounded-2xl bg-[var(--dash-card)] px-3 py-3 text-left shadow-[0_12px_28px_var(--dash-shadow)] transition hover:border-[var(--dash-rim)] hover:shadow-[0_20px_38px_var(--dash-shadow-soft)]"
                    >
	                      <div className="flex items-stretch gap-3">
	                        <span className="grid min-h-11 w-11 shrink-0 place-items-center rounded-2xl border border-[var(--dash-rim)] bg-[var(--dash-accent-soft)] text-xl font-semibold tabular-nums text-[var(--dash-accent)] shadow-[0_8px_20px_var(--dash-shadow)]">
	                          {index + 1}
	                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex min-w-0 items-start gap-3">
                            <DashboardAvatar member={member} />
                            <span className="grid h-11 min-w-0 flex-1 content-between">
                              <span className="flex min-w-0 items-start justify-between gap-3">
                                <span className="truncate text-xs font-semibold text-[var(--dash-name)]">{member.displayName || member.username}</span>
                                <span className="shrink-0 text-right text-xs text-[var(--dash-muted)]">
                                  {member.taskCount} 项 · {member.workloadDays} 人日 · {member.progress}%
                                </span>
                              </span>
                              <span className="flex">
                                <span className="inline-flex rounded-full border border-[var(--dash-rim)] bg-[var(--dash-accent-soft)] px-2 py-0.5 text-[11px] font-semibold text-[var(--dash-accent)]">
                                  {jobTitleLabel(member.jobTitle)}
                                </span>
                              </span>
                            </span>
                          </span>
                          <span className="mt-2 block">
                            <DashboardProgressBar value={member.progress} size="sm" />
                          </span>
                        </span>
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
                {initialDashboardLoading ? (
                  <DashboardSideSkeleton variant="project" />
                ) : data.projects.slice(0, 10).map((project) => (
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
                {!initialDashboardLoading && data.projects.length === 0 ? <div className="py-8 text-center text-sm text-[var(--dash-muted)]">暂无项目</div> : null}
              </div>
            </SidePanel>
          </aside>
        </section>
      </div>
      <footer className="relative z-20 border-t border-[var(--dash-line)] bg-[var(--dash-bg)]/85 text-sm text-[var(--dash-muted)]">
        <div className="mx-auto flex w-full max-w-[2160px] flex-col items-center gap-3 px-5 py-5 sm:flex-row sm:justify-between 2xl:px-8">
          <div className="flex items-center gap-2">
            <Copyright size={14} />
            <span>2026 <strong>Kanban</strong></span>
            {props.appVersion ? (
              <span className="rounded bg-[var(--dash-track)] px-1.5 py-0.5 text-xs text-[var(--dash-muted)]">
                v{props.appVersion}
              </span>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <Edit3 size={13} />
            <span className="h-3 w-px bg-[var(--dash-line)]" />
            <span className="font-medium text-[var(--dash-text)]">kfzx-chenwh4</span>
            <span className="rounded bg-[var(--dash-accent-soft)] px-1.5 py-0.5 text-xs font-medium text-[var(--dash-accent)]">000959918</span>
          </div>
        </div>
      </footer>
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
      {selectedMember ? (
        <MemberProfileCard
          member={{
            username: selectedMember.username,
            displayName: selectedMember.displayName,
            avatarKey: selectedMember.avatarKey,
            role: selectedMember.role as "super_admin" | "project_manager" | "development_manager" | "team_member",
            jobTitle: selectedMember.jobTitle,
            techStacks: selectedMember.techStacks,
            phone: selectedMember.phone,
          }}
          onClose={() => setSelectedMember(null)}
          theme="dashboard-dark"
        />
      ) : null}
    </main>
  );
}

function DashboardMatrixRain({ theme }: { theme: DashboardTheme }) {
  const isLight = theme === "light";
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [resolution, setResolution] = useState(() => computeMatrixResolution(1280, 720));
  const uniformGradient = useMemo(
    () => (isLight ? ["#115e59", "#0f766e", "#14b8a6"] : ["#14532d", "#22c55e", "#bbf7d0"]),
    [isLight]
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateResolution = (width: number, height: number) => {
      const nextResolution = computeMatrixResolution(width, height);
      setResolution((current) => (
        current.width === nextResolution.width && current.height === nextResolution.height
          ? current
          : nextResolution
      ));
    };

    const initialRect = container.getBoundingClientRect();
    updateResolution(initialRect.width, initialRect.height);

    if (typeof ResizeObserver === "undefined") {
      const handleResize = () => {
        const rect = container.getBoundingClientRect();
        updateResolution(rect.width, rect.height);
      };
      window.addEventListener("resize", handleResize);
      return () => window.removeEventListener("resize", handleResize);
    }

    const observer = new ResizeObserver((entries) => {
      const size = entries[0]?.contentRect;
      if (size) {
        updateResolution(size.width, size.height);
      }
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={containerRef} className="dashboard-matrix-rain pointer-events-none absolute inset-0 z-[2] overflow-hidden" aria-hidden="true">
      <MatrixRain
        alphabet={matrixAlphabet}
        backgroundColor={isLight ? "rgba(238,244,251,0.42)" : "rgba(7,11,20,0.46)"}
        color={isLight ? "rgba(15,118,110,0.9)" : "rgba(74,222,128,0.92)"}
        delay={isLight ? 42 : 36}
        density={isLight ? 0.048 : 0.058}
        dryRate={0.52}
        fadeRate={isLight ? 0.16 : 0.12}
        font="16px monospace"
        resolutionX={resolution.width}
        resolutionY={resolution.height}
        spaceX={0.9}
        spaceY={0.98}
        uniformGradient={uniformGradient}
        gradientOrientation="vertical"
        zIndex={0}
      />
    </div>
  );
}

function computeMatrixResolution(width: number, height: number) {
  const safeWidth = Math.max(1, width);
  const safeHeight = Math.max(1, height);
  const deviceScale = typeof window === "undefined" ? 1 : Math.min(window.devicePixelRatio || 1, 1.35);
  const capScale = Math.min(
    deviceScale,
    matrixMaxPixels.width / safeWidth,
    matrixMaxPixels.height / safeHeight
  );
  const scale = Math.max(0.1, capScale);
  return {
    width: Math.max(1, Math.round(safeWidth * scale)),
    height: Math.max(1, Math.round(safeHeight * scale)),
  };
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
      className={`relative overflow-hidden rounded-2xl border bg-[linear-gradient(180deg,var(--dash-panel-strong),var(--dash-panel))] px-3 py-3 shadow-[0_10px_22px_var(--dash-shadow)] transition duration-300 hover:-translate-y-0.5 ${metricToneClass(accent)}`}
    >
      <span className="pointer-events-none absolute inset-x-5 top-0 h-px bg-[linear-gradient(90deg,transparent,var(--dash-rim),transparent)] opacity-60" />
      <span className="pointer-events-none absolute right-[-16%] top-[-18%] h-16 w-16 rounded-full bg-[radial-gradient(circle,var(--dash-accent-glow),transparent_72%)] blur-xl opacity-35" />
      <p className="text-xs text-[var(--dash-muted)]">{label}</p>
      <p className="mt-1 text-xl font-semibold 2xl:text-2xl">{value}</p>
    </div>
  );
}

function DashboardProgressBar({
  value,
  size = "md",
  segments = dashboardProgressSegmentCount,
  tone = "default",
  className = "",
}: {
  value: number;
  size?: "xs" | "sm" | "md";
  segments?: number;
  tone?: "default" | "member-task";
  className?: string;
}) {
  const normalized = Math.min(100, Math.max(0, value));
  const segmentCount = Math.max(1, Math.round(segments));
  const filledSegments = normalized > 0
    ? Math.max(1, Math.round((normalized / 100) * segmentCount))
    : 0;
  const sizeClass = size === "xs" ? "h-1.5 gap-px" : size === "sm" ? "h-2 gap-px" : "h-3 gap-[2px]";

  return (
    <div
      className={`dashboard-progress-track is-${tone} flex w-full ${sizeClass} ${className}`}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(normalized)}
    >
      {Array.from({ length: segmentCount }, (_, index) => (
        <span
          key={index}
          className={`dashboard-progress-segment ${index < filledSegments ? "is-filled" : ""}`}
        />
      ))}
    </div>
  );
}

function MetricSkeleton() {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-[var(--dash-line)] bg-[linear-gradient(180deg,var(--dash-panel-strong),var(--dash-panel))] px-3 py-3 shadow-[0_10px_22px_var(--dash-shadow)]">
      <span className="pointer-events-none absolute inset-x-5 top-0 h-px bg-[linear-gradient(90deg,transparent,var(--dash-rim),transparent)] opacity-60" />
      <LoadingSkeleton className="h-3 w-14 rounded-full" />
      <LoadingSkeleton className="mt-3 h-7 w-20 rounded-lg" />
    </div>
  );
}

function DashboardMemberSkeletonList() {
  return (
    <>
      {Array.from({ length: 5 }, (_, index) => (
        <article
          key={index}
          className="relative overflow-hidden rounded-2xl border border-[var(--dash-line)] bg-[linear-gradient(180deg,var(--dash-card),var(--dash-card-bottom))] p-4 shadow-[0_18px_38px_var(--dash-shadow)]"
        >
          <div className="flex items-stretch gap-4">
            <LoadingSkeleton className="h-[72px] w-[72px] shrink-0 rounded-2xl" />
            <div className="grid min-w-0 flex-1 content-between py-0.5">
              <div className="flex items-start justify-between gap-3">
                <LoadingSkeleton className="h-5 w-36 rounded-lg" />
                <LoadingSkeleton className="h-4 w-28 rounded-lg" />
              </div>
              <LoadingSkeleton className="h-5 w-20 rounded-full" />
              <div className="flex items-center gap-2">
                <LoadingSkeleton className="h-5 w-16 rounded-full" />
                <LoadingSkeleton className="h-5 w-16 rounded-full" />
                <LoadingSkeleton className="h-5 w-24 rounded-full" />
              </div>
            </div>
          </div>
          <LoadingSkeleton className="mt-3 h-3 w-full rounded-full" />
        </article>
      ))}
    </>
  );
}

function DashboardSideSkeleton({ variant }: { variant: "stats" | "rank" | "project" }) {
  if (variant === "stats") {
    return (
      <div className="grid grid-cols-2 gap-3">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="rounded-2xl bg-[var(--dash-card)] px-4 py-3 shadow-[0_14px_30px_var(--dash-shadow)]">
            <LoadingSkeleton className="h-3 w-12 rounded-full" />
            <LoadingSkeleton className="mt-3 h-7 w-14 rounded-lg" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <>
      {Array.from({ length: variant === "rank" ? 5 : 6 }, (_, index) => (
        <div key={index} className="rounded-2xl bg-[var(--dash-card)] px-3 py-3 shadow-[0_12px_28px_var(--dash-shadow)]">
          <div className="flex items-center gap-3">
            <LoadingSkeleton className="h-8 w-8 shrink-0 rounded-xl" />
            <div className="min-w-0 flex-1">
              <LoadingSkeleton className="h-4 w-3/5 rounded-lg" />
              <LoadingSkeleton className="mt-2 h-3 w-4/5 rounded-lg" />
              {variant === "rank" ? <LoadingSkeleton className="mt-3 h-2 w-full rounded-full" /> : null}
            </div>
          </div>
        </div>
      ))}
    </>
  );
}

function SidePanel({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  return (
    <section className="relative overflow-hidden rounded-3xl border border-[var(--dash-line)] bg-[linear-gradient(180deg,var(--dash-panel),var(--dash-card-bottom))] p-4 shadow-[0_14px_34px_var(--dash-shadow)]">
      <span className="pointer-events-none absolute inset-x-8 top-0 h-px bg-[linear-gradient(90deg,transparent,var(--dash-rim),transparent)] opacity-60" />
      <span className="pointer-events-none absolute left-[-14%] top-[-8%] h-20 w-20 rounded-full bg-[radial-gradient(circle,var(--dash-accent-glow),transparent_70%)] blur-xl opacity-30" />
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
          ? "h-[72px] w-[72px] rounded-2xl"
          : size === "xl"
            ? "h-[88px] w-[88px] rounded-2xl"
            : "h-11 w-11 rounded-2xl";
  const imageSize = size === "sm" ? 32 : size === "lg" ? 66 : size === "member" ? 72 : size === "xl" ? 88 : 44;
  if (avatar) {
    return (
      <Image
        src={avatar.src}
        alt={member.displayName || member.username}
        width={imageSize}
        height={imageSize}
        preload={size === "member"}
        loading={size === "member" ? "eager" : "lazy"}
        fetchPriority={size === "member" ? "high" : undefined}
        className={`${sizeClass} shrink-0 border border-[var(--dash-line)] object-cover shadow-[0_8px_20px_var(--dash-shadow)]`}
      />
    );
  }
  return (
    <span className={`grid shrink-0 place-items-center bg-[var(--dash-accent-soft)] font-semibold text-[var(--dash-accent)] ${size === "sm" ? "h-8 w-8 rounded-xl text-xs" : size === "lg" ? "h-[66px] w-[66px] rounded-2xl text-lg" : size === "member" ? "h-[72px] w-[72px] rounded-2xl text-lg" : size === "xl" ? "h-[88px] w-[88px] rounded-2xl text-lg" : "h-11 w-11 rounded-2xl text-sm"}`}>
      {(member.displayName || member.username).slice(0, 1).toUpperCase()}
    </span>
  );
}

function DashboardMemberIdentity({
  member,
  displayName,
  meta,
  size = "md",
}: {
  member: DashboardMember | null;
  displayName: string;
  meta: string;
  size?: "sm" | "md";
}) {
  const avatarSize = size === "sm" ? "sm" : "md";
  const gapClass = size === "sm" ? "gap-2" : "gap-3";
  const heightClass = size === "sm" ? "h-8" : "h-11";
  const placeholderClass = size === "sm"
    ? "h-8 w-8 rounded-xl text-xs"
    : "h-11 w-11 rounded-2xl text-sm";
  const nameClass = size === "sm" ? "text-xs" : "text-sm";
  const metaClass = size === "sm" ? "text-[10px]" : "text-[11px]";

  return (
    <span className={`flex min-w-0 items-center ${gapClass}`}>
      {member ? (
        <DashboardAvatar member={member} size={avatarSize} />
      ) : (
        <span className={`grid shrink-0 place-items-center bg-[var(--dash-track)] text-[var(--dash-muted)] ${placeholderClass}`}>-</span>
      )}
      <span className={`grid min-w-0 content-center ${heightClass}`}>
        <span className={`block truncate font-semibold text-[var(--dash-text)] ${nameClass}`}>{displayName}</span>
        <span className={`block truncate text-[var(--dash-muted)] ${metaClass}`}>{meta}</span>
      </span>
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
        className="mt-2 flex w-full items-center gap-3 rounded-xl text-left transition enabled:hover:bg-[var(--dash-hover)]"
      >
        <DashboardMemberIdentity
          member={member}
          displayName={displayName}
          meta={member ? `@${member.username}` : "未匹配成员"}
        />
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
  showTags = true,
  progressSegments = dashboardProgressSegmentCount,
  progressTone = "default",
  density = "normal",
}: {
  task: DashboardTask;
  onSelect: (task: DashboardTask) => void;
  showTags?: boolean;
  progressSegments?: number;
  progressTone?: "default" | "member-task";
  density?: "normal" | "compact";
}) {
  function handleKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelect(task);
    }
  }

  return (
    <div
      role="button"
      tabIndex={0}
      title={[task.title, task.projectName, task.description].filter(Boolean).join(" · ")}
      onClick={() => onSelect(task)}
      onKeyDown={handleKeyDown}
      className={`group flex w-full cursor-pointer flex-col overflow-hidden rounded-2xl border bg-[linear-gradient(180deg,var(--dash-panel),var(--dash-card-bottom))] transition ${density === "compact" ? "px-2.5 py-2 text-xs" : "px-3 py-2.5 text-sm"} ${taskWarningFrameClass(task)}`}
    >
      <span className={`flex w-full min-w-0 items-start text-left ${density === "compact" ? "gap-2" : "gap-3"}`}>
        <span className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
          <span className="shrink-0 truncate font-medium text-[var(--dash-text)]">{task.title}</span>
          <span className={`shrink-0 rounded-full border border-[var(--dash-line)] bg-[var(--dash-card)] px-2 py-0.5 font-semibold text-[var(--dash-muted)] ${density === "compact" ? "text-xs" : "text-[11px]"}`}>
            {task.projectName}
          </span>
          {task.description ? (
            <span className={`min-w-0 max-w-[34%] truncate text-[var(--dash-muted)] ${density === "compact" ? "text-xs" : "text-[11px]"}`}>
              {task.description}
            </span>
          ) : null}
          {showTags ? (
            <span className={`flex min-w-0 flex-wrap items-center text-[var(--dash-muted)] ${density === "compact" ? "gap-1.5 text-xs" : "gap-2 text-[11px]"}`}>
              {task.tags.slice(0, 2).map((tag) => (
                <span
                  key={tag}
                  className="inline-flex shrink-0 items-center gap-1 rounded-full border border-[var(--dash-line)] bg-[var(--dash-track)] px-1.5 py-0.5 font-semibold text-[var(--dash-text)]"
                >
                  <Tag size={10} />
                  {tag}
                </span>
              ))}
              {task.tags.length > 2 ? (
                <span className="shrink-0 rounded-full bg-[var(--dash-track)] px-1.5 py-0.5 font-semibold text-[var(--dash-muted)]">
                  +{task.tags.length - 2}
                </span>
              ) : null}
            </span>
          ) : null}
        </span>
        <span className={`ml-auto flex shrink-0 flex-wrap justify-end whitespace-nowrap ${density === "compact" ? "gap-1" : "gap-1.5"}`}>
          {task.dueSoon ? <WarningDot tone="info" label="临期" /> : null}
          {task.overdue ? <WarningDot tone="danger" label="超期" /> : null}
          {task.blocked ? <WarningDot tone="warning" label="阻塞" /> : null}
        </span>
      </span>
      <div className={`grid min-w-0 grid-cols-[minmax(0,1fr)_42px] items-center gap-2 ${density === "compact" ? "mt-1.5" : "mt-2"}`}>
        <DashboardProgressBar value={task.progress} size="xs" segments={progressSegments} tone={progressTone} />
        <span className={`text-right font-semibold text-[var(--dash-muted)] ${density === "compact" ? "text-xs" : "text-[11px]"}`}>{task.progress}%</span>
      </div>
    </div>
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
    <DialogShell title={project.name} onClose={onClose} eyebrow="项目概览" maxWidth="max-w-[760px]" scrollBody={false}>
      <div className="mt-4 flex min-h-0 flex-1 flex-col">
        <div className="space-y-5">
          <p className="text-sm leading-6 text-[var(--dash-muted)]">{project.description || "暂无项目说明"}</p>
          {project.dueSoonCount > 0 || project.overdueCount > 0 || project.blockedCount > 0 ? (
            <div className="flex flex-wrap gap-2">
              {project.dueSoonCount > 0 ? <WarningChip active tone="info">临期 {project.dueSoonCount}</WarningChip> : null}
              {project.overdueCount > 0 ? <WarningChip active tone="danger">超期 {project.overdueCount}</WarningChip> : null}
              {project.blockedCount > 0 ? <WarningChip active tone="warning">阻塞 {project.blockedCount}</WarningChip> : null}
            </div>
          ) : null}
          <div className="grid gap-3 sm:grid-cols-2">
            <DashInfo label="团队" value={project.teamName || "-"} />
            <DashInfo label="任务总数" value={`${project.taskCount}`} />
          </div>
          <div className="grid gap-3 sm:grid-cols-5">
            <DashInfo label="需求池" value={`${project.statusCounts.backlog}`} />
            <DashInfo label="设计中" value={`${project.statusCounts.design}`} />
            <DashInfo label="开发中" value={`${project.statusCounts.dev}`} />
            <DashInfo label="测试中" value={`${project.statusCounts.test}`} />
            <DashInfo label="已完成" value={`${project.statusCounts.done}`} />
          </div>
        </div>
        <div className="mt-5 min-h-0 rounded-2xl border border-[var(--dash-line)] bg-[var(--dash-card)]/60 p-2">
          <div className="max-h-[min(46vh,520px)] overflow-y-auto pr-1">
            <div className="space-y-2">
              {project.tasks.length > 0 ? (
                project.tasks.map((task) => (
                  <DashboardCompactTaskRow
                    key={task.id}
                    task={task}
                    onSelect={onSelectTask}
                    showTags={false}
                    progressSegments={dashboardProjectTaskProgressSegmentCount}
                  />
                ))
              ) : (
                <div className="rounded-xl border border-dashed border-[var(--dash-line)] px-3 py-5 text-center text-sm text-[var(--dash-muted)]">
                  暂无任务
                </div>
              )}
            </div>
          </div>
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
  scrollBody = true,
}: {
  title?: string;
  eyebrow?: string;
  children: ReactNode;
  onClose: () => void;
  maxWidth?: string;
  scrollBody?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/35 px-4 py-4" onClick={onClose}>
      <div
        className={`relative flex max-h-[calc(100vh-2rem)] w-full flex-col overflow-hidden ${maxWidth} rounded-[28px] border border-[var(--dash-line)] bg-[linear-gradient(180deg,var(--dash-panel-strong),var(--dash-panel))] p-6 shadow-[0_28px_90px_var(--dash-shadow-soft)] backdrop-blur-xl`}
        onClick={(event) => event.stopPropagation()}
      >
        <span className="pointer-events-none absolute inset-x-10 top-0 h-px bg-[linear-gradient(90deg,transparent,var(--dash-rim),transparent)] opacity-70" />
        <span className="pointer-events-none absolute right-[-12%] top-[-14%] h-28 w-28 rounded-full bg-[radial-gradient(circle,var(--dash-hot-glow),transparent_70%)] blur-3xl opacity-50" />
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
        <div className={scrollBody ? "mt-4 min-h-0 flex-1 overflow-y-auto pr-1" : "mt-4 min-h-0 flex-1"}>{children}</div>
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
      <DashboardProgressBar value={width} size="sm" className="mt-3" />
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
    --dash-popover: #0f172a;
    --dash-card: rgba(30, 41, 59, 0.62);
    --dash-card-bottom: rgba(17, 24, 39, 0.78);
    --dash-text: #e5f3ff;
    --dash-name: #ffffff;
    --dash-muted: #8aa2bd;
    --dash-line: rgba(148, 163, 184, 0.22);
    --dash-hover: rgba(51, 65, 85, 0.8);
    --dash-track: rgba(148, 163, 184, 0.18);
    --dash-progress-segment: rgba(148, 163, 184, 0.2);
    --dash-progress-segment-border: rgba(255, 255, 255, 0.08);
    --dash-progress-fill: #67e8f9;
    --dash-progress-fill-border: rgba(255, 255, 255, 0.18);
    --dash-progress-fill-member-task: #a5f3fc;
    --dash-progress-fill-member-task-border: rgba(224, 242, 254, 0.22);
    --scrollbar-track: rgba(15, 23, 42, 0.74);
    --scrollbar-thumb: rgba(138, 162, 189, 0.48);
    --scrollbar-thumb-hover: rgba(103, 232, 249, 0.7);
    --loading-skeleton-bg: rgba(148, 163, 184, 0.18);
    --loading-skeleton-sheen: rgba(255, 255, 255, 0.14);
    --loading-overlay-bg: rgba(7, 11, 20, 0.72);
    --dash-accent: #67e8f9;
    --dash-accent-soft: rgba(103, 232, 249, 0.12);
    --dash-accent-glow: rgba(103, 232, 249, 0.28);
	    --dash-accent-text: #04111d;
	    --dash-hot: #a78bfa;
	    --dash-hot-glow: rgba(167, 139, 250, 0.22);
	    --dash-rim: rgba(103, 232, 249, 0.32);
	    --dash-particles-opacity: 0.94;
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
    --dash-meteor-tail-a: rgba(255, 255, 255, 0.22);
    --dash-meteor-tail-b: rgba(191, 219, 254, 0.88);
    --dash-meteor-tail-c: rgba(255, 255, 255, 0.98);
    --dash-meteor-head: rgba(255, 255, 255, 0.96);
    --dash-meteor-shadow-soft: rgba(191, 219, 254, 0.18);
    --dash-meteor-shadow-strong: rgba(255, 255, 255, 0.24);
    --dash-matrix-text: rgba(74, 222, 128, 0.88);
    --dash-matrix-soft: rgba(22, 163, 74, 0.14);
    --dash-matrix-strong: rgba(74, 222, 128, 0.46);
    --dash-matrix-glow: rgba(34, 197, 94, 0.18);
  }
  [data-dashboard-theme="light"] {
    --dash-bg: #eef4fb;
    --dash-panel-strong: rgba(255, 255, 255, 0.92);
    --dash-panel: rgba(255, 255, 255, 0.88);
    --dash-popover: #ffffff;
    --dash-card: rgba(247, 250, 255, 0.96);
    --dash-card-bottom: rgba(237, 243, 253, 0.98);
    --dash-text: #0f172a;
    --dash-name: #0f172a;
    --dash-muted: #5b6b84;
    --dash-line: rgba(15, 23, 42, 0.14);
    --dash-hover: #f3f7fd;
    --dash-track: rgba(15, 23, 42, 0.1);
    --dash-progress-segment: rgba(15, 23, 42, 0.12);
    --dash-progress-segment-border: rgba(15, 23, 42, 0.08);
    --dash-progress-fill: #0f766e;
    --dash-progress-fill-border: rgba(15, 23, 42, 0.1);
    --dash-progress-fill-member-task: #0d9488;
    --dash-progress-fill-member-task-border: rgba(15, 118, 110, 0.16);
    --scrollbar-track: rgba(226, 232, 240, 0.76);
    --scrollbar-thumb: rgba(91, 107, 132, 0.46);
    --scrollbar-thumb-hover: rgba(15, 118, 110, 0.68);
    --loading-skeleton-bg: rgba(15, 23, 42, 0.1);
    --loading-skeleton-sheen: rgba(255, 255, 255, 0.78);
    --loading-overlay-bg: rgba(238, 244, 251, 0.76);
    --dash-accent: #0f766e;
    --dash-accent-soft: rgba(15, 118, 110, 0.12);
    --dash-accent-glow: rgba(15, 118, 110, 0.18);
	    --dash-accent-text: #ffffff;
	    --dash-hot: #2563eb;
	    --dash-hot-glow: rgba(37, 99, 235, 0.18);
	    --dash-rim: rgba(37, 99, 235, 0.26);
	    --dash-particles-opacity: 0.9;
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
    --dash-meteor-tail-a: rgba(14, 116, 144, 0.16);
    --dash-meteor-tail-b: rgba(37, 99, 235, 0.68);
    --dash-meteor-tail-c: rgba(255, 255, 255, 0.92);
    --dash-meteor-head: rgba(255, 255, 255, 0.98);
    --dash-meteor-shadow-soft: rgba(37, 99, 235, 0.24);
    --dash-meteor-shadow-strong: rgba(125, 211, 252, 0.34);
    --dash-matrix-text: rgba(15, 118, 110, 0.82);
    --dash-matrix-soft: rgba(15, 118, 110, 0.12);
    --dash-matrix-strong: rgba(15, 118, 110, 0.36);
    --dash-matrix-glow: rgba(15, 118, 110, 0.12);
  }
  .dashboard-filter-panel {
    background: var(--dash-popover);
  }
	  .dashboard-particles {
	    opacity: var(--dash-particles-opacity);
	  }
	  .dashboard-particles canvas {
	    display: block;
	    height: 100%;
	    width: 100%;
	  }
	  .dashboard-pulse {
	    animation: dashboard-pulse 2.8s ease-in-out infinite;
	  }
  .dashboard-matrix-rain {
    opacity: 0.74;
  }
  .dashboard-progress-track {
    align-items: stretch;
  }
  .dashboard-progress-segment {
    min-width: 0;
    flex: 1 1 0;
    border-radius: 2px;
    border: 1px solid var(--dash-progress-segment-border);
    background: var(--dash-progress-segment);
  }
  .dashboard-progress-segment.is-filled {
    border-color: var(--dash-progress-fill-border);
    background: var(--dash-progress-fill);
  }
  .dashboard-progress-track.is-member-task .dashboard-progress-segment.is-filled {
    border-color: var(--dash-progress-fill-member-task-border);
    background: var(--dash-progress-fill-member-task);
  }
	  @keyframes dashboard-pulse {
	    0%, 100% { transform: scale(0.9); opacity: 0.72; }
	    50% { transform: scale(1.15); opacity: 1; }
	  }
	  @keyframes dashboard-meteor {
    0% { opacity: 0; transform: translate3d(0, 0, 0); }
    18% { opacity: 0.9; }
    72% { opacity: 0.82; }
    100% { opacity: 0; transform: translate3d(150vw, 0, 0); }
  }
  .dashboard-meteor {
    animation: dashboard-meteor ease-in-out infinite;
    will-change: transform, opacity;
  }
	  @media (prefers-reduced-motion: reduce) {
	    .dashboard-pulse {
	      animation: none;
	    }
	  }
  .dashboard-meteor-tail {
    background: linear-gradient(
      90deg,
      transparent 0%,
      var(--dash-meteor-tail-a) 22%,
      var(--dash-meteor-tail-b) 58%,
      var(--dash-meteor-tail-c) 84%,
      transparent 100%
    );
    box-shadow: 0 0 10px var(--dash-meteor-shadow-soft);
  }
  .dashboard-meteor-head {
    background: var(--dash-meteor-head);
    box-shadow: 0 0 12px var(--dash-meteor-shadow-strong);
  }
`;
