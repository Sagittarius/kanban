import WorkloadDashboard from "@/components/workload-dashboard";
import LoginPage from "@/components/login-page";
import { cookies } from "next/headers";
import { errorFields, getLogger } from "@/lib/logger";
import { withPageLogging } from "@/lib/page-logging";
import { DEFAULT_TIMEZONE } from "@/lib/timezone";
import { getKanbanRepository } from "@/lib/repositories/kanban-repository";
import { requireSessionUser } from "@/lib/server-session";
import { getAppVersion } from "@/lib/app-meta";
import type { CurrentUser } from "@/lib/auth-models";

export const dynamic = "force-dynamic";
const dashboardPageLogger = getLogger("dashboard-page");
const PUBLIC_DASHBOARD_USER: CurrentUser = {
  id: "public-dashboard",
  username: "public",
  role: "super_admin",
  timezone: DEFAULT_TIMEZONE,
  displayName: "公共视图",
  phone: "",
  avatarKey: "",
  jobTitle: "",
  techStacks: [],
};

export default async function DashboardPage() {
  return withPageLogging("/dashboard", async (pageLogContext) => {
    try {
      const repo = await getKanbanRepository();
      const themeCookie = (await cookies()).get("kanban_dashboard_theme")?.value;
      const initialTheme = themeCookie === "light" || themeCookie === "dark" ? themeCookie : "dark";
      const user = await requireSessionUser().catch((error: unknown) => {
        if (error instanceof Error && error.message === "Unauthorized") {
          return null;
        }
        throw error;
      });
      const publicEnabled = await repo.workloadDashboardPublicEnabled();
      if (!user && !publicEnabled) {
        return <LoginPage />;
      }
      if (user) {
        pageLogContext.setContext({ username: user.username, display_name: user.displayName || "" });
      }

      // The dashboard service still expects a CurrentUser shape. Public mode uses
      // this synthetic user only as UI context; data visibility is controlled by
      // the public-dashboard repository path above.
      const currentUser = user ? serializableCurrentUser(user) : PUBLIC_DASHBOARD_USER;

      return <WorkloadDashboard currentUser={currentUser} publicView={!user} initialTheme={initialTheme} appVersion={getAppVersion()} />;
    } catch (error) {
      dashboardPageLogger.error("dashboard page render failed", {
        requestId: pageLogContext.requestId,
        path: "/dashboard",
        ...errorFields(error),
      });
      throw error;
    }
  });
}

function serializableCurrentUser(user: CurrentUser): CurrentUser {
  return {
    id: user.id,
    username: user.username,
    role: user.role,
    timezone: user.timezone,
    displayName: user.displayName,
    phone: user.phone,
    avatarKey: user.avatarKey,
    jobTitle: user.jobTitle,
    techStacks: [...user.techStacks],
  };
}
