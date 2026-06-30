import { NextResponse } from "next/server";
import { withApiLogging } from "@/lib/api-logging";
import { getKanbanRepository } from "@/lib/repositories/kanban-repository";
import { errorMessage, errorStatus, requireAdminUser } from "@/lib/server-session";

export const GET = withApiLogging("admin.teams.list", async function GET(request: Request) {
  try {
    const user = await requireAdminUser();
    const repo = await getKanbanRepository();
    const url = new URL(request.url);
    const page = Number(url.searchParams.get("page") ?? "1");
    const pageSize = Number(url.searchParams.get("pageSize") ?? "18");
    const query = url.searchParams.get("query") ?? "";
    const pageResult = await repo.listTeamsForAdminPage(user, { page, pageSize, query });
    return NextResponse.json({
      teams: pageResult.items,
      total: pageResult.total,
      page: pageResult.page,
      pageSize: pageResult.pageSize,
      stats: pageResult.stats,
      teamOptions: await repo.listTeamOptionsForAdmin(user),
      assignableUsers: await repo.listAssignableUsers(),
      permissions: await repo.adminPermissions(user),
    });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error, "加载团队失败") }, { status: errorStatus(error) });
  }
});

export const POST = withApiLogging("admin.teams.create", async function POST(request: Request) {
  try {
    const user = await requireAdminUser();
    const body = await request.json().catch(() => ({}));
    const repo = await getKanbanRepository();
    return NextResponse.json(await repo.createTeam(user, body), { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error, "创建团队失败") }, { status: errorStatus(error) });
  }
});
