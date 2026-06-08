import { NextResponse } from "next/server";
import { deleteSubtask, updateSubtask } from "@/lib/board-store";
import { errorMessage, errorStatus, requireSessionUser, resolveActiveBoard } from "@/lib/server-session";

type RouteContext = { params: Promise<{ id: string; subtaskId: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const user = await requireSessionUser();
    const board = await resolveActiveBoard(user);
    const { id, subtaskId } = await context.params;
    const body = await request.json().catch(() => ({}));
    return NextResponse.json(await updateSubtask(user, board.id, id, subtaskId, body));
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error, "Unable to update subtask") }, { status: errorStatus(error) });
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const user = await requireSessionUser();
    const board = await resolveActiveBoard(user);
    const { id, subtaskId } = await context.params;
    return NextResponse.json(await deleteSubtask(user, board.id, id, subtaskId));
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error, "Unable to delete subtask") }, { status: errorStatus(error) });
  }
}
