import { NextResponse } from "next/server";
import { allowRequest, assertSameOrigin, clientAddress, createSession, ensureBootstrapAdmin, sessionCookie } from "../../../../lib/auth";
import { execute, queryOne, runtimeValue } from "../../../../lib/database";
import { hashPassword, normalizeEmail, randomToken, validEmail, validPassword } from "../../../../lib/security";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const registrationSetting = await queryOne<{ value: string }>("SELECT value FROM app_settings WHERE key = 'registration_enabled' LIMIT 1");
    if (registrationSetting?.value === "0" || (!registrationSetting && runtimeValue("STORMCAST_DISABLE_REGISTRATION") === "1")) {
      return NextResponse.json({ error: "Novos cadastros estão temporariamente fechados." }, { status: 403 });
    }
    if (!allowRequest(`register:${clientAddress(request)}`, 5, 60 * 60_000)) {
      return NextResponse.json({ error: "Limite de cadastros atingido. Tente novamente mais tarde." }, { status: 429 });
    }

    await ensureBootstrapAdmin();
    const body = (await request.json()) as { name?: string; email?: string; password?: string };
    const name = (body.name || "").trim().replace(/\s+/g, " ");
    const email = normalizeEmail(body.email || "");
    const password = body.password || "";

    if (name.length < 2 || name.length > 80) {
      return NextResponse.json({ error: "Informe um nome entre 2 e 80 caracteres." }, { status: 400 });
    }
    if (!validEmail(email)) return NextResponse.json({ error: "Informe um e-mail válido." }, { status: 400 });
    if (!validPassword(password)) {
      return NextResponse.json({ error: "A senha precisa ter ao menos 10 caracteres, com letras e números." }, { status: 400 });
    }

    const duplicate = await queryOne<{ id: string }>("SELECT id FROM users WHERE email = ? LIMIT 1", [email]);
    if (duplicate) return NextResponse.json({ error: "Já existe uma conta com este e-mail." }, { status: 409 });

    const now = Date.now();
    const defaultCreditsSetting = await queryOne<{ value: string }>("SELECT value FROM app_settings WHERE key = 'default_credits' LIMIT 1");
    const defaultCredits = Math.max(0, Math.min(100_000, Math.trunc(Number(defaultCreditsSetting?.value ?? 120) || 120)));
    const user = {
      id: randomToken(16),
      name,
      email,
      role: "user" as const,
      status: "active" as const,
      credits: defaultCredits,
      createdAt: now,
      lastLoginAt: now,
    };
    await execute(
      `INSERT INTO users (id, name, email, password_hash, role, status, credits, created_at, updated_at, last_login_at)
       VALUES (?, ?, ?, ?, 'user', 'active', ?, ?, ?, ?)`,
      [user.id, name, email, await hashPassword(password), defaultCredits, now, now, now],
    );

    const session = await createSession(user.id);
    const response = NextResponse.json({ user }, { status: 201 });
    response.headers.set("Set-Cookie", sessionCookie(session.token, session.expiresAt, request));
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) {
    const message = error instanceof Error && /unique/i.test(error.message)
      ? "Já existe uma conta com este e-mail."
      : "Não foi possível concluir o cadastro.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
