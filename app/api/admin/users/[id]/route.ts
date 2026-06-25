import { NextResponse } from "next/server";
import { getKanbanRepository } from "@/lib/repositories/kanban-repository";
import { errorMessage, errorStatus, requireAdminUser } from "@/lib/server-session";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const user = await requireAdminUser();
    const { id } = await context.params;
    const body = await request.json().catch(() => ({}));
    const repo = await getKanbanRepository();
    return NextResponse.json(await repo.updateManagedUser(user, id, body));
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error, "保存用户失败") }, { status: errorStatus(error) });
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const user = await requireAdminUser();
    const { id } = await context.params;
    const repo = await getKanbanRepository();
    return NextResponse.json(await repo.deleteManagedUser(user, id));
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error, "删除用户失败") }, { status: errorStatus(error) });
  }
}
