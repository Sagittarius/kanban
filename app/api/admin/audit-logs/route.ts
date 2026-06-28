import { NextResponse } from "next/server";
import { withApiLogging } from "@/lib/api-logging";
import { getKanbanRepository } from "@/lib/repositories/kanban-repository";
import { errorMessage, errorStatus, requireAdminUser } from "@/lib/server-session";

export const GET = withApiLogging("admin.audit_logs.list", async function GET(request: Request) {
  try {
    const user = await requireAdminUser();
    const url = new URL(request.url);
    const limit = Number(url.searchParams.get("limit") ?? 120);
    const repo = await getKanbanRepository();
    return NextResponse.json({ auditLogs: await repo.listAuditLogs(user, limit) });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error, "加载审计日志失败") }, { status: errorStatus(error) });
  }
});
