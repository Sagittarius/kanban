"use client";

type ClientErrorSource =
  | "error-boundary"
  | "window-error"
  | "unhandledrejection"
  | "early-window-error"
  | "early-unhandledrejection"
  | "resource-error"
  | "api-response"
  | "api-network"
  | "dashboard-refresh"
  | "dashboard-particles"
  | "login-orb";

type ClientErrorPayload = {
  source: ClientErrorSource;
  message: string;
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

type ClientFetchLogOptions = {
  operation?: string;
  reportStatuses?: "server" | "all" | "none";
};

const reportedErrors = new Map<string, number>();
const clientSessionStorageKey = "kanban_client_session_id";
const sessionExpiredStorageKey = "kanban_session_expired";
const sessionExpiredNoticeId = "kanban-session-expired-notice";
let sessionExpiryRedirecting = false;

export function reportClientError(payload: ClientErrorPayload) {
  if (typeof window === "undefined") {
    return;
  }

  const enriched = enrichClientErrorPayload(payload);
  const key = errorKey(enriched);
  const now = Date.now();
  const last = reportedErrors.get(key);

  if (last && now - last < 5000) {
    return;
  }

  reportedErrors.set(key, now);

  if (reportedErrors.size > 100) {
    const entries = Array.from(reportedErrors.entries()).sort((left, right) => left[1] - right[1]);
    entries.slice(0, 20).forEach(([entryKey]) => reportedErrors.delete(entryKey));
  }

  void fetch("/api/client-errors", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-client-event-id": enriched.eventId ?? "",
      "x-client-session-id": enriched.clientSessionId ?? "",
    },
    body: JSON.stringify(enriched),
    keepalive: true,
  }).catch(() => {
    console.error("[kanban] failed to report client error", enriched);
  });
}

export async function clientFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
  logOptions: ClientFetchLogOptions = {}
) {
  const startedAt = performance.now();
  const requestId = createId("req");
  const headers = new Headers(init.headers);

  if (!headers.has("x-request-id")) {
    headers.set("x-request-id", requestId);
  }
  if (!headers.has("x-client-session-id")) {
    headers.set("x-client-session-id", getClientSessionId());
  }

  const method = (init.method ?? "GET").toUpperCase();
  const endpoint = endpointFromInput(input);

  try {
    const response = await fetch(input, { ...init, headers });
    const durationMs = Math.round(performance.now() - startedAt);
    const responseRequestId = response.headers.get("x-request-id") ?? headers.get("x-request-id") ?? requestId;

    if (response.status === 401 && shouldHandleSessionExpiry(endpoint)) {
      handleSessionExpiry();
    }

    if (shouldReportResponse(response.status, logOptions.reportStatuses ?? "server")) {
      reportClientError({
        source: "api-response",
        message: `API ${method} ${endpoint} returned ${response.status}`,
        operation: logOptions.operation,
        endpoint,
        method,
        status: response.status,
        statusText: response.statusText,
        requestId: headers.get("x-request-id") ?? requestId,
        responseRequestId,
        durationMs,
      });
    }

    return response;
  } catch (error) {
    if (isAbortError(error)) {
      throw error;
    }

    reportClientError({
      source: "api-network",
      message: error instanceof Error ? error.message : `API ${method} ${endpoint} request failed`,
      stack: error instanceof Error ? error.stack : undefined,
      operation: logOptions.operation,
      endpoint,
      method,
      requestId: headers.get("x-request-id") ?? requestId,
      durationMs: Math.round(performance.now() - startedAt),
    });
    throw error;
  }
}

function shouldHandleSessionExpiry(endpoint: string) {
  const pathname = endpointPathname(endpoint);
  return pathname !== "/api/auth/login" && pathname !== "/api/auth/logout" && pathname !== "/api/client-errors";
}

function endpointPathname(endpoint: string) {
  try {
    return new URL(endpoint, window.location.origin).pathname;
  } catch {
    return endpoint.split("?")[0];
  }
}

function handleSessionExpiry() {
  if (sessionExpiryRedirecting || typeof window === "undefined") {
    return;
  }
  sessionExpiryRedirecting = true;

  try {
    window.sessionStorage.setItem(sessionExpiredStorageKey, "true");
  } catch {
    // Storage may be disabled. The in-page notice still provides feedback.
  }

  let notice = document.getElementById(sessionExpiredNoticeId);
  if (!notice) {
    notice = document.createElement("div");
    notice.id = sessionExpiredNoticeId;
    notice.setAttribute("role", "alert");
    notice.textContent = "登录超时，请重新登录";
    Object.assign(notice.style, {
      position: "fixed",
      left: "50%",
      top: "24px",
      zIndex: "2147483647",
      transform: "translateX(-50%)",
      border: "1px solid rgba(248, 113, 113, 0.48)",
      borderRadius: "12px",
      background: "#fff1f2",
      color: "#be123c",
      padding: "12px 18px",
      fontSize: "14px",
      fontWeight: "600",
      lineHeight: "20px",
      boxShadow: "0 18px 48px rgba(15, 23, 42, 0.22)",
    });
    document.body.appendChild(notice);
  }

  window.setTimeout(() => {
    window.location.assign("/");
  }, 900);
}

export function consumeSessionExpiredNotice() {
  if (typeof window === "undefined") {
    return false;
  }
  try {
    const expired = window.sessionStorage.getItem(sessionExpiredStorageKey) === "true";
    if (expired) {
      window.sessionStorage.removeItem(sessionExpiredStorageKey);
    }
    return expired;
  } catch {
    return false;
  }
}

function shouldReportResponse(status: number, mode: ClientFetchLogOptions["reportStatuses"]) {
  if (mode === "none") {
    return false;
  }
  if (mode === "all") {
    return status >= 400;
  }
  return status >= 500;
}

function enrichClientErrorPayload(payload: ClientErrorPayload): ClientErrorPayload {
  const context = clientContext();
  return {
    ...context,
    ...payload,
    appVersion: payload.appVersion ?? context.appVersion,
    requestId: payload.requestId ?? context.requestId,
    eventId: payload.eventId ?? createId("evt"),
    clientSessionId: payload.clientSessionId ?? getClientSessionId(),
    timestamp: payload.timestamp ?? new Date().toISOString(),
  };
}

function clientContext() {
  const diagnostics = windowDiagnostics();
  return {
    url: window.location.href,
    route: `${window.location.pathname}${window.location.search}`,
    referrer: document.referrer,
    userAgent: window.navigator.userAgent,
    language: window.navigator.language,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    viewport: `${window.innerWidth}x${window.innerHeight}`,
    screen: `${window.screen.width}x${window.screen.height}`,
    devicePixelRatio: window.devicePixelRatio,
    online: window.navigator.onLine,
    visibilityState: document.visibilityState,
    appVersion: diagnostics.appVersion,
    requestId: diagnostics.pageRequestId,
  };
}

function getClientSessionId() {
  const diagnostics = windowDiagnostics();
  if (diagnostics.clientSessionId) {
    return diagnostics.clientSessionId;
  }

  try {
    const existing = window.sessionStorage.getItem(clientSessionStorageKey);
    if (existing) {
      return existing;
    }

    const next = createId("cs");
    window.sessionStorage.setItem(clientSessionStorageKey, next);
    return next;
  } catch {
    return createId("cs");
  }
}

function windowDiagnostics(): { appVersion?: string; clientSessionId?: string; pageRequestId?: string } {
  const diagnostics = (window as unknown as {
    __KANBAN_DIAGNOSTICS__?: { appVersion?: string; clientSessionId?: string; pageRequestId?: string };
  }).__KANBAN_DIAGNOSTICS__;
  return diagnostics ?? {};
}

function createId(prefix: string) {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi && "randomUUID" in cryptoApi && typeof cryptoApi.randomUUID === "function") {
    return `${prefix}_${cryptoApi.randomUUID()}`;
  }

  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function errorKey(payload: ClientErrorPayload) {
  return [
    payload.source,
    payload.message,
    payload.stack ?? "",
    payload.componentStack ?? "",
    payload.url ?? "",
    payload.operation ?? "",
    payload.endpoint ?? "",
    payload.status ?? "",
  ].join("|");
}

function endpointFromInput(input: RequestInfo | URL) {
  if (typeof input === "string") {
    return input;
  }
  if (input instanceof URL) {
    return input.toString();
  }
  return input.url;
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}
