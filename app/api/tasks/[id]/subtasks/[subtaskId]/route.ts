import { NextResponse } from "next/server";
import { withApiLogging } from "@/lib/api-logging";
import { guardMaintenanceApi } from "@/lib/maintenance";
import { getKanbanRepository } from "@/lib/repositories/kanban-repository";
import { errorMessage, errorStatus, requireActiveBoardContext } from "@/lib/server-session";

type RouteContext = {
  params: Promise<{
    id: string;
    subtaskId: string;
  }>;
};

export const PATCH = withApiLogging("subtasks.update", async function PATCH(request: Request, context: RouteContext) {
  const maintenanceResponse = await guardMaintenanceApi();
  if (maintenanceResponse) {
    return maintenanceResponse;
  }

  try {
    const { id, subtaskId } = await context.params;
    const body = await request.json();
    const { user, board } = await requireActiveBoardContext();
    const repo = await getKanbanRepository();
    return NextResponse.json(await repo.updateSubtask(user, board.id, id, subtaskId, body));
  } catch (error) {
    return NextResponse.json(
      { error: errorMessage(error, "保存任务拆解失败") },
      { status: errorStatus(error) }
    );
  }
});

export const DELETE = withApiLogging("subtasks.delete", async function DELETE(_request: Request, context: RouteContext) {
  const maintenanceResponse = await guardMaintenanceApi();
  if (maintenanceResponse) {
    return maintenanceResponse;
  }

  try {
    const { id, subtaskId } = await context.params;
    const { user, board } = await requireActiveBoardContext();
    const repo = await getKanbanRepository();
    return NextResponse.json(await repo.deleteSubtask(user, board.id, id, subtaskId));
  } catch (error) {
    return NextResponse.json(
      { error: errorMessage(error, "删除任务拆解失败") },
      { status: errorStatus(error) }
    );
  }
});
