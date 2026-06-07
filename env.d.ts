declare module "cloudflare:workers" {
  const env: Record<string, unknown>;
}

// Minimal types for Cloudflare Workers runtime
interface Fetcher {
  fetch(request: Request, init?: RequestInit): Promise<Response>;
}

interface D1Result {
  results: Record<string, unknown>[];
  success: boolean;
  meta: Record<string, unknown>;
}

interface D1PreparedStatement {
  bind(...params: unknown[]): D1PreparedStatement;
  all(): Promise<D1Result>;
  raw(): Promise<unknown[][]>;
  first<T extends Record<string, unknown>>(column?: string): Promise<T | null>;
  run(): Promise<D1Result>;
}

interface D1Database {
  prepare(sql: string): D1PreparedStatement;
  batch(statements: D1PreparedStatement[]): Promise<D1Result[]>;
  exec(sql: string): Promise<D1Result>;
}
