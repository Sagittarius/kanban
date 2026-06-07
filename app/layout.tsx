import type { Metadata } from "next";
import "./globals.css";

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
      <body>{children}</body>
    </html>
  );
}
