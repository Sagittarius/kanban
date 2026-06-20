declare module "cloudflare:workers" {
  const env: Record<string, unknown>;
}

// Minimal types for Cloudflare Workers runtime
interface Fetcher {
  fetch(request: Request, init?: RequestInit): Promise<Response>;
}
