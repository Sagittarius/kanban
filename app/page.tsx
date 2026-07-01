import AuthenticatedShell from "@/components/authenticated-shell";
import MaintenancePage from "@/components/maintenance-page";
import AppErrorPage from "@/components/app-error-page";
import KanbanRuntimeGuard from "@/components/kanban-runtime-guard";
import LoginPage from "@/components/login-page";
import { cookies } from "next/headers";
import { isAuthFeatureEnabled } from "@/lib/auth-feature";
import { getAppVersion, getImageTag } from "@/lib/app-meta";
import { readChangelogEntries } from "@/lib/changelog";
import { readMaintenanceState } from "@/lib/maintenance";
import { getKanbanRepository } from "@/lib/repositories/kanban-repository";
import { getOptionalSessionUser, requireSessionUser, resolveActiveBoard } from "@/lib/server-session";
import { isThemeId } from "@/lib/ui-options";

export const dynamic = "force-dynamic";

function todayKeyInChina() {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("zh-CN", {
      timeZone: "Asia/Shanghai",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .formatToParts(new Date())
      .map((part) => [part.type, part.value])
  );

  return `${parts.year}-${parts.month}-${parts.day}`;
}

export default async function Home() {
  const maintenanceState = await readMaintenanceState();
  const appVersion = getAppVersion();
  const imageTag = getImageTag();
  const changelogEntries = readChangelogEntries();
  const themeCookie = (await cookies()).get("kanban_theme")?.value;
  const initialThemeId = isThemeId(themeCookie) ? themeCookie : "notion";

  if (maintenanceState) {
    return (
      <MaintenancePage
        initialState={maintenanceState}
        appVersion={appVersion}
        imageTag={imageTag}
      />
    );
  }

  const optionalUser = await getOptionalSessionUser();
  if (isAuthFeatureEnabled() && !optionalUser) {
    return <LoginPage />;
  }

  const user = optionalUser ?? (await requireSessionUser());
  const repo = await getKanbanRepository();

  try {
    const activeBoard = await resolveActiveBoard(user);
    const board = await repo.getBoard(user, activeBoard.id);

    const runtime = (
      <KanbanRuntimeGuard
        initialBoard={board}
        todayKey={board.todayKey ?? todayKeyInChina()}
        appVersion={appVersion}
        changelogEntries={changelogEntries}
        initialThemeId={initialThemeId}
      />
    );

    if (!isAuthFeatureEnabled()) {
      return runtime;
    }

    return (
      <AuthenticatedShell
        user={user}
        boards={board.boards ?? []}
        activeBoardId={board.activeBoardId ?? activeBoard.id}
      >
        {runtime}
      </AuthenticatedShell>
    );
  } catch (error) {
    return (
      <AppErrorPage
        title="当前账号没有可访问的看板"
        detail={error instanceof Error ? error.message : "加载看板失败"}
      />
    );
  }
}
