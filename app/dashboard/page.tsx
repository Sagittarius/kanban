import WorkloadDashboard from "@/components/workload-dashboard";
import LoginPage from "@/components/login-page";
import { DEFAULT_TIMEZONE } from "@/lib/timezone";
import { getKanbanRepository } from "@/lib/repositories/kanban-repository";
import { requireSessionUser } from "@/lib/server-session";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const repo = await getKanbanRepository();
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

  return (
    <WorkloadDashboard
      currentUser={
        user ?? {
          id: "public-dashboard",
          username: "public",
          role: "super_admin",
          timezone: DEFAULT_TIMEZONE,
          displayName: "公共视图",
          phone: "",
          avatarKey: "",
          jobTitle: "",
          techStacks: [],
        }
      }
      publicView={!user}
    />
  );
}
