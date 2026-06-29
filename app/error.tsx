"use client";

import AppErrorPage from "@/components/app-error-page";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
  }) {
  return <AppErrorPage title="页面发生异常" message="当前页面遇到了未处理的错误。你可以刷新页面重试，或者退出登录后切换到其他账号。" detail={error.message} onRetry={reset} />;
}
