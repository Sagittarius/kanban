import { NextResponse } from "next/server";
import { createTask } from "@/lib/board-store";
import { guardMaintenanceApi } from "@/lib/maintenance";

export async function POST(request: Request) {
  const maintenanceResponse = await guardMaintenanceApi();
  if (maintenanceResponse) {
    return maintenanceResponse;
  }

  try {
    const body = await request.json();
    return NextResponse.json(await createTask(body), { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Unable to create task",
      },
      { status: 500 }
    );
  }
}
