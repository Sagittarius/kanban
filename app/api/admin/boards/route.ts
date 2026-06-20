import { NextResponse } from "next/server";
import { getKanbanRepository } from "@/lib/repositories/kanban-repository";
import { errorMessage, errorStatus, requireSuperAdminUser } from "@/lib/server-session";

export async function GET() {
  try {
    await requireSuperAdminUser();
    const repo = await getKanbanRepository();
    const boards = await repo.listBoardsForAdmin();
    const withMembers = await Promise.all(
      boards.map(async (board) => ({ ...board, members: await repo.listBoardMembers(board.id) }))
    );
    return NextResponse.json(withMembers);
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error, "加载看板失败") }, { status: errorStatus(error) });
  }
}
