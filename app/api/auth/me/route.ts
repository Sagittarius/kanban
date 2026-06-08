import { NextResponse } from "next/server";
import { getKanbanRepository } from "@/lib/repositories/kanban-repository";
import { errorMessage, errorStatus, requireSessionUser } from "@/lib/server-session";

export async function GET() {
  try {
    return NextResponse.json({ user: await requireSessionUser() });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error, "未登录") }, { status: errorStatus(error) });
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await requireSessionUser();
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const repo = await getKanbanRepository();
    return NextResponse.json({ user: await repo.updateUserTimezone(user.id, body.timezone) });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error, "保存用户设置失败") }, { status: errorStatus(error) });
  }
}
