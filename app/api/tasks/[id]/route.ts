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

export const PATCH = withApiLogging("tasks.update", async function PATCH(request: Request, context: RouteContext) {
  const maintenanceResponse = await guardMaintenanceApi();
  if (maintenanceResponse) {
    return maintenanceResponse;
  }

  try {
    const { id } = await context.params;
    const body = await request.json();
    const { user, board } = await requireActiveBoardContext();
    const repo = await getKanbanRepository();
    return NextResponse.json(await repo.updateTask(user, board.id, id, body));
  } catch (error) {
    return NextResponse.json(
      { error: errorMessage(error, "保存任务失败") },
      { status: errorStatus(error) }
    );
  }
});

export const DELETE = withApiLogging("tasks.delete", async function DELETE(_request: Request, context: RouteContext) {
  const maintenanceResponse = await guardMaintenanceApi();
  if (maintenanceResponse) {
    return maintenanceResponse;
  }

  try {
    const { id } = await context.params;
    const { user, board } = await requireActiveBoardContext();
    const repo = await getKanbanRepository();
    return NextResponse.json(await repo.deleteTask(user, board.id, id));
  } catch (error) {
    return NextResponse.json(
      { error: errorMessage(error, "删除任务失败") },
      { status: errorStatus(error) }
    );
  }
});
