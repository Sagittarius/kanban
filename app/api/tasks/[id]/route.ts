import { NextResponse } from "next/server";
import { deleteTask, updateTask } from "@/lib/board-store";
import { guardMaintenanceApi } from "@/lib/maintenance";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const maintenanceResponse = await guardMaintenanceApi();
  if (maintenanceResponse) {
    return maintenanceResponse;
  }

  try {
    const { id } = await context.params;
    const body = await request.json();
    return NextResponse.json(await updateTask(id, body));
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to update task";

    return NextResponse.json(
      { error: message },
      { status: message === "Task not found" ? 404 : 500 }
    );
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const maintenanceResponse = await guardMaintenanceApi();
  if (maintenanceResponse) {
    return maintenanceResponse;
  }

  try {
    const { id } = await context.params;
    return NextResponse.json(await deleteTask(id));
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to delete task";

    return NextResponse.json(
      { error: message },
      { status: message === "Task not found" ? 404 : 500 }
    );
  }
}
