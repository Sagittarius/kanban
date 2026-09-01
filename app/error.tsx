"use client";

import { useEffect } from "react";
import AppErrorPage from "@/components/app-error-page";
import {
  getBrowserCompatErrorIssue,
  getBrowserCompatIssue,
  hasBrowserCompatBypass,
  hasBrowserCompatRecommendationAcknowledged,
  redirectToBrowserUnsupported,
} from "@/lib/browser-compat";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
  }) {
  const skipBrowserNotice =
    hasBrowserCompatBypass() || hasBrowserCompatRecommendationAcknowledged();
  const compatIssue =
    skipBrowserNotice
      ? null
      : getBrowserCompatIssue() ?? getBrowserCompatErrorIssue(error);

  useEffect(() => {
    if (compatIssue) {
      redirectToBrowserUnsupported(compatIssue);
    }
  }, [compatIssue]);

  if (compatIssue) {
    return null;
  }

  return <AppErrorPage title="页面发生异常" message="当前页面遇到了未处理的错误。你可以刷新页面重试，或者退出登录后切换到其他账号。" detail={error.message} onRetry={reset} />;
}
