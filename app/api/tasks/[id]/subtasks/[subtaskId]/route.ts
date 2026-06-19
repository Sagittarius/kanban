import { NextResponse } from "next/server";
import { deleteSubtask, updateSubtask } from "@/lib/board-store";
import { guardMaintenanceApi } from "@/lib/maintenance";

type RouteContext = {
  params: Promise<{
    id: string;
    subtaskId: string;
  }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const maintenanceResponse = await guardMaintenanceApi();
  if (maintenanceResponse) {
    return maintenanceResponse;
  }

  try {
    const { id, subtaskId } = await context.params;
    const body = await request.json();
    return NextResponse.json(await updateSubtask(id, subtaskId, body));
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to update subtask";

    return NextResponse.json(
      { error: message },
      { status: message === "Subtask not found" ? 404 : 500 }
    );
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const maintenanceResponse = await guardMaintenanceApi();
  if (maintenanceResponse) {
    return maintenanceResponse;
  }

  try {
    const { id, subtaskId } = await context.params;
    return NextResponse.json(await deleteSubtask(id, subtaskId));
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to delete subtask";

    return NextResponse.json(
      { error: message },
      { status: message === "Subtask not found" ? 404 : 500 }
    );
  }
}
