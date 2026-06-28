import { AsyncLocalStorage } from "node:async_hooks";
import fs from "node:fs";
import path from "node:path";

type LogLevel = "debug" | "info" | "warn" | "error";
type LogFields = Record<string, unknown>;
type FileLogSink = {
  write(line: string): void;
};

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
let fileSink: FileLogSink | null | undefined;

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
  const sink = getFileSink();
  if (sink) {
    sink.write(line);
  }
}

function getFileSink() {
  if (fileSink === undefined) {
    fileSink = createFileSink();
  }
  return fileSink;
}

function createFileSink(): FileLogSink | null {
  if (process.env.KANBAN_LOG_FILE_ENABLED === "false") {
    return null;
  }

  const configuredFile = process.env.KANBAN_LOG_FILE?.trim();
  const configuredDir = process.env.KANBAN_LOG_DIR?.trim();
  const filePath = configuredFile || (configuredDir ? path.join(configuredDir, "kanban.log") : "");
  if (!filePath) {
    return null;
  }

  try {
    return new RotatingFileLogSink(filePath, {
      maxBytes: readOptionalPositiveNumber(process.env.KANBAN_LOG_MAX_SIZE_MB, 50) * 1024 * 1024,
      maxFiles: readOptionalPositiveInteger(process.env.KANBAN_LOG_MAX_FILES, 10),
      retentionMs: readOptionalPositiveNumber(process.env.KANBAN_LOG_RETENTION_DAYS, 30) * 24 * 60 * 60 * 1000,
    });
  } catch (error) {
    writeInternalLoggerError("failed to open log file", filePath, error);
    return null;
  }
}

class RotatingFileLogSink implements FileLogSink {
  private readonly filePath: string;
  private readonly options: { maxBytes: number; maxFiles: number; retentionMs: number };
  private currentSize = 0;

  constructor(filePath: string, options: { maxBytes: number; maxFiles: number; retentionMs: number }) {
    this.filePath = filePath;
    this.options = options;
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    this.currentSize = getFileSize(filePath);
    this.cleanupRotatedFiles();
  }

  write(line: string) {
    const lineSize = Buffer.byteLength(line);
    if (this.options.maxBytes > 0 && this.currentSize > 0 && this.currentSize + lineSize > this.options.maxBytes) {
      this.rotate();
    }

    try {
      fs.appendFileSync(this.filePath, line);
      this.currentSize += lineSize;
    } catch (error) {
      writeInternalLoggerError("failed to write log file", this.filePath, error);
    }
  }

  private rotate() {
    try {
      if (fs.existsSync(this.filePath) && this.currentSize > 0) {
        fs.renameSync(this.filePath, this.nextRotatedFilePath());
      }
    } catch (error) {
      writeInternalLoggerError("failed to rotate log file", this.filePath, error);
    }

    this.currentSize = 0;
    this.cleanupRotatedFiles();
  }

  private nextRotatedFilePath() {
    const parsed = path.parse(this.filePath);
    const timestamp = new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");
    let candidate = path.join(parsed.dir, `${parsed.name}.${timestamp}${parsed.ext}`);
    let index = 1;

    while (fs.existsSync(candidate)) {
      candidate = path.join(parsed.dir, `${parsed.name}.${timestamp}.${index}${parsed.ext}`);
      index += 1;
    }

    return candidate;
  }

  private cleanupRotatedFiles() {
    const parsed = path.parse(this.filePath);
    const currentFileName = path.basename(this.filePath);
    const rotatedFiles = listRotatedFiles(parsed.dir, parsed.name, parsed.ext, currentFileName);
    const now = Date.now();

    rotatedFiles.forEach((file, index) => {
      const exceedsFileLimit = this.options.maxFiles > 0 && index >= this.options.maxFiles;
      const exceedsRetention = this.options.retentionMs > 0 && now - file.mtimeMs > this.options.retentionMs;
      if (!exceedsFileLimit && !exceedsRetention) {
        return;
      }

      try {
        fs.rmSync(file.path, { force: true });
      } catch (error) {
        writeInternalLoggerError("failed to cleanup rotated log file", file.path, error);
      }
    });
  }
}

function listRotatedFiles(dir: string, baseName: string, ext: string, currentFileName: string) {
  try {
    return fs
      .readdirSync(dir)
      .filter((fileName) => fileName !== currentFileName && fileName.startsWith(`${baseName}.`) && (ext ? fileName.endsWith(ext) : true))
      .map((fileName) => {
        const filePath = path.join(dir, fileName);
        const stat = fs.statSync(filePath);
        return { path: filePath, mtimeMs: stat.mtimeMs };
      })
      .filter((file) => fs.statSync(file.path).isFile())
      .sort((left, right) => right.mtimeMs - left.mtimeMs);
  } catch (error) {
    writeInternalLoggerError("failed to list rotated log files", dir, error);
    return [];
  }
}

function getFileSize(filePath: string) {
  try {
    return fs.statSync(filePath).size;
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return 0;
    }
    throw error;
  }
}

function readOptionalPositiveNumber(value: string | undefined, fallback: number) {
  if (value === undefined || value.trim() === "") {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function readOptionalPositiveInteger(value: string | undefined, fallback: number) {
  return Math.floor(readOptionalPositiveNumber(value, fallback));
}

function writeInternalLoggerError(message: string, logFile: string, error: unknown) {
  process.stderr.write(
    `${JSON.stringify({
      time: new Date().toISOString(),
      level: "error",
      msg: message,
      logFile,
      ...errorFields(error),
    })}\n`
  );
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
