import { NextResponse } from "next/server";
import { withApiLogging } from "@/lib/api-logging";
import { getKanbanRepository } from "@/lib/repositories/kanban-repository";
import { errorMessage, errorStatus, requireAdminUser } from "@/lib/server-session";

export const GET = withApiLogging("admin.audit_logs.list", async function GET(request: Request) {
  try {
    const user = await requireAdminUser();
    const url = new URL(request.url);
    const page = Number(url.searchParams.get("page") ?? "1");
    const pageSize = Number(url.searchParams.get("pageSize") ?? "40");
    const query = url.searchParams.get("query") ?? "";
    const repo = await getKanbanRepository();
    const result = await repo.listAuditLogsPage(user, { page, pageSize, query });
    return NextResponse.json({
      auditLogs: result.items,
      total: result.total,
      page: result.page,
      pageSize: result.pageSize,
    });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error, "加载审计日志失败") }, { status: errorStatus(error) });
  }
});
