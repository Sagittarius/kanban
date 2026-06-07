import { NextResponse } from "next/server";
import { getSystemSettings, updateSystemSettings } from "@/lib/board-store";

export async function GET() {
  try {
    return NextResponse.json(await getSystemSettings());
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Unable to load settings",
      },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    return NextResponse.json(await updateSystemSettings(body));
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Unable to update settings",
      },
      { status: 500 }
    );
  }
}
