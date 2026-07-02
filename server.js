#!/usr/bin/env node

import http from "node:http";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, symlinkSync } from "node:fs";
import path from "node:path";

const publicPort = Number.parseInt(process.env.PORT || "3000", 10);
const internalPort = Number.parseInt(process.env.KANBAN_INTERNAL_NEXT_PORT || String(publicPort + 1), 10);
const listenHost = process.env.KANBAN_HOST || "0.0.0.0";
const nextHost = "127.0.0.1";
const nextServerPath = resolveNextServerPath();
let shuttingDown = false;

if (!nextServerPath) {
  console.error("[kanban-server] unable to locate Next standalone server.js");
  process.exit(1);
}

ensureLocalStandaloneAssets(nextServerPath);

const child = spawn(process.execPath, [nextServerPath], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    PORT: String(internalPort),
    HOSTNAME: nextHost,
  },
  stdio: "inherit",
});

child.on("exit", (code, signal) => {
  if (shuttingDown) {
    process.exit(0);
  }
  if (signal) {
    console.error(`[kanban-server] Next server exited by signal ${signal}`);
    process.exit(1);
  }
  process.exit(code ?? 1);
});

const server = http.createServer((req, res) => {
  const upstreamHeaders = { ...req.headers, host: `${nextHost}:${internalPort}` };
  delete upstreamHeaders["accept-encoding"];

  const upstream = http.request(
    {
      hostname: nextHost,
      port: internalPort,
      method: req.method,
      path: req.url,
      headers: upstreamHeaders,
    },
    (upstreamRes) => {
      const contentType = String(upstreamRes.headers["content-type"] || "");
      const isHtml = contentType.toLowerCase().includes("text/html");

      if (!isHtml) {
        res.writeHead(upstreamRes.statusCode || 500, upstreamRes.statusMessage, upstreamRes.headers);
        upstreamRes.pipe(res);
        return;
      }

      const chunks = [];
      upstreamRes.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
      upstreamRes.on("end", () => {
        const headers = { ...upstreamRes.headers };
        delete headers["content-length"];
        delete headers["content-encoding"];

        const body = Buffer.concat(chunks).toString("utf8");
        const rewritten = moveDiagnosticsScriptsToHeadStart(body);
        res.writeHead(upstreamRes.statusCode || 500, upstreamRes.statusMessage, headers);
        res.end(rewritten);
      });
    }
  );

  upstream.on("error", (error) => {
    res.writeHead(503, { "content-type": "text/plain; charset=utf-8" });
    res.end(`Kanban server is starting or unavailable: ${error.message}`);
  });

  req.pipe(upstream);
});

server.listen(publicPort, listenHost, () => {
  console.log(`[kanban-server] listening on http://${listenHost}:${publicPort}, proxying Next on ${nextHost}:${internalPort}`);
});

function resolveNextServerPath() {
  const candidates = [
    path.join(process.cwd(), "next-server.js"),
    path.join(process.cwd(), ".next", "standalone", "server.js"),
  ];
  return candidates.find((candidate) => existsSync(candidate));
}

function ensureLocalStandaloneAssets(serverPath) {
  const standaloneDir = path.join(process.cwd(), ".next", "standalone");
  if (path.resolve(serverPath) !== path.resolve(standaloneDir, "server.js")) {
    return;
  }

  ensureSymlink(path.join(standaloneDir, ".next", "static"), path.join("..", "..", "static"));
  ensureSymlink(path.join(standaloneDir, "public"), path.join("..", "..", "public"));
}

function ensureSymlink(linkPath, targetPath) {
  if (existsSync(linkPath)) {
    return;
  }
  mkdirSync(path.dirname(linkPath), { recursive: true });
  symlinkSync(targetPath, linkPath, "dir");
}

function moveDiagnosticsScriptsToHeadStart(html) {
  if (!html.includes("<head") || !html.includes("window.__KANBAN_DIAGNOSTICS__")) {
    return html;
  }

  const selected = [];
  const stripped = html.replace(/<script\b(?![^>]*\bsrc=)[^>]*>[\s\S]*?<\/script>/gi, (tag) => {
    if (tag.includes("self.__next_f.push")) {
      return tag;
    }
    const kind = diagnosticsScriptKind(tag);
    if (!kind) {
      return tag;
    }
    selected.push({ kind, tag });
    return "";
  });

  if (selected.length === 0) {
    return html;
  }

  const rank = { early: 0, core: 1, compat: 2 };
  const scripts = selected
    .sort((a, b) => rank[a.kind] - rank[b.kind])
    .map((item) => item.tag)
    .join("");

  return stripped.replace(/<head([^>]*)>/i, `<head$1>${scripts}`);
}

function diagnosticsScriptKind(tag) {
  if (tag.includes("window.__KANBAN_DIAGNOSTICS__")) {
    return "early";
  }
  if (tag.includes("__core-js_shared__")) {
    return "core";
  }
  if (tag.includes("kanban_browser_recommended_ack") || tag.includes("browser-unsupported.html")) {
    return "compat";
  }
  return "";
}

function shutdown(signal) {
  shuttingDown = true;
  child.kill(signal);
  server.close(() => process.exit(0));
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
