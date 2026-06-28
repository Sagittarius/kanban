import { NextResponse } from "next/server";
import { withApiLogging } from "@/lib/api-logging";
import { getKanbanRepository } from "@/lib/repositories/kanban-repository";
import { errorMessage, errorStatus, requireSessionUser } from "@/lib/server-session";

export const GET = withApiLogging("dashboard.get", async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const repo = await getKanbanRepository();
    const teamIds = url.searchParams.getAll("teamId").filter(Boolean);
    const projectIds = url.searchParams.getAll("projectId").filter(Boolean);
    const input = {
      teamIds,
      projectIds,
    };
    const publicEnabled = await repo.workloadDashboardPublicEnabled();
    const user = await requireSessionUser().catch((error: unknown) => {
      if (error instanceof Error && error.message === "Unauthorized") {
        return null;
      }
      throw error;
    });

    if (publicEnabled) {
      return NextResponse.json(await repo.getPublicWorkloadDashboard(input));
    }

    if (!user) {
      throw new Error("Unauthorized");
    }

    return NextResponse.json(await repo.getWorkloadDashboard(user, input));
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error, "加载面板失败") }, { status: errorStatus(error) });
  }
});
