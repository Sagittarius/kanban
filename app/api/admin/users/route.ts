import { NextResponse } from "next/server";
import { withApiLogging } from "@/lib/api-logging";
import { getKanbanRepository } from "@/lib/repositories/kanban-repository";
import { errorMessage, errorStatus, requireAdminUser } from "@/lib/server-session";

export const GET = withApiLogging("admin.users.list", async function GET(request: Request) {
  try {
    const user = await requireAdminUser();
    const repo = await getKanbanRepository();
    const permissions = await repo.adminPermissions(user);
    const directoryUsers = await repo.listUserDirectory();
    const url = new URL(request.url);
    const page = Number(url.searchParams.get("page") ?? "1");
    const pageSize = Number(url.searchParams.get("pageSize") ?? "24");
    const query = url.searchParams.get("query") ?? "";
    const pageResult = permissions.canManageUsers
      ? await repo.listUsersPage(user, { page, pageSize, query })
      : {
          items: [],
          total: 0,
          page: 1,
          pageSize,
          stats: {
            users: directoryUsers.length,
            activeUsers: directoryUsers.filter((item) => item.isActive).length,
            projectManagers: directoryUsers.filter((item) => item.role === "project_manager").length,
          },
        };
    return NextResponse.json({
      users: pageResult.items,
      total: pageResult.total,
      page: pageResult.page,
      pageSize: pageResult.pageSize,
      stats: pageResult.stats,
      assignableUsers: await repo.listAssignableUsers(),
      directoryUsers,
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
