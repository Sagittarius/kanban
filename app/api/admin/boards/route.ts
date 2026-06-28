import { NextResponse } from "next/server";
import { withApiLogging } from "@/lib/api-logging";
import { getKanbanRepository } from "@/lib/repositories/kanban-repository";
import { errorMessage, errorStatus, requireAdminUser } from "@/lib/server-session";

export const GET = withApiLogging("admin.boards.list", async function GET() {
  try {
    const user = await requireAdminUser();
    const repo = await getKanbanRepository();
    const boards = await repo.listBoardsForAdmin(user);
    const withMembers = await Promise.all(
      boards.map(async (board) => ({ ...board, members: await repo.listBoardMembers(board.id) }))
    );
    return NextResponse.json(withMembers);
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error, "加载看板失败") }, { status: errorStatus(error) });
  }
});
