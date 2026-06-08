import { NextResponse } from "next/server";
import { createSubtask } from "@/lib/board-store";
import { errorMessage, errorStatus, requireSessionUser, resolveActiveBoard } from "@/lib/server-session";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  try {
    const user = await requireSessionUser();
    const board = await resolveActiveBoard(user);
    const { id } = await context.params;
    const body = await request.json().catch(() => ({}));
    return NextResponse.json(await createSubtask(user, board.id, id, body), { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error, "Unable to create subtask") }, { status: errorStatus(error) });
  }
}
