import { NextResponse } from "next/server";
import { withApiLogging } from "@/lib/api-logging";
import { guardMaintenanceApi } from "@/lib/maintenance";
import { getKanbanRepository } from "@/lib/repositories/kanban-repository";
import { errorMessage, errorStatus, requireActiveBoardContext } from "@/lib/server-session";

export const POST = withApiLogging("projects.create", async function POST(request: Request) {
  const maintenanceResponse = await guardMaintenanceApi();
  if (maintenanceResponse) {
    return maintenanceResponse;
  }

  try {
    const body = await request.json();
    const { user, board } = await requireActiveBoardContext();
    const repo = await getKanbanRepository();
    return NextResponse.json(await repo.createProject(user, board.id, body), { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: errorMessage(error, "创建项目失败") },
      { status: errorStatus(error) }
    );
  }
});
