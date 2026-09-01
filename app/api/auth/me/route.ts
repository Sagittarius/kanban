import { NextResponse } from "next/server";
import { withApiLogging } from "@/lib/api-logging";
import { verifyPassword } from "@/lib/password";
import { getKanbanRepository } from "@/lib/repositories/kanban-repository";
import { errorMessage, errorStatus, requireSessionUser } from "@/lib/server-session";

export const GET = withApiLogging("auth.me", async function GET() {
  try {
    return NextResponse.json({ user: await requireSessionUser() });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error, "未登录") }, { status: errorStatus(error) });
  }
});

export const PATCH = withApiLogging("auth.profile.update", async function PATCH(request: Request) {
  try {
    const user = await requireSessionUser();
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const repo = await getKanbanRepository();
    const currentPassword = typeof body.currentPassword === "string" ? body.currentPassword : "";
    const nextPassword = typeof body.newPassword === "string" ? body.newPassword : "";

    if (currentPassword || nextPassword) {
      if (!currentPassword || !nextPassword) {
        return NextResponse.json({ error: "请输入当前密码和新密码" }, { status: 400 });
      }
      if (nextPassword.length < 6) {
        return NextResponse.json({ error: "新密码至少 6 位" }, { status: 400 });
      }
      const row = await repo.findUserByUsername(user.username);
      const passwordHash = typeof row?.password_hash === "string" ? row.password_hash : "";
      if (!row || !(await verifyPassword(currentPassword, passwordHash))) {
        return NextResponse.json({ error: "当前密码不正确" }, { status: 400 });
      }
      await repo.updateUserPassword(user.id, nextPassword);
      await repo.recordAuditLog({
        actor: user,
        action: "auth.password.change",
        resourceType: "user",
        resourceId: user.id,
        message: "用户修改登录密码",
      });
    }
    const updated = await repo.updateUserProfile(user.id, body);
    await repo.recordAuditLog({
      actor: user,
      action: "user.profile.update",
      resourceType: "user",
      resourceId: user.id,
      message: "用户更新个人资料",
      metadata: { updatedFields: Object.keys(body).filter((key) => key !== "currentPassword" && key !== "newPassword") },
    });
    return NextResponse.json({ user: updated });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error, "保存用户设置失败") }, { status: errorStatus(error) });
  }
});
