import { NextResponse } from "next/server";
import { withApiLogging } from "@/lib/api-logging";
import { guardMaintenanceApi } from "@/lib/maintenance";
import { getKanbanRepository } from "@/lib/repositories/kanban-repository";
import { errorMessage, errorStatus, requireActiveBoardContext } from "@/lib/server-session";

export const GET = withApiLogging("activity.list", async function GET() {
  const maintenanceResponse = await guardMaintenanceApi();
  if (maintenanceResponse) {
    return maintenanceResponse;
  }

  try {
    const { user, board } = await requireActiveBoardContext();
    const repo = await getKanbanRepository();
    return NextResponse.json((await repo.getBoard(user, board.id)).activity);
  } catch (error) {
    return NextResponse.json(
      { error: errorMessage(error, "加载活动记录失败") },
      { status: errorStatus(error) }
    );
  }
});
