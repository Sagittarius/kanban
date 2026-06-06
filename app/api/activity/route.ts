import { NextResponse } from "next/server";
import { createSeedBoard } from "@/lib/board-data";
import { getBoard } from "@/lib/board-store";

export async function GET() {
  try {
    const board = await getBoard();
    return NextResponse.json(board.activity);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to load activity";

    if (message.startsWith("Failed query: select count(*) from")) {
      return NextResponse.json(createSeedBoard().activity);
    }

    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
