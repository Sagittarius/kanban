import { NextResponse } from "next/server";
import { errorFields, getLogger, withLogContext } from "@/lib/logger";

type ApiHandler<TArgs extends unknown[]> = (request: Request, ...args: TArgs) => Promise<Response>;

const apiLogger = getLogger("api");

export function withApiLogging<TArgs extends unknown[]>(operation: string, handler: ApiHandler<TArgs>) {
  return async function loggedApiHandler(request: Request, ...args: TArgs) {
    const startedAt = performance.now();
    const requestId = request.headers.get("x-request-id") || crypto.randomUUID();
    const url = new URL(request.url);
    const context = {
      requestId,
      operation,
      method: request.method,
      path: url.pathname,
      ip: requestIp(request),
      userAgent: request.headers.get("user-agent") ?? "",
    };

    return withLogContext(context, async () => {
      apiLogger.debug("api request started");
      try {
        throwIfDiagnosticsApiSimulationEnabled(request);
        const response = await handler(request, ...args);
        const durationMs = Math.round(performance.now() - startedAt);
        const fields = { status: response.status, durationMs };
        if (response.status >= 500) {
          apiLogger.error("api request failed", fields);
        } else if (response.status >= 400) {
          apiLogger.warn("api request rejected", fields);
        } else {
          apiLogger.info("api request completed", fields);
        }
        response.headers.set("x-request-id", requestId);
        return response;
      } catch (error) {
        apiLogger.error("api request crashed", {
          status: 500,
          durationMs: Math.round(performance.now() - startedAt),
          ...errorFields(error),
        });
        const response = NextResponse.json({ error: "Internal Server Error", requestId }, { status: 500 });
        response.headers.set("x-request-id", requestId);
        return response;
      }
    });
  };
}

function throwIfDiagnosticsApiSimulationEnabled(request: Request) {
  if (process.env.KANBAN_DIAGNOSTICS_TEST_ENABLED !== "true") {
    return;
  }
  if (request.headers.get("x-kanban-diagnostics-simulate") !== "api-crash") {
    return;
  }
  throw new Error("Simulated diagnostics API crash");
}

export function requestIp(request: Request) {
  const candidates = [
    request.headers.get("x-forwarded-for"),
    request.headers.get("x-real-ip"),
    request.headers.get("cf-connecting-ip"),
    request.headers.get("x-client-ip"),
    request.headers.get("x-forwarded"),
    request.headers.get("forwarded"),
    request.headers.get("true-client-ip"),
  ];

  for (const candidate of candidates) {
    const resolved = normalizeIpCandidate(candidate);
    if (resolved) {
      return resolved;
    }
  }

  const host = request.headers.get("host") ?? "";
  if (host.includes("localhost") || host.includes("127.0.0.1") || host.includes("[::1]")) {
    return "local/direct";
  }

  return "";
}

function normalizeIpCandidate(value: string | null) {
  if (!value) {
    return "";
  }

  const normalized = value.trim();
  if (!normalized) {
    return "";
  }

  if (normalized.toLowerCase().startsWith("for=")) {
    const forwardedFor = normalized
      .split(";")[0]
      ?.replace(/^for=/i, "")
      .replace(/^"/, "")
      .replace(/"$/, "")
      .replace(/^\[/, "")
      .replace(/\]$/, "")
      .trim();
    return forwardedFor || "";
  }

  const first = normalized.split(",")[0]?.trim() ?? "";
  if (!first) {
    return "";
  }

  return first.replace(/^for=/i, "").replace(/^"/, "").replace(/"$/, "");
}
