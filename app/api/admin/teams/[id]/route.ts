import { NextResponse } from "next/server";
import { withApiLogging } from "@/lib/api-logging";
import { getKanbanRepository } from "@/lib/repositories/kanban-repository";
import { errorMessage, errorStatus, requireAdminUser } from "@/lib/server-session";

type RouteContext = { params: Promise<{ id: string }> };

export const PATCH = withApiLogging("admin.teams.update", async function PATCH(request: Request, context: RouteContext) {
  try {
    const user = await requireAdminUser();
    const { id } = await context.params;
    const body = await request.json().catch(() => ({}));
    const repo = await getKanbanRepository();
    return NextResponse.json(await repo.updateTeam(user, id, body));
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error, "保存团队失败") }, { status: errorStatus(error) });
  }
});

export const DELETE = withApiLogging("admin.teams.delete", async function DELETE(_request: Request, context: RouteContext) {
  try {
    const user = await requireAdminUser();
    const { id } = await context.params;
    const repo = await getKanbanRepository();
    return NextResponse.json(await repo.deleteTeam(user, id));
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error, "删除团队失败") }, { status: errorStatus(error) });
  }
});
