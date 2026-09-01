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

export const POST = withApiLogging("subtasks.create", async function POST(request: Request, context: RouteContext) {
  const maintenanceResponse = await guardMaintenanceApi();
  if (maintenanceResponse) {
    return maintenanceResponse;
  }

  try {
    const { id } = await context.params;
    const body = await request.json();
    const { user, board } = await requireActiveBoardContext();
    const repo = await getKanbanRepository();
    return NextResponse.json(await repo.createSubtask(user, board.id, id, body), { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: errorMessage(error, "创建任务拆解失败") },
      { status: errorStatus(error) }
    );
  }
});
