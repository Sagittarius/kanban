import { NextResponse } from "next/server";

type ClientErrorRequest = {
  source?: string;
  message?: string;
  stack?: string;
  componentStack?: string;
  url?: string;
  userAgent?: string;
  timestamp?: string;
};

export async function POST(request: Request) {
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
    };

    console.error("[kanban][client-error]", JSON.stringify(payload));
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to record client error";

    return NextResponse.json(
      { ok: false, error: message },
      { status: 400 }
    );
  }
}
