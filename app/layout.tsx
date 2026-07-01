import type { Metadata } from "next";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import BrowserCompatReady from "@/components/browser-compat-ready";
import { buildBrowserCompatGateScript } from "@/lib/browser-compat";
import "./globals.css";

const require = createRequire(import.meta.url);
const coreJsBundlePath = require.resolve("core-js-bundle/minified.js");
const legacyPolyfills = readFileSync(coreJsBundlePath, "utf8");
const browserCompatGate = buildBrowserCompatGateScript();

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
  return (
    <html lang="zh-CN">
      <head>
        <script dangerouslySetInnerHTML={{ __html: browserCompatGate }} />
        <script dangerouslySetInnerHTML={{ __html: legacyPolyfills }} />
      </head>
      <body>
        <BrowserCompatReady />
        {children}
      </body>
    </html>
  );
}
