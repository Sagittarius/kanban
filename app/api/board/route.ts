import { NextResponse } from "next/server";
import { createSeedBoard } from "@/lib/board-data";
import { getBoard } from "@/lib/board-store";
import { guardMaintenanceApi } from "@/lib/maintenance";

export async function GET() {
  const maintenanceResponse = await guardMaintenanceApi();
  if (maintenanceResponse) {
    return maintenanceResponse;
  }

  try {
    return NextResponse.json(await getBoard());
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to load board data";

    if (message.startsWith("Failed query: select count(*) from")) {
      return NextResponse.json(createSeedBoard());
    }

    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
