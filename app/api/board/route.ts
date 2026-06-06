import { NextResponse } from "next/server";
import { getBoard } from "@/lib/board-store";

export async function GET() {
  try {
    return NextResponse.json(await getBoard());
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Unable to load board data",
      },
      { status: 500 }
    );
  }
}
