import { NextResponse } from "next/server";
import { withApiLogging } from "@/lib/api-logging";
import { getKanbanRepository } from "@/lib/repositories/kanban-repository";
import { errorMessage, errorStatus, requireSessionUser } from "@/lib/server-session";

type RouteContext = { params: Promise<{ id: string }> };

export const PATCH = withApiLogging("boards.update", async function PATCH(request: Request, context: RouteContext) {
  try {
    const user = await requireSessionUser();
    const body = await request.json().catch(() => ({}));
    const { id } = await context.params;
    const repo = await getKanbanRepository();
    return NextResponse.json(await repo.updateBoard(user, id, body));
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error, "保存看板信息失败") }, { status: errorStatus(error) });
  }
});

export const DELETE = withApiLogging("boards.delete", async function DELETE(_request: Request, context: RouteContext) {
  try {
    const user = await requireSessionUser();
    const { id } = await context.params;
    const repo = await getKanbanRepository();
    return NextResponse.json(await repo.deleteBoard(user, id));
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error, "删除看板失败") }, { status: errorStatus(error) });
  }
});
