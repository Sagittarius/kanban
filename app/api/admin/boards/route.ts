import { NextResponse } from "next/server";
import { getKanbanRepository } from "@/lib/repositories/kanban-repository";
import { errorMessage, errorStatus, requireAdminUser } from "@/lib/server-session";

export async function GET() {
  try {
    const user = await requireAdminUser();
    const repo = await getKanbanRepository();
    const boards = await repo.listBoardsForAdmin(user);
    const withMembers = await Promise.all(
      boards.map(async (board) => ({ ...board, members: await repo.listBoardMembers(board.id) }))
    );
    return NextResponse.json(withMembers);
  } catch (error) {
    const status = errorStatus(error);
    if (status >= 500) {
      console.error("[kanban][api-error]", JSON.stringify(apiErrorLog("GET /api/admin/boards", status, error)));
    }
    return NextResponse.json({ error: errorMessage(error, "加载看板失败") }, { status });
  }
}

function apiErrorLog(route: string, status: number, error: unknown) {
  if (error instanceof Error) {
    return {
      route,
      status,
      name: error.name,
      message: error.message,
      stack: error.stack,
      cause: error.cause instanceof Error ? { name: error.cause.name, message: error.cause.message, stack: error.cause.stack } : error.cause,
    };
  }
  return {
    route,
    status,
    message: String(error),
  };
}
