import { NextResponse } from "next/server";
import { createSubtask } from "@/lib/board-store";
import { guardMaintenanceApi } from "@/lib/maintenance";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function POST(request: Request, context: RouteContext) {
  const maintenanceResponse = await guardMaintenanceApi();
  if (maintenanceResponse) {
    return maintenanceResponse;
  }

  try {
    const { id } = await context.params;
    const body = await request.json();
    return NextResponse.json(await createSubtask(id, body), { status: 201 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to create subtask";

    return NextResponse.json(
      { error: message },
      { status: message === "Task not found" ? 404 : 500 }
    );
  }
}
