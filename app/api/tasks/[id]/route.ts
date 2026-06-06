import { NextResponse } from "next/server";
import { updateTask } from "@/lib/board-store";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function PATCH(request: Request, context: RouteContext) {
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
