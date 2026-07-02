import type { Metadata } from "next";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import BrowserCompatReady from "@/components/browser-compat-ready";
import { getAppVersion } from "@/lib/app-meta";
import { buildBrowserCompatGateScript } from "@/lib/browser-compat";
import { buildEarlyDiagnosticsScript } from "@/lib/early-diagnostics";
import "./globals.css";

const require = createRequire(import.meta.url);
const browserCompatGate = buildBrowserCompatGateScript();

let cachedCoreJsBundle: string | undefined;

function readCoreJsBundle() {
  if (cachedCoreJsBundle !== undefined) {
    return cachedCoreJsBundle;
  }

  try {
    cachedCoreJsBundle = readFileSync(
      /* turbopackIgnore: true */ join(process.cwd(), "node_modules", "core-js-bundle", "minified.js"),
      "utf8"
    );
  } catch {
    try {
      cachedCoreJsBundle = readFileSync(
        /* turbopackIgnore: true */ join(process.cwd(), "..", "..", "node_modules", "core-js-bundle", "minified.js"),
        "utf8"
      );
    } catch {
      try {
        cachedCoreJsBundle = readFileSync(require.resolve("core-js-bundle/minified.js"), "utf8");
      } catch {
        cachedCoreJsBundle = "";
      }
    }
  }

  return cachedCoreJsBundle;
}

export const metadata: Metadata = {
  title: "项目看板",
  description: "用于项目计划、任务推进和风险跟踪的工作看板。",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const coreJsBundle = readCoreJsBundle();
  const earlyDiagnosticsScript = buildEarlyDiagnosticsScript(getAppVersion());

  return (
    <html lang="zh-CN">
      <head>
        <script dangerouslySetInnerHTML={{ __html: earlyDiagnosticsScript }} />
        {coreJsBundle ? <script dangerouslySetInnerHTML={{ __html: coreJsBundle }} /> : null}
        <script dangerouslySetInnerHTML={{ __html: browserCompatGate }} />
      </head>
      <body>
        <BrowserCompatReady />
        {children}
      </body>
    </html>
  );
}
