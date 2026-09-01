import "server-only";

import fs from "node:fs";
import { getAppVersion, getImageTag } from "@/lib/app-meta";
import { getStorageMode } from "@/db/sql-adapter";
import { getLogConfiguration } from "@/lib/logger";

export type DiagnosticLogEntry = {
  time: string;
  level: string;
  msg: string;
  source?: string;
  requestId?: string;
  path?: string;
  method?: string;
  status?: number;
  durationMs?: number;
  userId?: string;
  username?: string;
  display_name?: string;
  boardId?: string;
  message?: string;
  errorName?: string;
  errorMessage?: string;
  resourceTag?: string;
  resourceUrl?: string;
  url?: string;
  appVersion?: string;
};

export type DiagnosticsSnapshot = {
  appVersion: string;
  imageTag: string;
  databaseType: string;
  logConfig: ReturnType<typeof getLogConfiguration> & {
    appFileExists: boolean;
    appFileSizeBytes: number;
  };
  recentErrors: DiagnosticLogEntry[];
  clientErrors: DiagnosticLogEntry[];
  resourceErrors: DiagnosticLogEntry[];
};

export function getDiagnosticsSnapshot(): DiagnosticsSnapshot {
  const logConfig = getLogConfiguration();
  const appLogFile = logConfig.app.filePath;
  const entries = readRecentLogEntries(appLogFile, 3000);

  return {
    appVersion: getAppVersion(),
    imageTag: getImageTag(),
    databaseType: getStorageMode(),
    logConfig: {
      ...logConfig,
      appFileExists: appLogFile ? fs.existsSync(appLogFile) : false,
      appFileSizeBytes: appLogFile && fs.existsSync(appLogFile) ? fs.statSync(appLogFile).size : 0,
    },
    recentErrors: entries
      .filter((entry) => entry.level === "error" || /failed|crashed|异常|失败/i.test(entry.msg))
      .slice(0, 80),
    clientErrors: entries
      .filter((entry) => entry.msg === "client error reported" || entry.source?.startsWith("early-") || entry.source === "window-error" || entry.source === "unhandledrejection" || entry.source === "error-boundary")
      .slice(0, 80),
    resourceErrors: entries
      .filter((entry) => entry.source === "resource-error")
      .slice(0, 80),
  };
}

function readRecentLogEntries(filePath: string, maxLines: number): DiagnosticLogEntry[] {
  if (!filePath || !fs.existsSync(filePath)) {
    return [];
  }

  const stat = fs.statSync(filePath);
  const maxBytes = 1024 * 1024;
  const start = Math.max(0, stat.size - maxBytes);
  const fd = fs.openSync(filePath, "r");

  try {
    const buffer = Buffer.alloc(stat.size - start);
    fs.readSync(fd, buffer, 0, buffer.length, start);
    return buffer
      .toString("utf8")
      .split("\n")
      .filter(Boolean)
      .slice(-maxLines)
      .map(parseLogLine)
      .filter((entry): entry is DiagnosticLogEntry => Boolean(entry))
      .reverse();
  } finally {
    fs.closeSync(fd);
  }
}

function parseLogLine(line: string): DiagnosticLogEntry | null {
  try {
    const parsed = JSON.parse(line) as Record<string, unknown>;
    return {
      time: stringField(parsed.time),
      level: stringField(parsed.level),
      msg: stringField(parsed.msg),
      source: optionalString(parsed.source),
      requestId: optionalString(parsed.requestId),
      path: optionalString(parsed.path),
      method: optionalString(parsed.method),
      status: optionalNumber(parsed.status),
      durationMs: optionalNumber(parsed.durationMs),
      userId: optionalString(parsed.userId),
      username: optionalString(parsed.username),
      display_name: optionalString(parsed.display_name),
      boardId: optionalString(parsed.boardId),
      message: optionalString(parsed.message),
      errorName: optionalString(parsed.errorName),
      errorMessage: optionalString(parsed.errorMessage),
      resourceTag: optionalString(parsed.resourceTag),
      resourceUrl: optionalString(parsed.resourceUrl),
      url: optionalString(parsed.url),
      appVersion: optionalString(parsed.appVersion),
    };
  } catch {
    return null;
  }
}

function stringField(value: unknown) {
  return typeof value === "string" ? value : "";
}

function optionalString(value: unknown) {
  return typeof value === "string" && value ? value : undefined;
}

function optionalNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}
