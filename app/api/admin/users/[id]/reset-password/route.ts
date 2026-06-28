import { NextResponse } from "next/server";
import { withApiLogging } from "@/lib/api-logging";
import { getKanbanRepository } from "@/lib/repositories/kanban-repository";
import { errorMessage, errorStatus, requireAdminUser } from "@/lib/server-session";

type RouteContext = { params: Promise<{ id: string }> };

export const POST = withApiLogging("admin.users.password.reset", async function POST(_request: Request, context: RouteContext) {
  try {
    const user = await requireAdminUser();
    const { id } = await context.params;
    const repo = await getKanbanRepository();
    return NextResponse.json(await repo.resetUserPassword(user, id));
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error, "重置密码失败") }, { status: errorStatus(error) });
  }
});
