import { NextResponse } from "next/server";
import { reorderTasks } from "@/lib/board-store";
import { errorMessage, errorStatus, requireSessionUser, resolveActiveBoard } from "@/lib/server-session";

export async function POST(request: Request) {
  try {
    const user = await requireSessionUser();
    const board = await resolveActiveBoard(user);
    const body = await request.json().catch(() => ({}));
    return NextResponse.json(await reorderTasks(user, board.id, body));
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error, "Unable to reorder tasks") }, { status: errorStatus(error) });
  }
}
