import { base64UrlDecode, base64UrlEncode } from "@/lib/password";

export const SESSION_COOKIE = "kanban_session";
export const ACTIVE_BOARD_COOKIE = "kanban_active_board";
export const DEFAULT_SESSION_TIMEOUT_SECONDS = 60 * 60 * 24;
export const MAX_SESSION_TIMEOUT_SECONDS = 60 * 60 * 24 * 365;
export const ACTIVE_BOARD_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

type SessionPayload = {
  userId: string;
  exp: number;
  iat: number;
};

const encoder = new TextEncoder();

export async function createSessionToken(userId: string) {
  const now = Math.floor(Date.now() / 1000);
  const payload: SessionPayload = {
    userId,
    iat: now,
    exp: now + sessionMaxAgeSeconds(),
  };
  const body = base64UrlEncode(encoder.encode(JSON.stringify(payload)));
  const signature = await sign(body);
  return `${body}.${signature}`;
}

export async function verifySessionToken(token: string | undefined | null) {
  if (!token || !token.includes(".")) {
    return null;
  }

  const [body, signature] = token.split(".");
  if (!body || !signature) {
    return null;
  }

  const expected = await sign(body);
  if (!constantTimeEqualString(signature, expected)) {
    return null;
  }

  try {
    const payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(body))) as Partial<SessionPayload>;
    if (!payload.userId || typeof payload.exp !== "number") {
      return null;
    }
    if (payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    return { userId: payload.userId };
  } catch {
    return null;
  }
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: cookieSecureEnabled(),
    path: "/",
    maxAge: sessionMaxAgeSeconds(),
  };
}

export function parseSessionTimeoutSeconds(value: string | undefined | null) {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  const match = normalized.match(/^(\d+(?:\.\d+)?)\s*([smhd]?)$/);
  if (!match) {
    return null;
  }

  const amount = Number(match[1]);
  if (!Number.isFinite(amount) || amount <= 0) {
    return null;
  }

  const unitSeconds = {
    "": 1,
    s: 1,
    m: 60,
    h: 60 * 60,
    d: 60 * 60 * 24,
  } as const;
  const seconds = Math.round(amount * unitSeconds[match[2] as keyof typeof unitSeconds]);
  return Math.min(Math.max(1, seconds), MAX_SESSION_TIMEOUT_SECONDS);
}

export function sessionMaxAgeSeconds() {
  const configured = parseSessionTimeoutSeconds(process.env.KANBAN_SESSION_TIMEOUT);
  return configured ?? DEFAULT_SESSION_TIMEOUT_SECONDS;
}

export function activeBoardCookieName(userId: string) {
  const userKey = userId.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 96);
  return `${ACTIVE_BOARD_COOKIE}_${userKey}`;
}

export function activeBoardCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: cookieSecureEnabled(),
    path: "/",
    maxAge: ACTIVE_BOARD_MAX_AGE_SECONDS,
  };
}

export function expiredCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: cookieSecureEnabled(),
    path: "/",
    maxAge: 0,
  };
}

function cookieSecureEnabled() {
  const value = process.env.KANBAN_COOKIE_SECURE;
  if (value === "true") return true;
  if (value === "false") return false;
  return false;
}

async function sign(value: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(getSessionSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(value));
  return base64UrlEncode(new Uint8Array(signature));
}

function getSessionSecret() {
  return (
    process.env.KANBAN_AUTH_SECRET ??
    process.env.AUTH_SECRET ??
    "change-this-secret-before-production-private-kanban"
  );
}

function constantTimeEqualString(left: string, right: string) {
  const leftBytes = encoder.encode(left);
  const rightBytes = encoder.encode(right);
  if (leftBytes.length !== rightBytes.length) {
    return false;
  }
  let diff = 0;
  for (let index = 0; index < leftBytes.length; index += 1) {
    diff |= leftBytes[index] ^ rightBytes[index];
  }
  return diff === 0;
}
