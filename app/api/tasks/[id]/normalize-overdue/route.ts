import { NextResponse } from "next/server";
import { withApiLogging } from "@/lib/api-logging";
import { guardMaintenanceApi } from "@/lib/maintenance";
import { getKanbanRepository } from "@/lib/repositories/kanban-repository";
import { errorMessage, errorStatus, requireActiveBoardContext } from "@/lib/server-session";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export const POST = withApiLogging("tasks.normalize-overdue", async function POST(request: Request, context: RouteContext) {
  const maintenanceResponse = await guardMaintenanceApi();
  if (maintenanceResponse) {
    return maintenanceResponse;
  }

  try {
    const { id } = await context.params;
    const body = await request.json().catch(() => ({}));
    const { user, board } = await requireActiveBoardContext();
    const repo = await getKanbanRepository();
    return NextResponse.json(await repo.normalizeTaskOverdue(user, board.id, id, body));
  } catch (error) {
    return NextResponse.json(
      { error: errorMessage(error, "更新超期状态失败") },
      { status: errorStatus(error) }
    );
  }
});
