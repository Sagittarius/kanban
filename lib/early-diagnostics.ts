export function buildEarlyDiagnosticsScript(appVersion: string) {
  return `
(function () {
  var appVersion = ${JSON.stringify(appVersion)};
  var sessionKey = "kanban_client_session_id";
  var seen = {};

  function createId(prefix) {
    var cryptoApi = window.crypto;
    if (cryptoApi && typeof cryptoApi.randomUUID === "function") {
      return prefix + "_" + cryptoApi.randomUUID();
    }
    return prefix + "_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 10);
  }

  function sessionId() {
    try {
      var existing = window.sessionStorage.getItem(sessionKey);
      if (existing) return existing;
      var next = createId("cs");
      window.sessionStorage.setItem(sessionKey, next);
      return next;
    } catch (error) {
      return createId("cs");
    }
  }

  window.__KANBAN_DIAGNOSTICS__ = {
    appVersion: appVersion,
    clientSessionId: sessionId(),
    pageRequestId: createId("page")
  };

  function context(payload) {
    payload.appVersion = appVersion;
    payload.clientSessionId = window.__KANBAN_DIAGNOSTICS__.clientSessionId;
    payload.requestId = payload.requestId || window.__KANBAN_DIAGNOSTICS__.pageRequestId;
    payload.url = window.location.href;
    payload.route = window.location.pathname + window.location.search;
    payload.referrer = document.referrer || "";
    payload.userAgent = window.navigator.userAgent || "";
    payload.timestamp = new Date().toISOString();
    payload.eventId = payload.eventId || createId("evt");
    return payload;
  }

  function report(payload) {
    var enriched = context(payload);
    var key = [
      enriched.source,
      enriched.message,
      enriched.stack || "",
      enriched.resourceTag || "",
      enriched.resourceUrl || ""
    ].join("|");
    if (seen[key]) return;
    seen[key] = 1;

    try {
      var body = JSON.stringify(enriched);
      if (window.navigator && typeof window.navigator.sendBeacon === "function") {
        var blob = new Blob([body], { type: "application/json" });
        if (window.navigator.sendBeacon("/api/client-errors", blob)) return;
      }
      if (typeof window.fetch === "function") {
        window.fetch("/api/client-errors", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: body,
          keepalive: true
        }).catch(function () {});
      }
    } catch (error) {}
  }

  window.addEventListener("error", function (event) {
    var target = event.target || event.srcElement;
    if (target && target !== window && target.tagName) {
      var tagName = String(target.tagName).toLowerCase();
      if (tagName === "script" || tagName === "link" || tagName === "img") {
        report({
          source: "resource-error",
          message: tagName + " resource failed to load",
          resourceTag: tagName,
          resourceUrl: target.src || target.href || ""
        });
      }
      return;
    }

    report({
      source: "early-window-error",
      message: event.message || "Window error before React startup",
      stack: event.error && event.error.stack ? event.error.stack : "",
      resourceUrl: event.filename || ""
    });
  }, true);

  window.addEventListener("unhandledrejection", function (event) {
    var reason = event.reason;
    report({
      source: "early-unhandledrejection",
      message: reason && reason.message ? reason.message : String(reason || "Unhandled promise rejection before React startup"),
      stack: reason && reason.stack ? reason.stack : ""
    });
  });
})();`;
}
