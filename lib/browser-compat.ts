export const browserCompatPolicy = {
  baselineLabel: "Chrome 89+ / Edge 89+ / Firefox 90+ / Safari 15+",
  recommendedLabel: "Chrome/Edge 109+ / Firefox 115+ / Safari 16.4+",
  unsupportedPagePath: "/browser-unsupported.html",
  demoQueryKey: "compat_demo",
  bypassQueryKey: "compat_bypass",
  recommendedAckKey: "kanban_browser_recommended_ack",
  noticeAckKey: "kanban_browser_notice_ack",
  readyEvent: "kanban:compat-ready",
  startupWindowMs: 12000,
} as const;

export type BrowserCompatMode = "unsupported" | "recommended";

export type BrowserCompatIssue = {
  reason: string;
  detail: string;
  mode?: BrowserCompatMode;
};

const compatibilityPatterns: Array<{ code: string; pattern: RegExp }> = [
  { code: "missing-object-hasown", pattern: /Object\.hasOwn.*not a function/i },
  { code: "missing-array-helpers", pattern: /(?:flat|at).*not a function/i },
  { code: "missing-string-replaceall", pattern: /replaceAll.*not a function/i },
  { code: "missing-fetch", pattern: /\bfetch\b.*(?:undefined|not a function|not defined)/i },
  { code: "missing-abort-controller", pattern: /AbortController.*(?:undefined|not defined)/i },
  { code: "missing-urlsearchparams", pattern: /URLSearchParams.*(?:undefined|not defined)/i },
  { code: "missing-promise", pattern: /Promise.*(?:undefined|not defined)/i },
  { code: "missing-symbol", pattern: /Symbol.*(?:undefined|not defined)/i },
  { code: "missing-weakmap", pattern: /WeakMap.*(?:undefined|not defined)/i },
  { code: "unsupported-import-meta", pattern: /import\.meta/i },
  { code: "unsupported-import-syntax", pattern: /Cannot use import statement|Unexpected token '?(?:import|export)'?/i },
  { code: "unsupported-dynamic-import", pattern: /Unexpected token.*import\(|Unexpected identifier.*import/i },
  { code: "unsupported-optional-chaining", pattern: /Unexpected token.*\?\.|Unexpected token '\?\.'/i },
  { code: "unsupported-nullish-coalescing", pattern: /Unexpected token.*\?\?|Unexpected token '\?\?'/i },
  { code: "unsupported-private-field", pattern: /Unexpected character '#'?|Unexpected token '#'/i },
];

type ParsedBrowserVersion = {
  major: number;
  minor: number;
};

function browserVersion(userAgent: string, pattern: RegExp): ParsedBrowserVersion | null {
  const match = userAgent.match(pattern);
  if (!match?.[1]) {
    return null;
  }
  return {
    major: Number.parseInt(match[1], 10),
    minor: match[2] ? Number.parseInt(match[2], 10) : 0,
  };
}

function versionText(version: ParsedBrowserVersion) {
  return version.minor ? `${version.major}.${version.minor}` : `${version.major}`;
}

function versionAtLeast(version: ParsedBrowserVersion, minimumMajor: number, minimumMinor = 0) {
  return version.major > minimumMajor || (version.major === minimumMajor && version.minor >= minimumMinor);
}

function versionIssue(
  browser: string,
  version: ParsedBrowserVersion,
  minimumMajor: number,
  reason: string,
  mode: BrowserCompatMode,
  label: string,
  minimumMinor = 0
): BrowserCompatIssue | null {
  if (versionAtLeast(version, minimumMajor, minimumMinor)) {
    return null;
  }
  const minimum = minimumMinor ? `${minimumMajor}.${minimumMinor}` : `${minimumMajor}`;
  return {
    reason,
    detail: `${browser} ${versionText(version)} 低于${label} ${minimum}`,
    mode,
  };
}

export function getBrowserCompatIssue(
  userAgent?: string,
  options: { includeRecommended?: boolean } = {}
): BrowserCompatIssue | null {
  const ua = userAgent ?? (typeof navigator === "undefined" ? "" : navigator.userAgent);
  const includeRecommended = options.includeRecommended ?? true;
  if (!ua) {
    return null;
  }

  if (/MSIE\s|Trident\//i.test(ua)) {
    return { reason: "internet-explorer", detail: "Internet Explorer 不在支持范围内" };
  }

  const legacyEdge = browserVersion(ua, /Edge\/(\d+)/i);
  if (legacyEdge !== null) {
    return { reason: "legacy-edge", detail: `EdgeHTML ${versionText(legacyEdge)} 不在支持范围内` };
  }

  const edge = browserVersion(ua, /Edg\/(\d+)/i);
  if (edge !== null) {
    return (
      versionIssue("Edge", edge, 89, "edge-version-too-low", "unsupported", "最低支持版本") ??
      (includeRecommended
        ? versionIssue("Edge", edge, 109, "edge-version-recommended", "recommended", "推荐版本")
        : null)
    );
  }

  const firefox = browserVersion(ua, /Firefox\/(\d+)/i);
  if (firefox !== null) {
    return (
      versionIssue("Firefox", firefox, 90, "firefox-version-too-low", "unsupported", "最低支持版本") ??
      (includeRecommended
        ? versionIssue("Firefox", firefox, 115, "firefox-version-recommended", "recommended", "推荐版本")
        : null)
    );
  }

  const chrome = browserVersion(ua, /(?:Chrome|Chromium)\/(\d+)/i);
  if (chrome !== null && !/(?:OPR|Edg)\//i.test(ua)) {
    return (
      versionIssue("Chrome", chrome, 89, "chrome-version-too-low", "unsupported", "最低支持版本") ??
      (includeRecommended
        ? versionIssue("Chrome", chrome, 109, "chrome-version-recommended", "recommended", "推荐版本")
        : null)
    );
  }

  const safari = browserVersion(ua, /Version\/(\d+)(?:\.(\d+))?\s+Safari\//i);
  if (safari !== null && !/(?:Chrome|Chromium|CriOS|FxiOS|Edg|OPR)\//i.test(ua)) {
    return (
      versionIssue("Safari", safari, 15, "safari-version-too-low", "unsupported", "最低支持版本") ??
      (includeRecommended
        ? versionIssue("Safari", safari, 16, "safari-version-recommended", "recommended", "推荐版本", 4)
        : null)
    );
  }

  return null;
}

export function browserCompatReasonFromMessage(message: unknown) {
  const text = String(message || "");
  for (const item of compatibilityPatterns) {
    if (item.pattern.test(text)) {
      return item.code;
    }
  }
  return "";
}

export function getBrowserCompatErrorIssue(error: unknown): BrowserCompatIssue | null {
  const message =
    error instanceof Error
      ? error.message
      : error && typeof error === "object" && "message" in error
        ? String((error as { message?: unknown }).message ?? "")
        : String(error || "");
  const reason = browserCompatReasonFromMessage(message);
  return reason ? { reason, detail: message, mode: "unsupported" } : null;
}

function hasQueryFlag(search: string, name: string) {
  return new RegExp(`(?:^|[?&])${name}(?:=([^&]*))?(?:&|$)`).test(search);
}

export function hasBrowserCompatBypass(search?: string) {
  if (search !== undefined) {
    return hasQueryFlag(search, browserCompatPolicy.bypassQueryKey);
  }
  if (typeof window === "undefined") {
    return false;
  }
  return hasQueryFlag(window.location.search || "", browserCompatPolicy.bypassQueryKey);
}

export function hasBrowserCompatRecommendationAcknowledged() {
  if (typeof window === "undefined") {
    return false;
  }
  try {
    return (
      window.localStorage.getItem(browserCompatPolicy.noticeAckKey) === "1" ||
      window.localStorage.getItem(browserCompatPolicy.recommendedAckKey) === "1"
    );
  } catch {
    return false;
  }
}

export function browserUnsupportedUrl(issue: BrowserCompatIssue, from: string, userAgent: string) {
  const params = new URLSearchParams({
    required: browserCompatPolicy.baselineLabel,
    recommended: browserCompatPolicy.recommendedLabel,
    from,
    reason: issue.reason,
    detail: issue.detail,
    mode: issue.mode ?? "unsupported",
    ua: userAgent,
  });
  return `${browserCompatPolicy.unsupportedPagePath}?${params.toString()}`;
}

export function redirectToBrowserUnsupported(issue?: BrowserCompatIssue | null) {
  if (typeof window === "undefined") {
    return false;
  }

  const href = window.location.href;
  if (href.includes(browserCompatPolicy.unsupportedPagePath)) {
    return false;
  }

  const nextIssue = issue ?? getBrowserCompatIssue(window.navigator.userAgent);
  if (!nextIssue) {
    return false;
  }
  if (
    hasQueryFlag(window.location.search || "", browserCompatPolicy.bypassQueryKey) ||
    hasBrowserCompatRecommendationAcknowledged()
  ) {
    return false;
  }

  window.location.replace(browserUnsupportedUrl(nextIssue, href, window.navigator.userAgent || ""));
  return true;
}

export function buildBrowserCompatGateScript() {
  const policy = browserCompatPolicy;
  const patterns = compatibilityPatterns.map((item) => ({
    code: item.code,
    source: item.pattern.source,
    flags: item.pattern.flags,
  }));

  return `(function(){` +
    `var policy=${JSON.stringify(policy)};` +
    `var patterns=${JSON.stringify(patterns)};` +
    `var href=window.location.href;` +
    `if(href.indexOf(policy.unsupportedPagePath)!==-1){return;}` +
    `function hasQueryFlag(name){` +
      `var search=window.location.search||"";` +
      `var pattern=new RegExp("(?:^|[?&])"+name+"(?:=([^&]*))?(?:&|$)");` +
      `return pattern.test(search);` +
    `}` +
    `function hasNoticeAck(){try{return window.localStorage&&(window.localStorage.getItem(policy.noticeAckKey)==="1"||window.localStorage.getItem(policy.recommendedAckKey)==="1");}catch(error){return false;}}` +
    `function version(ua,pattern){var match=ua.match(pattern);return match&&match[1]?{major:parseInt(match[1],10),minor:match[2]?parseInt(match[2],10):0}:null;}` +
    `function versionText(item){return item.minor?item.major+"."+item.minor:String(item.major);}` +
    `function versionAtLeast(item,major,minor){minor=minor||0;return item.major>major||(item.major===major&&item.minor>=minor);}` +
    `function versionIssue(browser,item,major,reason,mode,label,minor){if(versionAtLeast(item,major,minor)){return null;}var minimum=minor?major+"."+minor:String(major);return{reason:reason,detail:browser+" "+versionText(item)+" 低于"+label+" "+minimum,mode:mode};}` +
    `function browserIssue(ua){` +
      `ua=String(ua||"");` +
      `if(!ua){return null;}` +
      `if(/MSIE\\s|Trident\\//i.test(ua)){return{reason:"internet-explorer",detail:"Internet Explorer 不在支持范围内"};}` +
      `var legacyEdge=version(ua,/Edge\\/(\\d+)/i);` +
      `if(legacyEdge!==null){return{reason:"legacy-edge",detail:"EdgeHTML "+versionText(legacyEdge)+" 不在支持范围内",mode:"unsupported"};}` +
      `var edge=version(ua,/Edg\\/(\\d+)/i);` +
      `if(edge!==null){return versionIssue("Edge",edge,89,"edge-version-too-low","unsupported","最低支持版本")||versionIssue("Edge",edge,109,"edge-version-recommended","recommended","推荐版本");}` +
      `var firefox=version(ua,/Firefox\\/(\\d+)/i);` +
      `if(firefox!==null){return versionIssue("Firefox",firefox,90,"firefox-version-too-low","unsupported","最低支持版本")||versionIssue("Firefox",firefox,115,"firefox-version-recommended","recommended","推荐版本");}` +
      `var chrome=version(ua,/(?:Chrome|Chromium)\\/(\\d+)/i);` +
      `if(chrome!==null&&!/(?:OPR|Edg)\\//i.test(ua)){return versionIssue("Chrome",chrome,89,"chrome-version-too-low","unsupported","最低支持版本")||versionIssue("Chrome",chrome,109,"chrome-version-recommended","recommended","推荐版本");}` +
      `var safari=version(ua,/Version\\/(\\d+)(?:\\.(\\d+))?\\s+Safari\\//i);` +
      `if(safari!==null&&!/(?:Chrome|Chromium|CriOS|FxiOS|Edg|OPR)\\//i.test(ua)){return versionIssue("Safari",safari,15,"safari-version-too-low","unsupported","最低支持版本")||versionIssue("Safari",safari,16,"safari-version-recommended","recommended","推荐版本",4);}` +
      `return null;` +
    `}` +
    `function toReason(message){` +
      `var text=String(message||"");` +
      `for(var i=0;i<patterns.length;i++){` +
        `var item=patterns[i];` +
        `if(new RegExp(item.source,item.flags).test(text)){return item.code;}` +
      `}` +
      `return "";` +
    `}` +
    `function redirect(issue,message){` +
      `var reason=typeof issue==="string"?issue:(issue&&issue.reason)||"unknown";` +
      `var detail=typeof issue==="string"?message:(issue&&issue.detail)||message||"";` +
      `var mode=typeof issue==="string"?"unsupported":(issue&&issue.mode)||"unsupported";` +
      `var target=policy.unsupportedPagePath+"?required="+encodeURIComponent(policy.baselineLabel)+"&recommended="+encodeURIComponent(policy.recommendedLabel)+"&from="+encodeURIComponent(window.location.href)+"&reason="+encodeURIComponent(reason)+"&detail="+encodeURIComponent(String(detail||""))+"&mode="+encodeURIComponent(mode)+"&ua="+encodeURIComponent(window.navigator.userAgent||"");` +
      `window.location.replace(target);` +
    `}` +
    `if(hasQueryFlag(policy.demoQueryKey)){redirect({reason:"demo",detail:"manual-demo",mode:"recommended"});return;}` +
    `var initialIssue=browserIssue(window.navigator.userAgent||"");` +
    `if(initialIssue){if(hasQueryFlag(policy.bypassQueryKey)||hasNoticeAck()){return;}redirect(initialIssue);return;}` +
    `var active=true;` +
    `function cleanup(){` +
      `if(!active){return;}` +
      `active=false;` +
      `window.removeEventListener("error",onError,true);` +
      `window.removeEventListener("unhandledrejection",onRejection,true);` +
      `window.removeEventListener(policy.readyEvent,onReady,true);` +
    `}` +
    `function onReady(){cleanup();}` +
    `function onError(event){` +
      `if(!active){return;}` +
      `var message=(event&&((event.message)|| (event.error&&event.error.message)))||"";` +
      `var reason=toReason(message);` +
      `if(reason){cleanup();redirect({reason:reason,detail:message,mode:"unsupported"});}` +
    `}` +
    `function onRejection(event){` +
      `if(!active){return;}` +
      `var reasonValue=event&&event.reason;` +
      `var message=reasonValue&&reasonValue.message?reasonValue.message:String(reasonValue||"");` +
      `var reason=toReason(message);` +
      `if(reason){cleanup();redirect({reason:reason,detail:message,mode:"unsupported"});}` +
    `}` +
    `window.addEventListener("error",onError,true);` +
    `window.addEventListener("unhandledrejection",onRejection,true);` +
    `window.addEventListener(policy.readyEvent,onReady,true);` +
    `window.setTimeout(cleanup,policy.startupWindowMs);` +
  `})();`;
}
