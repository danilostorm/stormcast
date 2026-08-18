import { NextResponse } from "next/server";
import { userFromRequest } from "../../../../lib/auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await userFromRequest(request);
  return NextResponse.json({ user }, { status: user ? 200 : 401, headers: { "Cache-Control": "no-store" } });
}
