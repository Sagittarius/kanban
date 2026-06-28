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
          durationMs: Math.round(performance.now() - startedAt),
          ...errorFields(error),
        });
        return NextResponse.json({ error: "Internal Server Error", requestId }, { status: 500 });
      }
    });
  };
}

export function requestIp(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0]?.trim() ?? "";
  }
  return request.headers.get("x-real-ip") ?? "";
}
