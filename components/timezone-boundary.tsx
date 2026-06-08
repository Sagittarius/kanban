"use client";

import { useEffect, type ReactNode } from "react";

declare global {
  interface Window {
    __KANBAN_USER_TIMEZONE__?: string;
    __KANBAN_TIMEZONE_PATCHED__?: boolean;
  }
}

export default function TimezoneBoundary({ timezone, children }: { timezone: string; children: ReactNode }) {
  useEffect(() => {
    window.__KANBAN_USER_TIMEZONE__ = timezone || "Asia/Shanghai";
    if (window.__KANBAN_TIMEZONE_PATCHED__) return;
    const OriginalDateTimeFormat = Intl.DateTimeFormat;
    const patchedDateTimeFormat = function patchedDateTimeFormat(locales?: Intl.LocalesArgument, options?: Intl.DateTimeFormatOptions) {
      const nextOptions = options && options.timeZone === "Asia/Shanghai"
        ? { ...options, timeZone: window.__KANBAN_USER_TIMEZONE__ || "Asia/Shanghai" }
        : options;
      return new OriginalDateTimeFormat(locales, nextOptions);
    } as typeof Intl.DateTimeFormat;
    (patchedDateTimeFormat as typeof Intl.DateTimeFormat & { supportedLocalesOf: typeof Intl.DateTimeFormat.supportedLocalesOf }).supportedLocalesOf = OriginalDateTimeFormat.supportedLocalesOf.bind(OriginalDateTimeFormat);
    (Intl as unknown as { DateTimeFormat: typeof Intl.DateTimeFormat }).DateTimeFormat = patchedDateTimeFormat;
    window.__KANBAN_TIMEZONE_PATCHED__ = true;
  }, [timezone]);

  return <>{children}</>;
}
