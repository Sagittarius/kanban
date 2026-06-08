import { NextResponse } from "next/server";
import { getKanbanRepository } from "@/lib/repositories/kanban-repository";
import { errorMessage, errorStatus, requireSuperAdminUser } from "@/lib/server-session";

export async function GET() {
  try {
    await requireSuperAdminUser();
    const repo = await getKanbanRepository();
    return NextResponse.json(await repo.listUsers());
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error, "加载用户失败") }, { status: errorStatus(error) });
  }
}

export async function POST(request: Request) {
  try {
    await requireSuperAdminUser();
    const body = await request.json().catch(() => ({}));
    const repo = await getKanbanRepository();
    return NextResponse.json(await repo.createUser(body), { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error, "创建用户失败") }, { status: errorStatus(error) });
  }
}
