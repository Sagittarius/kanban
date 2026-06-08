import { NextResponse } from "next/server";
import { getKanbanRepository } from "@/lib/repositories/kanban-repository";
import { errorMessage, errorStatus, requireSuperAdminUser } from "@/lib/server-session";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  try {
    await requireSuperAdminUser();
    const { id } = await context.params;
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const userId = typeof body.userId === "string" ? body.userId : "";
    const repo = await getKanbanRepository();
    if (body.action === "revoke") {
      return NextResponse.json(await repo.revokeBoardViewer(id, userId));
    }
    return NextResponse.json(await repo.grantBoardViewer(id, userId));
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error, "保存授权失败") }, { status: errorStatus(error) });
  }
}
