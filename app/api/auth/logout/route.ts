import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { withApiLogging } from "@/lib/api-logging";
import {
  ACTIVE_BOARD_COOKIE,
  SESSION_COOKIE,
  activeBoardCookieName,
  activeBoardCookieOptions,
  expiredCookieOptions,
} from "@/lib/auth";
import { getKanbanRepository } from "@/lib/repositories/kanban-repository";
import { getOptionalSessionUser } from "@/lib/server-session";

export const POST = withApiLogging("auth.logout", async function POST() {
  const cookieStore = await cookies();
  const user = await getOptionalSessionUser();
  let migratedBoardId = "";
  if (user) {
    const repo = await getKanbanRepository();
    await repo.recordAuditLog({
      actor: user,
      action: "auth.logout",
      resourceType: "user",
      resourceId: user.id,
      message: "用户退出登录",
    });
    const scopedCookieName = activeBoardCookieName(user.id);
    const scopedBoardId = cookieStore.get(scopedCookieName)?.value;
    const legacyBoardId = cookieStore.get(ACTIVE_BOARD_COOKIE)?.value;
    if (!scopedBoardId && legacyBoardId) {
      try {
        migratedBoardId = (await repo.resolveBoardForUser(user, legacyBoardId)).id;
      } catch {
        // Board migration is best-effort and must not prevent logout.
      }
    }
  }
  const response = NextResponse.json({ ok: true });
  if (user && migratedBoardId) {
    response.cookies.set(activeBoardCookieName(user.id), migratedBoardId, activeBoardCookieOptions());
  }
  response.cookies.set(ACTIVE_BOARD_COOKIE, "", expiredCookieOptions());
  response.cookies.set(SESSION_COOKIE, "", expiredCookieOptions());
  return response;
});
