export const browserCompatPolicy = {
  baselineLabel: "Chrome 89+ / Edge 89+ / Firefox 90+ / Safari 15+",
  unsupportedPagePath: "/browser-unsupported.html",
  demoQueryKey: "compat_demo",
  bypassQueryKey: "compat_bypass",
  readyEvent: "kanban:compat-ready",
  startupWindowMs: 12000,
} as const;

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
    `if(hasQueryFlag(policy.bypassQueryKey)){return;}` +
    `function toReason(message){` +
      `var text=String(message||"");` +
      `for(var i=0;i<patterns.length;i++){` +
        `var item=patterns[i];` +
        `if(new RegExp(item.source,item.flags).test(text)){return item.code;}` +
      `}` +
      `return "";` +
    `}` +
    `function redirect(reason,message){` +
      `var target=policy.unsupportedPagePath+"?required="+encodeURIComponent(policy.baselineLabel)+"&from="+encodeURIComponent(window.location.href)+"&reason="+encodeURIComponent(reason||"unknown")+"&detail="+encodeURIComponent(String(message||""))+"&ua="+encodeURIComponent(window.navigator.userAgent||"");` +
      `window.location.replace(target);` +
    `}` +
    `if(hasQueryFlag(policy.demoQueryKey)){redirect("demo","manual-demo");return;}` +
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
      `if(reason){cleanup();redirect(reason,message);}` +
    `}` +
    `function onRejection(event){` +
      `if(!active){return;}` +
      `var reasonValue=event&&event.reason;` +
      `var message=reasonValue&&reasonValue.message?reasonValue.message:String(reasonValue||"");` +
      `var reason=toReason(message);` +
      `if(reason){cleanup();redirect(reason,message);}` +
    `}` +
    `window.addEventListener("error",onError,true);` +
    `window.addEventListener("unhandledrejection",onRejection,true);` +
    `window.addEventListener(policy.readyEvent,onReady,true);` +
    `window.setTimeout(cleanup,policy.startupWindowMs);` +
  `})();`;
}
