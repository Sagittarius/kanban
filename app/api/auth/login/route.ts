import { NextResponse } from "next/server";
import { createSessionToken, SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth";
import { verifyPassword } from "@/lib/password";
import { getKanbanRepository } from "@/lib/repositories/kanban-repository";

export async function POST(request: Request) {
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
    if (!row || !active || !(await verifyPassword(password, row.password_hash))) {
      return NextResponse.json({ error: "用户名或密码错误" }, { status: 401 });
    }

    const user = await repo.getUserById(row.id);
    if (!user) {
      return NextResponse.json({ error: "用户不可用" }, { status: 401 });
    }

    const response = NextResponse.json({ user });
    response.cookies.set(SESSION_COOKIE, await createSessionToken(user.id), sessionCookieOptions());
    return response;
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "登录失败" },
      { status: 500 }
    );
  }
}
