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

export const PATCH = withApiLogging("projects.update", async function PATCH(request: Request, context: RouteContext) {
  const maintenanceResponse = await guardMaintenanceApi();
  if (maintenanceResponse) {
    return maintenanceResponse;
  }

  try {
    const { id } = await context.params;
    const body = await request.json();
    const { user, board } = await requireActiveBoardContext();
    const repo = await getKanbanRepository();
    return NextResponse.json(await repo.updateProject(user, board.id, id, body));
  } catch (error) {
    return NextResponse.json(
      { error: errorMessage(error, "保存项目失败") },
      { status: errorStatus(error) }
    );
  }
});

export const DELETE = withApiLogging("projects.delete", async function DELETE(_request: Request, context: RouteContext) {
  const maintenanceResponse = await guardMaintenanceApi();
  if (maintenanceResponse) {
    return maintenanceResponse;
  }

  try {
    const { id } = await context.params;
    const { user, board } = await requireActiveBoardContext();
    const repo = await getKanbanRepository();
    return NextResponse.json(await repo.deleteProject(user, board.id, id));
  } catch (error) {
    return NextResponse.json(
      { error: errorMessage(error, "删除项目失败") },
      { status: errorStatus(error) }
    );
  }
});
