import { NextResponse } from "next/server";
import { reorderTasks } from "@/lib/board-store";
import { guardMaintenanceApi } from "@/lib/maintenance";

export async function POST(request: Request) {
  const maintenanceResponse = await guardMaintenanceApi();
  if (maintenanceResponse) {
    return maintenanceResponse;
  }

  try {
    const body = await request.json();
    return NextResponse.json(await reorderTasks(body));
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Unable to reorder tasks",
      },
      { status: 500 }
    );
  }
}
