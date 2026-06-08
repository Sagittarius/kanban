import { NextResponse } from "next/server";
import { deleteProject, updateProject } from "@/lib/board-store";
import { errorMessage, errorStatus, requireSessionUser, resolveActiveBoard } from "@/lib/server-session";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const user = await requireSessionUser();
    const board = await resolveActiveBoard(user);
    const { id } = await context.params;
    const body = await request.json().catch(() => ({}));
    return NextResponse.json(await updateProject(user, board.id, id, body));
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error, "Unable to update project") }, { status: errorStatus(error) });
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const user = await requireSessionUser();
    const board = await resolveActiveBoard(user);
    const { id } = await context.params;
    return NextResponse.json(await deleteProject(user, board.id, id));
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error, "Unable to delete project") }, { status: errorStatus(error) });
  }
}
