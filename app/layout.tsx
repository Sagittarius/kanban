import type { Metadata } from "next";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import BrowserCompatReady from "@/components/browser-compat-ready";
import { getAppVersion } from "@/lib/app-meta";
import { buildBrowserCompatGateScript } from "@/lib/browser-compat";
import { buildEarlyDiagnosticsScript } from "@/lib/early-diagnostics";
import "./globals.css";

const browserCompatGate = buildBrowserCompatGateScript();

let cachedModernPolyfillSrc: string | null | undefined;

function resolveModernPolyfillSrc() {
  if (cachedModernPolyfillSrc !== undefined) {
    return cachedModernPolyfillSrc;
  }

  try {
    const assetsDir = join(process.cwd(), "dist", "client", "assets");
    const polyfillFile = readdirSync(assetsDir).find((file) => /^polyfills-.*\.js$/.test(file));
    cachedModernPolyfillSrc = polyfillFile ? `/assets/${polyfillFile}` : null;
  } catch {
    cachedModernPolyfillSrc = null;
  }

  return cachedModernPolyfillSrc;
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
  const modernPolyfillSrc = process.env.NODE_ENV === "production" ? resolveModernPolyfillSrc() : null;
  const earlyDiagnosticsScript = buildEarlyDiagnosticsScript(getAppVersion());

  return (
    <html lang="zh-CN">
      <head>
        <script dangerouslySetInnerHTML={{ __html: earlyDiagnosticsScript }} />
        <script dangerouslySetInnerHTML={{ __html: browserCompatGate }} />
        {modernPolyfillSrc ? <script type="module" src={modernPolyfillSrc} /> : null}
      </head>
      <body>
        <BrowserCompatReady />
        {children}
      </body>
    </html>
  );
}
