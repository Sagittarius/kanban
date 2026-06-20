import { NextResponse } from "next/server";
import { ACTIVE_BOARD_COOKIE, expiredCookieOptions, SESSION_COOKIE } from "@/lib/auth";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, "", expiredCookieOptions());
  response.cookies.set(ACTIVE_BOARD_COOKIE, "", expiredCookieOptions());
  return response;
}
