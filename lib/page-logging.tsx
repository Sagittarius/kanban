import "server-only";

import type { ReactNode } from "react";
import { headers } from "next/headers";
import AppErrorPage from "@/components/app-error-page";
import { errorFields, getLogger, withLogContext, type StructuredLogger } from "@/lib/logger";

type PageContextFields = {
  userId?: string;
  boardId?: string;
  [key: string]: unknown;
};

type PageLoggingContext = {
  requestId: string;
  path: string;
  logger: StructuredLogger;
  setContext(fields: PageContextFields): void;
};

type PageRenderFallback = (error: unknown, context: PageLoggingContext) => ReactNode;

const pageLogger = getLogger("page-render");

export async function withPageLogging(
  path: string,
  render: (context: PageLoggingContext) => Promise<ReactNode>,
  fallback?: PageRenderFallback
) {
  const startedAt = performance.now();
  const headerStore = await headers();
  const requestId = headerStore.get("x-request-id") || crypto.randomUUID();
  const contextFields: PageContextFields = {};
  const baseContext = {
    requestId,
    path,
    userAgent: headerStore.get("user-agent") ?? "",
    ip:
      headerStore.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      headerStore.get("x-real-ip") ||
      headerStore.get("cf-connecting-ip") ||
      "",
  };

  const context: PageLoggingContext = {
    requestId,
    path,
    logger: pageLogger.child({ path }),
    setContext(fields) {
      Object.assign(contextFields, fields);
    },
  };

  return withLogContext(baseContext, async () => {
    try {
      if (process.env.KANBAN_DIAGNOSTICS_TEST_ENABLED === "true" && headerStore.get("x-kanban-diagnostics-simulate") === "page-crash") {
        throw new Error("Simulated diagnostics page render crash");
      }
      const result = await render(context);
      pageLogger.info("page render completed", {
        ...contextFields,
        durationMs: Math.round(performance.now() - startedAt),
      });
      return result;
    } catch (error) {
      logPageRenderError(error, {
        ...baseContext,
        ...contextFields,
        durationMs: Math.round(performance.now() - startedAt),
      });

      if (fallback) {
        return fallback(error, context);
      }

      return (
        <AppErrorPage
          title="页面加载失败"
          message="系统已记录本次异常。请刷新页面重试，或将 Request ID 提供给管理员定位问题。"
          detail={error instanceof Error ? error.message : "服务端渲染异常"}
          requestId={requestId}
        />
      );
    }
  });
}

export function logPageRenderError(error: unknown, fields: PageContextFields) {
  pageLogger.error("page render failed", {
    ...fields,
    ...errorFields(error),
  });
}
