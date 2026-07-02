import { NextResponse } from "next/server";
import { withApiLogging } from "@/lib/api-logging";
import { getLogger } from "@/lib/logger";

const clientErrorLogger = getLogger("client-error");

type ClientErrorRequest = {
  source?: string;
  message?: string;
  stack?: string;
  componentStack?: string;
  url?: string;
  userAgent?: string;
  timestamp?: string;
  appVersion?: string;
  eventId?: string;
  clientSessionId?: string;
  route?: string;
  referrer?: string;
  language?: string;
  timezone?: string;
  viewport?: string;
  screen?: string;
  devicePixelRatio?: number;
  online?: boolean;
  visibilityState?: string;
  operation?: string;
  endpoint?: string;
  method?: string;
  status?: number;
  statusText?: string;
  requestId?: string;
  responseRequestId?: string;
  durationMs?: number;
  resourceTag?: string;
  resourceUrl?: string;
  activeBoardId?: string;
};

export const POST = withApiLogging("client.error", async function POST(request: Request) {
  try {
    const body = (await request.json()) as ClientErrorRequest;
    const payload = {
      source: body.source ?? "unknown",
      message: body.message ?? "Unknown client error",
      stack: body.stack ?? "",
      componentStack: body.componentStack ?? "",
      url: body.url ?? "",
      userAgent: body.userAgent ?? "",
      timestamp: body.timestamp ?? new Date().toISOString(),
      appVersion: body.appVersion ?? "",
      eventId: body.eventId ?? request.headers.get("x-client-event-id") ?? "",
      clientSessionId: body.clientSessionId ?? request.headers.get("x-client-session-id") ?? "",
      route: body.route ?? "",
      referrer: body.referrer ?? "",
      language: body.language ?? "",
      timezone: body.timezone ?? "",
      viewport: body.viewport ?? "",
      screen: body.screen ?? "",
      devicePixelRatio: body.devicePixelRatio ?? null,
      online: body.online ?? null,
      visibilityState: body.visibilityState ?? "",
      operation: body.operation ?? "",
      endpoint: body.endpoint ?? "",
      method: body.method ?? "",
      status: body.status ?? null,
      statusText: body.statusText ?? "",
      requestId: body.requestId ?? "",
      frontendRequestId: body.requestId ?? "",
      apiRequestId: body.responseRequestId ?? "",
      durationMs: body.durationMs ?? null,
      resourceTag: body.resourceTag ?? "",
      resourceUrl: body.resourceUrl ?? "",
      activeBoardId: body.activeBoardId ?? "",
    };

    clientErrorLogger.error("client error reported", payload);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to record client error";

    return NextResponse.json(
      { ok: false, error: message },
      { status: 400 }
    );
  }
});
