import type { NextConfig } from "next";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: projectRoot,
  allowedDevOrigins: [
    "localhost",
    "127.0.0.1",
    "::1",
    "0.0.0.0",
    "192.168.50.59",
    "192.168.50.71",
    "198.18.0.1",
    "2408:8340:c43:5240:1802:7e99:a087:befa",
    "2408:8340:c43:5240:18b2:caa2:43c7:d565",
  ],
  turbopack: {
    root: projectRoot,
  },
};

export default nextConfig;
