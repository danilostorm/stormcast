import { NextResponse } from "next/server";
import {
  allowRequest,
  assertSameOrigin,
  authenticate,
  clientAddress,
  createSession,
  sessionCookie,
} from "../../../../lib/auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    if (!allowRequest(`login:${clientAddress(request)}`)) {
      return NextResponse.json({ error: "Muitas tentativas. Aguarde alguns minutos e tente novamente." }, { status: 429 });
    }

    const body = (await request.json()) as { email?: string; password?: string };
    const result = await authenticate(body.email || "", body.password || "");
    if (!result) return NextResponse.json({ error: "E-mail ou senha incorretos." }, { status: 401 });
    if ("suspended" in result) return NextResponse.json({ error: "Esta conta está suspensa. Fale com o administrador." }, { status: 403 });

    const session = await createSession(result.user.id);
    const response = NextResponse.json({ user: result.user });
    response.headers.set("Set-Cookie", sessionCookie(session.token, session.expiresAt, request));
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch {
    return NextResponse.json({ error: "Não foi possível entrar agora." }, { status: 400 });
  }
}
