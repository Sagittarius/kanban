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

export const POST = withApiLogging("tasks.rework", async function POST(_request: Request, context: RouteContext) {
  const maintenanceResponse = await guardMaintenanceApi();
  if (maintenanceResponse) {
    return maintenanceResponse;
  }

  try {
    const { id } = await context.params;
    const { user, board } = await requireActiveBoardContext();
    const repo = await getKanbanRepository();
    return NextResponse.json(await repo.createReworkTask(user, board.id, id));
  } catch (error) {
    return NextResponse.json(
      { error: errorMessage(error, "发起返工失败") },
      { status: errorStatus(error) }
    );
  }
});
