import { NextResponse } from "next/server";
import { guardMaintenanceApi } from "@/lib/maintenance";
import { getKanbanRepository } from "@/lib/repositories/kanban-repository";
import { errorMessage, errorStatus, requireActiveBoardContext } from "@/lib/server-session";

export async function GET() {
  const maintenanceResponse = await guardMaintenanceApi();
  if (maintenanceResponse) {
    return maintenanceResponse;
  }

  try {
    const { user, board } = await requireActiveBoardContext();
    const repo = await getKanbanRepository();
    return NextResponse.json(await repo.getBoard(user, board.id));
  } catch (error) {
    return NextResponse.json(
      { error: errorMessage(error, "加载看板失败") },
      { status: errorStatus(error) }
    );
  }
}
