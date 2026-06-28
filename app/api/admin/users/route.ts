import { NextResponse } from "next/server";
import { withApiLogging } from "@/lib/api-logging";
import { getKanbanRepository } from "@/lib/repositories/kanban-repository";
import { errorMessage, errorStatus, requireAdminUser } from "@/lib/server-session";

export const GET = withApiLogging("admin.users.list", async function GET() {
  try {
    const user = await requireAdminUser();
    const repo = await getKanbanRepository();
    const permissions = await repo.adminPermissions(user);
    return NextResponse.json({
      users: permissions.canManageUsers ? await repo.listUsers(user) : [],
      assignableUsers: await repo.listAssignableUsers(),
      permissions,
    });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error, "加载用户失败") }, { status: errorStatus(error) });
  }
});

export const POST = withApiLogging("admin.users.create", async function POST(request: Request) {
  try {
    const user = await requireAdminUser();
    const body = await request.json().catch(() => ({}));
    const repo = await getKanbanRepository();
    return NextResponse.json(await repo.createUser(body, user), { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error, "创建用户失败") }, { status: errorStatus(error) });
  }
});
