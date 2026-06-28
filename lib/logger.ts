import { AsyncLocalStorage } from "node:async_hooks";
import fs from "node:fs";
import path from "node:path";

type LogLevel = "debug" | "info" | "warn" | "error";
type LogFields = Record<string, unknown>;

const levelWeights: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const contextStorage = new AsyncLocalStorage<LogFields>();
const baseBindings = {
  service: "project-kanban-board",
  version: process.env.KANBAN_APP_VERSION ?? process.env.npm_package_version ?? "unknown",
  env: process.env.NODE_ENV ?? "development",
};

const configuredLevel = normalizeLogLevel(process.env.KANBAN_LOG_LEVEL) ?? (process.env.NODE_ENV === "production" ? "info" : "debug");
const fileStream = createFileStream();

export type StructuredLogger = {
  child(bindings: LogFields): StructuredLogger;
  debug(message: string, fields?: LogFields): void;
  info(message: string, fields?: LogFields): void;
  warn(message: string, fields?: LogFields): void;
  error(message: string, fields?: LogFields): void;
};

export const logger = createLogger();

export function getLogger(component: string) {
  return logger.child({ component });
}

export function withLogContext<T>(context: LogFields, callback: () => T): T {
  return contextStorage.run({ ...currentLogContext(), ...context }, callback);
}

export function currentLogContext(): LogFields {
  return contextStorage.getStore() ?? {};
}

export function errorFields(error: unknown): LogFields {
  if (error instanceof Error) {
    return {
      errorName: error.name,
      errorMessage: error.message,
      errorStack: error.stack,
    };
  }
  return { errorMessage: String(error) };
}

function createLogger(bindings: LogFields = {}): StructuredLogger {
  return {
    child(childBindings) {
      return createLogger({ ...bindings, ...childBindings });
    },
    debug(message, fields) {
      writeLog("debug", message, bindings, fields);
    },
    info(message, fields) {
      writeLog("info", message, bindings, fields);
    },
    warn(message, fields) {
      writeLog("warn", message, bindings, fields);
    },
    error(message, fields) {
      writeLog("error", message, bindings, fields);
    },
  };
}

function writeLog(level: LogLevel, message: string, bindings: LogFields, fields: LogFields = {}) {
  if (levelWeights[level] < levelWeights[configuredLevel]) {
    return;
  }

  const payload = sanitize({
    time: new Date().toISOString(),
    level,
    msg: message,
    ...baseBindings,
    ...currentLogContext(),
    ...bindings,
    ...fields,
  });
  const line = `${JSON.stringify(payload)}\n`;

  if (process.env.KANBAN_LOG_CONSOLE !== "false") {
    const writer = level === "error" ? process.stderr : process.stdout;
    writer.write(line);
  }
  if (fileStream) {
    fileStream.write(line);
  }
}

function createFileStream() {
  const configuredFile = process.env.KANBAN_LOG_FILE?.trim();
  const configuredDir = process.env.KANBAN_LOG_DIR?.trim();
  const filePath = configuredFile || (configuredDir ? path.join(configuredDir, "kanban.log") : "");
  if (!filePath) {
    return null;
  }

  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    return fs.createWriteStream(filePath, { flags: "a" });
  } catch (error) {
    process.stderr.write(
      `${JSON.stringify({
        time: new Date().toISOString(),
        level: "error",
        msg: "failed to open log file",
        logFile: filePath,
        ...errorFields(error),
      })}\n`
    );
    return null;
  }
}

function normalizeLogLevel(value: string | undefined): LogLevel | null {
  if (value === "debug" || value === "info" || value === "warn" || value === "error") {
    return value;
  }
  return null;
}

function sanitize(value: unknown): unknown {
  if (value === null || value === undefined) {
    return value;
  }
  if (typeof value === "bigint") {
    return value.toString();
  }
  if (value instanceof Error) {
    return errorFields(value);
  }
  if (Array.isArray(value)) {
    return value.map(sanitize);
  }
  if (typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      if (isSensitiveKey(key)) {
        result[key] = "[redacted]";
      } else {
        result[key] = sanitize(item);
      }
    }
    return result;
  }
  return value;
}

function isSensitiveKey(key: string) {
  const normalized = key.toLowerCase();
  return normalized.includes("password") || normalized.includes("token") || normalized.includes("secret") || normalized.includes("cookie");
}
