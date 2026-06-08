import { NextResponse } from "next/server";
import { getBoard } from "@/lib/board-store";
import { errorMessage, errorStatus, requireSessionUser, resolveActiveBoard } from "@/lib/server-session";

export async function GET() {
  try {
    const user = await requireSessionUser();
    const board = await resolveActiveBoard(user);
    return NextResponse.json(await getBoard(user, board.id));
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error, "Unable to load board data") }, { status: errorStatus(error) });
  }
}
