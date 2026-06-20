import { NextResponse } from "next/server";
import { getKanbanRepository } from "@/lib/repositories/kanban-repository";
import { errorMessage, errorStatus, requireSessionUser } from "@/lib/server-session";

export async function GET() {
  try {
    const user = await requireSessionUser();
    const repo = await getKanbanRepository();
    return NextResponse.json(await repo.listBoardsForUser(user));
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error, "加载看板失败") }, { status: errorStatus(error) });
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireSessionUser();
    const body = await request.json().catch(() => ({}));
    const repo = await getKanbanRepository();
    return NextResponse.json(await repo.createBoard(user, body), { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error, "创建看板失败") }, { status: errorStatus(error) });
  }
}
