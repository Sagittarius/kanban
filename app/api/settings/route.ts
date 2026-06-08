import { NextResponse } from "next/server";
import { getSystemSettings, updateSystemSettings } from "@/lib/board-store";
import { errorMessage, errorStatus, requireSuperAdminUser } from "@/lib/server-session";

export async function GET() {
  try {
    const user = await requireSuperAdminUser();
    return NextResponse.json(await getSystemSettings(user));
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error, "Unable to load settings") }, { status: errorStatus(error) });
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await requireSuperAdminUser();
    const body = await request.json().catch(() => ({}));
    return NextResponse.json(await updateSystemSettings(user, body));
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error, "Unable to update settings") }, { status: errorStatus(error) });
  }
}
