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

export const PATCH = withApiLogging("tasks.detail.update", async function PATCH(request: Request, context: RouteContext) {
  const maintenanceResponse = await guardMaintenanceApi();
  if (maintenanceResponse) {
    return maintenanceResponse;
  }

  try {
    const { id } = await context.params;
    const body = await request.json();
    const { user, board } = await requireActiveBoardContext();
    const repo = await getKanbanRepository();
    return NextResponse.json(await repo.saveTaskDetail(user, board.id, id, body));
  } catch (error) {
    return NextResponse.json(
      { error: errorMessage(error, "保存任务详情失败") },
      { status: errorStatus(error) }
    );
  }
});
