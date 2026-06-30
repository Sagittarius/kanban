import { NextResponse } from "next/server";
import { withApiLogging } from "@/lib/api-logging";
import { getKanbanRepository } from "@/lib/repositories/kanban-repository";
import { errorMessage, errorStatus, requireAdminUser } from "@/lib/server-session";

export const GET = withApiLogging("admin.boards.list", async function GET(request: Request) {
  try {
    const user = await requireAdminUser();
    const repo = await getKanbanRepository();
    const url = new URL(request.url);
    const page = Number(url.searchParams.get("page") ?? "1");
    const pageSize = Number(url.searchParams.get("pageSize") ?? "12");
    const query = url.searchParams.get("query") ?? "";
    const pageResult = await repo.listBoardsForAdminPage(user, { page, pageSize, query });
    const membersByBoard = await repo.listBoardMembersMap(pageResult.items.map((board) => board.id));
    return NextResponse.json({
      boards: pageResult.items.map((board) => ({ ...board, members: membersByBoard.get(board.id) ?? [] })),
      total: pageResult.total,
      page: pageResult.page,
      pageSize: pageResult.pageSize,
      stats: pageResult.stats,
    });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error, "加载看板失败") }, { status: errorStatus(error) });
  }
});
