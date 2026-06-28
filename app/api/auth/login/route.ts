import { NextResponse } from "next/server";
import { withApiLogging } from "@/lib/api-logging";
import { createSessionToken, SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth";
import { verifyPassword } from "@/lib/password";
import { getKanbanRepository } from "@/lib/repositories/kanban-repository";

export const POST = withApiLogging("auth.login", async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const username = typeof body.username === "string" ? body.username.trim() : "";
    const password = typeof body.password === "string" ? body.password : "";
    if (!username || !password) {
      return NextResponse.json({ error: "请输入用户名和密码" }, { status: 400 });
    }

    const repo = await getKanbanRepository();
    const row = await repo.findUserByUsername(username);
    const active = row?.is_active === 1 || row?.is_active === true;
    const passwordHash = typeof row?.password_hash === "string" ? row.password_hash : "";
    if (!row || !active || !(await verifyPassword(password, passwordHash))) {
      await repo.recordAuditLog({
        actorUsername: username,
        action: "auth.login",
        resourceType: "user",
        result: "failure",
        message: "登录失败：用户名或密码错误",
        metadata: { active: Boolean(row && active) },
      });
      return NextResponse.json({ error: "用户名或密码错误" }, { status: 401 });
    }

    const userId = typeof row.id === "string" ? row.id : "";
    const user = await repo.getUserById(userId);
    if (!user) {
      return NextResponse.json({ error: "用户不可用" }, { status: 401 });
    }

    const response = NextResponse.json({ user });
    response.cookies.set(SESSION_COOKIE, await createSessionToken(user.id), sessionCookieOptions());
    await repo.recordAuditLog({
      actor: user,
      action: "auth.login",
      resourceType: "user",
      resourceId: user.id,
      message: "用户登录成功",
    });
    return response;
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "登录失败" },
      { status: 500 }
    );
  }
});
