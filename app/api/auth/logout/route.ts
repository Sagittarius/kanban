import { NextResponse } from "next/server";
import { withApiLogging } from "@/lib/api-logging";
import { ACTIVE_BOARD_COOKIE, expiredCookieOptions, SESSION_COOKIE } from "@/lib/auth";
import { getKanbanRepository } from "@/lib/repositories/kanban-repository";
import { getOptionalSessionUser } from "@/lib/server-session";

export const POST = withApiLogging("auth.logout", async function POST() {
  const user = await getOptionalSessionUser();
  if (user) {
    const repo = await getKanbanRepository();
    await repo.recordAuditLog({
      actor: user,
      action: "auth.logout",
      resourceType: "user",
      resourceId: user.id,
      message: "用户退出登录",
    });
  }
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, "", expiredCookieOptions());
  response.cookies.set(ACTIVE_BOARD_COOKIE, "", expiredCookieOptions());
  return response;
});
