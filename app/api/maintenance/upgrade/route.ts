import { spawn } from "node:child_process";
import { NextResponse } from "next/server";
import { withApiLogging } from "@/lib/api-logging";
import { getLogger } from "@/lib/logger";
import { readMaintenanceState } from "@/lib/maintenance";

export const dynamic = "force-dynamic";

type UpgradeRequest = {
  token?: string;
};

const maintenanceLogger = getLogger("maintenance");

export const POST = withApiLogging("maintenance.upgrade", async function POST(request: Request) {
  const configuredToken = process.env.KANBAN_MAINTENANCE_TOKEN;
  if (!configuredToken) {
    return NextResponse.json(
      { error: "未配置 KANBAN_MAINTENANCE_TOKEN，无法执行页面升级" },
      { status: 500 }
    );
  }

  const body = (await request.json().catch(() => ({}))) as UpgradeRequest;
  if (!body.token || body.token !== configuredToken) {
    return NextResponse.json(
      { error: "维护口令错误" },
      { status: 401 }
    );
  }

  const state = await readMaintenanceState();
  if (!state) {
    return NextResponse.json(
      { error: "当前没有待处理的维护升级" },
      { status: 409 }
    );
  }

  if (state.mode === "upgrade_running") {
    return NextResponse.json(
      { error: "已有升级任务正在执行" },
      { status: 409 }
    );
  }

  const child = spawn(process.execPath, ["scripts/run-maintenance-upgrade.mjs"], {
    cwd: process.cwd(),
    env: process.env,
    detached: true,
    stdio: "ignore",
  });

  child.unref();
  maintenanceLogger.warn("maintenance upgrade task started", {
    pid: child.pid,
    databasePath: state.databasePath,
    appVersion: state.appVersion,
  });

  return NextResponse.json(
    {
      ok: true,
      message: "升级任务已启动，请等待状态刷新",
    },
    { status: 202 }
  );
});
