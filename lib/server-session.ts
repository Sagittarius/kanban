import { cookies } from "next/headers";
import { ACTIVE_BOARD_COOKIE, SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { isAuthFeatureEnabled } from "@/lib/auth-feature";
import type { BoardSummary, CurrentUser } from "@/lib/auth-models";
import { getKanbanRepository } from "@/lib/repositories/kanban-repository";

export async function getOptionalSessionUser(): Promise<CurrentUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  const session = await verifySessionToken(token);
  if (!session) {
    return null;
  }

  const repo = await getKanbanRepository();
  return repo.getUserById(session.userId);
}

export async function requireSessionUser(): Promise<CurrentUser> {
  if (!isAuthFeatureEnabled()) {
    const repo = await getKanbanRepository();
    return repo.getBootstrapUser();
  }
  const user = await getOptionalSessionUser();
  if (!user) {
    throw new Error("Unauthorized");
  }
  return user;
}

export async function requireSuperAdminUser(): Promise<CurrentUser> {
  const user = await requireSessionUser();
  if (user.role !== "super_admin") {
    throw new Error("Forbidden");
  }
  return user;
}

export async function requireAdminUser(): Promise<CurrentUser> {
  const user = await requireSessionUser();
  if (user.role !== "super_admin" && user.role !== "project_manager" && user.role !== "development_manager") {
    throw new Error("Forbidden");
  }
  return user;
}

export async function resolveActiveBoard(user: CurrentUser): Promise<BoardSummary> {
  const repo = await getKanbanRepository();
  if (!isAuthFeatureEnabled()) {
    return repo.resolvePublicBoard(user);
  }
  const cookieStore = await cookies();
  const requested = cookieStore.get(ACTIVE_BOARD_COOKIE)?.value ?? null;
  return repo.resolveBoardForUser(user, requested);
}

export async function requireActiveBoardContext() {
  const user = await requireSessionUser();
  const board = await resolveActiveBoard(user);
  return { user, board };
}

export function errorStatus(error: unknown) {
  const message = error instanceof Error ? error.message : "Request failed";
  if (message === "Unauthorized") return 401;
  if (message === "Forbidden") return 403;
  if (message.endsWith("not found") || message.endsWith("Not found") || message.endsWith("不存在")) return 404;
  if (
    message === "Username already exists" ||
    message.includes("Username must contain") ||
    message.includes("required") ||
    message.includes("At least one") ||
    message.includes("请选择") ||
    message.includes("不能为空") ||
    message.includes("不属于") ||
    message.includes("至少")
  ) {
    return 400;
  }
  return 500;
}

export function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}
