import { NextResponse } from "next/server";
import { getKanbanRepository } from "@/lib/repositories/kanban-repository";
import { errorMessage, errorStatus, requireSessionUser } from "@/lib/server-session";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const user = await requireSessionUser();
    const body = await request.json().catch(() => ({}));
    const { id } = await context.params;
    const repo = await getKanbanRepository();
    return NextResponse.json(await repo.updateBoard(user, id, body));
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error, "保存看板信息失败") }, { status: errorStatus(error) });
  }
}
