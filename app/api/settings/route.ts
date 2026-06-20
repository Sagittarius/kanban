import { NextResponse } from "next/server";
import { guardMaintenanceApi } from "@/lib/maintenance";
import { getKanbanRepository } from "@/lib/repositories/kanban-repository";
import { errorMessage, errorStatus, requireSessionUser } from "@/lib/server-session";

export async function GET() {
  const maintenanceResponse = await guardMaintenanceApi();
  if (maintenanceResponse) {
    return maintenanceResponse;
  }

  try {
    const user = await requireSessionUser();
    const repo = await getKanbanRepository();
    return NextResponse.json(await repo.getSystemSettings(user));
  } catch (error) {
    return NextResponse.json(
      { error: errorMessage(error, "加载参数失败") },
      { status: errorStatus(error) }
    );
  }
}

export async function PATCH(request: Request) {
  const maintenanceResponse = await guardMaintenanceApi();
  if (maintenanceResponse) {
    return maintenanceResponse;
  }

  try {
    const body = await request.json();
    const user = await requireSessionUser();
    const repo = await getKanbanRepository();
    return NextResponse.json(await repo.updateSystemSettings(user, body));
  } catch (error) {
    return NextResponse.json(
      { error: errorMessage(error, "保存参数失败") },
      { status: errorStatus(error) }
    );
  }
}
