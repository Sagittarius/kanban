import Link from "next/link";
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

  if (user && user.role !== "super_admin" && user.role !== "project_manager") {
    if (publicEnabled) {
      return (
        <WorkloadDashboard
          currentUser={{
            id: "public-dashboard",
            username: "public",
            role: "super_admin",
            timezone: DEFAULT_TIMEZONE,
            displayName: "公共视图",
            avatarKey: "",
          }}
          publicView
        />
      );
    }

    return (
      <main className="grid min-h-screen place-items-center bg-slate-950 px-6 text-white">
        <section className="max-w-md rounded-2xl border border-white/10 bg-white/8 p-8 text-center shadow-2xl">
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-cyan-300">403</p>
          <h1 className="mt-3 text-2xl font-semibold">无权访问</h1>
          <Link href="/" className="mt-6 inline-flex rounded-full bg-cyan-300 px-5 py-2 text-sm font-semibold text-slate-950">
            返回看板
          </Link>
        </section>
      </main>
    );
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
          avatarKey: "",
        }
      }
      publicView={!user}
    />
  );
}
