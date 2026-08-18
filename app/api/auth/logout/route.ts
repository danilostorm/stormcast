import { NextResponse } from "next/server";
import { assertSameOrigin, clearSessionCookie, destroySession } from "../../../../lib/auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    await destroySession(request.headers.get("cookie"));
  } catch {
    // Always clear the browser cookie, even if the persisted session is gone.
  }
  const response = NextResponse.json({ ok: true });
  response.headers.set("Set-Cookie", clearSessionCookie(request));
  response.headers.set("Cache-Control", "no-store");
  return response;
}
