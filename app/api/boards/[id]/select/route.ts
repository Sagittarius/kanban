import { NextResponse } from "next/server";
import { withApiLogging } from "@/lib/api-logging";
import { ACTIVE_BOARD_COOKIE, sessionCookieOptions } from "@/lib/auth";
import { getKanbanRepository } from "@/lib/repositories/kanban-repository";
import { errorMessage, errorStatus, requireSessionUser } from "@/lib/server-session";

type RouteContext = { params: Promise<{ id: string }> };

export const POST = withApiLogging("boards.select", async function POST(_request: Request, context: RouteContext) {
  try {
    const user = await requireSessionUser();
    const { id } = await context.params;
    const repo = await getKanbanRepository();
    const board = await repo.resolveBoardForUser(user, id);
    const response = NextResponse.json(board);
    response.cookies.set(ACTIVE_BOARD_COOKIE, board.id, sessionCookieOptions());
    return response;
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error, "切换看板失败") }, { status: errorStatus(error) });
  }
});
