"use client";

import {
  AlertTriangle,
  RefreshCw,
} from "lucide-react";
import {
  Component,
  useEffect,
  type ErrorInfo,
  type ReactNode,
} from "react";
import KanbanApp from "@/components/kanban-app";
import type { BoardData } from "@/lib/board-data";

type ErrorSource =
  | "error-boundary"
  | "window-error"
  | "unhandledrejection";

type ClientErrorPayload = {
  source: ErrorSource;
  message: string;
  stack?: string;
  componentStack?: string;
  url: string;
  userAgent: string;
  timestamp: string;
};

type KanbanRuntimeGuardProps = {
  initialBoard: BoardData;
  todayKey: string;
};

const reportedErrors = new Map<string, number>();

function errorKey(payload: ClientErrorPayload) {
  return [
    payload.source,
    payload.message,
    payload.stack ?? "",
    payload.componentStack ?? "",
    payload.url,
  ].join("|");
}

function reportClientError(payload: ClientErrorPayload) {
  const key = errorKey(payload);
  const now = Date.now();
  const last = reportedErrors.get(key);

  if (last && now - last < 5000) {
    return;
  }

  reportedErrors.set(key, now);

  if (reportedErrors.size > 100) {
    const entries = [...reportedErrors.entries()].sort((left, right) => left[1] - right[1]);
    entries.slice(0, 20).forEach(([entryKey]) => reportedErrors.delete(entryKey));
  }

  void fetch("/api/client-errors", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
    keepalive: true,
  }).catch(() => {
    console.error("[kanban] failed to report client error", payload);
  });
}

function payloadBase() {
  return {
    url: window.location.href,
    userAgent: window.navigator.userAgent,
    timestamp: new Date().toISOString(),
  };
}

function RuntimeErrorMonitor() {
  useEffect(() => {
    const onError = (event: ErrorEvent) => {
      reportClientError({
        source: "window-error",
        message: event.message || "Unknown window error",
        stack: event.error instanceof Error ? event.error.stack : undefined,
        ...payloadBase(),
      });
    };

    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      const message =
        reason instanceof Error
          ? reason.message
          : typeof reason === "string"
            ? reason
            : "Unhandled promise rejection";

      reportClientError({
        source: "unhandledrejection",
        message,
        stack: reason instanceof Error ? reason.stack : undefined,
        ...payloadBase(),
      });
    };

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onUnhandledRejection);

    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onUnhandledRejection);
    };
  }, []);

  return null;
}

function ErrorFallback() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--bg)] px-6 py-10 text-[var(--text)]">
      <section className="w-full max-w-xl rounded-xl border border-[var(--danger)] bg-[var(--panel)] p-8 shadow-sm">
        <div className="flex items-start gap-4">
          <div className="rounded-lg bg-[var(--danger-soft)] p-3 text-[var(--danger)]">
            <AlertTriangle size={22} />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-semibold">页面发生异常</h1>
            <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
              当前界面未能继续稳定渲染。系统已记录错误信息。建议刷新页面后继续操作，避免在当前状态下继续拖拽。
            </p>
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="inline-flex items-center gap-2 rounded-md border border-[var(--text)] bg-[var(--text)] px-4 py-2 text-sm font-medium text-[var(--panel)] transition hover:opacity-90"
              >
                <RefreshCw size={15} />
                刷新页面
              </button>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

class RuntimeErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    reportClientError({
      source: "error-boundary",
      message: error.message || "Unknown render error",
      stack: error.stack,
      componentStack: errorInfo.componentStack ?? undefined,
      ...payloadBase(),
    });
  }

  render() {
    if (this.state.hasError) {
      return <ErrorFallback />;
    }

    return this.props.children;
  }
}

export default function KanbanRuntimeGuard({
  initialBoard,
  todayKey,
}: KanbanRuntimeGuardProps) {
  return (
    <RuntimeErrorBoundary>
      <RuntimeErrorMonitor />
      <KanbanApp initialBoard={initialBoard} todayKey={todayKey} />
    </RuntimeErrorBoundary>
  );
}
