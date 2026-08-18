import { NextResponse } from "next/server";
import { assertSameOrigin, userFromRequest } from "../../../../lib/auth";
import { execute } from "../../../../lib/database";
import { hashPassword, validPassword } from "../../../../lib/security";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await userFromRequest(request);
    if (!user)
      return NextResponse.json(
        { error: "Faça login novamente." },
        { status: 401 },
      );
    const { password } = (await request.json()) as { password?: string };
    if (!validPassword(password || ""))
      return NextResponse.json(
        { error: "Use ao menos 10 caracteres, com letras e números." },
        { status: 400 },
      );
    await execute(
      "UPDATE users SET password_hash=?,force_password_change=0,updated_at=? WHERE id=?",
      [await hashPassword(password || ""), Date.now(), user.id],
    );
    await execute("DELETE FROM sessions WHERE user_id=?", [user.id]);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { error: "Não foi possível alterar a senha." },
      { status: 400 },
    );
  }
}
