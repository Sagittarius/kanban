import { NextResponse } from "next/server";
import { getKanbanRepository } from "@/lib/repositories/kanban-repository";
import { errorMessage, errorStatus, requireSessionUser } from "@/lib/server-session";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const repo = await getKanbanRepository();
    const input = {
      teamId: url.searchParams.get("teamId") ?? "",
      projectId: url.searchParams.get("projectId") ?? "",
    };
    const publicEnabled = await repo.workloadDashboardPublicEnabled();
    const user = await requireSessionUser().catch((error: unknown) => {
      if (error instanceof Error && error.message === "Unauthorized") {
        return null;
      }
      throw error;
    });

    if (!user || (user.role !== "super_admin" && user.role !== "project_manager")) {
      if (!publicEnabled) {
        throw new Error(user ? "Forbidden" : "Unauthorized");
      }
      return NextResponse.json(await repo.getPublicWorkloadDashboard(input));
    }

    return NextResponse.json(
      await repo.getWorkloadDashboard(user, input)
    );
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error, "加载面板失败") }, { status: errorStatus(error) });
  }
}
