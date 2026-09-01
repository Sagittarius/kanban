"use client";

import AppErrorPage from "@/components/app-error-page";
import {
  Component,
  useEffect,
  type ErrorInfo,
  type ReactNode,
} from "react";
import KanbanApp from "@/components/kanban-app";
import type { BoardData } from "@/lib/board-data";
import type { ChangelogEntry } from "@/lib/changelog";
import { reportClientError } from "@/lib/client-observability";
import {
  getBrowserCompatErrorIssue,
  getBrowserCompatIssue,
  hasBrowserCompatBypass,
  hasBrowserCompatRecommendationAcknowledged,
  redirectToBrowserUnsupported,
} from "@/lib/browser-compat";

type KanbanRuntimeGuardProps = {
  initialBoard: BoardData;
  todayKey: string;
  appVersion: string;
  changelogEntries: ChangelogEntry[];
  initialThemeId?: string;
  activeBoardId?: string;
};

function redirectIfBrowserCompatIssue(error?: unknown) {
  const skipBrowserNotice =
    hasBrowserCompatBypass() || hasBrowserCompatRecommendationAcknowledged();
  const issue =
    skipBrowserNotice
      ? null
      : getBrowserCompatIssue(window.navigator.userAgent) ??
        (error === undefined ? null : getBrowserCompatErrorIssue(error));
  return redirectToBrowserUnsupported(issue);
}

function RuntimeErrorMonitor({ appVersion, activeBoardId }: { appVersion: string; activeBoardId?: string }) {
  useEffect(() => {
    const route = `${window.location.pathname}${window.location.search}`;
    const onError = (event: ErrorEvent) => {
      if (redirectIfBrowserCompatIssue(event.error ?? event.message)) {
        event.preventDefault();
        return;
      }

      reportClientError({
        source: "window-error",
        message: event.message || "Unknown window error",
        stack: event.error instanceof Error ? event.error.stack : undefined,
        appVersion,
        activeBoardId,
        route,
      });
    };

    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      if (redirectIfBrowserCompatIssue(reason)) {
        event.preventDefault();
        return;
      }

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
        appVersion,
        activeBoardId,
        route,
      });
    };

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onUnhandledRejection);

    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onUnhandledRejection);
    };
  }, [activeBoardId, appVersion]);

  return null;
}

function ErrorFallback() {
  return (
    <AppErrorPage
      title="页面发生异常"
      message="当前界面未能继续稳定渲染。系统已记录错误信息。建议先刷新页面继续操作；如果问题仍然存在，可以直接退出登录后重新进入。"
    />
  );
}

class RuntimeErrorBoundary extends Component<
  { children: ReactNode; appVersion: string; activeBoardId?: string },
  { hasError: boolean; redirecting: boolean }
> {
  state = { hasError: false, redirecting: false };

  static getDerivedStateFromError(error: Error) {
    const skipBrowserNotice =
      typeof window !== "undefined" &&
      (hasBrowserCompatBypass() || hasBrowserCompatRecommendationAcknowledged());
    if (
      typeof window !== "undefined" &&
      !skipBrowserNotice &&
      (getBrowserCompatIssue(window.navigator.userAgent) ||
        getBrowserCompatErrorIssue(error))
    ) {
      return { hasError: false, redirecting: true };
    }
    return { hasError: true, redirecting: false };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    if (redirectIfBrowserCompatIssue(error)) {
      return;
    }

    reportClientError({
      source: "error-boundary",
      message: error.message || "Unknown render error",
      stack: error.stack,
      componentStack: errorInfo.componentStack ?? undefined,
      appVersion: this.props.appVersion,
      activeBoardId: this.props.activeBoardId,
      route: `${window.location.pathname}${window.location.search}`,
    });
  }

  render() {
    if (this.state.redirecting) {
      return null;
    }

    if (this.state.hasError) {
      return <ErrorFallback />;
    }

    return this.props.children;
  }
}

export default function KanbanRuntimeGuard({
  initialBoard,
  todayKey,
  appVersion,
  changelogEntries,
  initialThemeId,
  activeBoardId,
}: KanbanRuntimeGuardProps) {
  return (
    <RuntimeErrorBoundary appVersion={appVersion} activeBoardId={activeBoardId} >
      <RuntimeErrorMonitor appVersion={appVersion} activeBoardId={activeBoardId} />
      <KanbanApp
        initialBoard={initialBoard}
        todayKey={todayKey}
        appVersion={appVersion}
        changelogEntries={changelogEntries}
        initialThemeId={initialThemeId}
      />
    </RuntimeErrorBoundary>
  );
}
